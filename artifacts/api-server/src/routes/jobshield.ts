import { Router, type IRouter, type Request, type Response } from "express";
import { and, count, desc, eq, gt, ilike, lte, or } from "drizzle-orm";
import {
  AnalyzeSubmissionBody,
  AnalyzeSubmissionResponse,
  AnalyzeUrlBody,
  AnalyzeUrlResponse,
  ClearAnalysesResponse,
  DeleteAnalysisParams,
  GetAnalysisParams,
  GetAnalysisResponse,
  GetDashboardSummaryResponse,
  ListAnalysesQueryParams,
  ListAnalysesResponse,
  SearchCompanySourcesQueryParams,
  SearchCompanySourcesResponse,
} from "@workspace/api-zod";
import { db, jobShieldAnalysesTable } from "@workspace/db";
import {
  analyzeJobOpportunity,
  buildCompanySearchResponse,
} from "../lib/jobshield/analysis";
import { searchPublicSources } from "../lib/jobshield/tinyfish";
import { assertPublicUrl } from "../lib/jobshield/url-safety";
import { getAnonymousSessionHash } from "../lib/jobshield/session";
import { createJobShieldRateLimit } from "../lib/jobshield/rate-limit";

const router: IRouter = Router();
const RETENTION_DAYS = 30;

const limitAnalysis = createJobShieldRateLimit({
  scope: "analysis",
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: "Too many analyses were submitted from this connection. Please try again later.",
});

const limitSearch = createJobShieldRateLimit({
  scope: "search",
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  message: "Too many public-source searches were submitted. Please try again later.",
});

router.use((_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// In-memory fallback store to ensure seamless local resilience when database is temporarily offline or undergoing migration
type SessionAnalysisRecord = {
  id: string;
  sessionHash: string;
  sourceType: "url" | "text" | "pdf";
  sourceLabel: string;
  companyName: string | null;
  jobTitle: string | null;
  overallAssessment:
    | "evidence_of_concern"
    | "conflicting_evidence"
    | "no_major_warnings"
    | "insufficient_evidence";
  assessmentRationale: string;
  verificationStatus:
    | "official_match"
    | "partial_match"
    | "no_match"
    | "unable_to_verify"
    | "material_discrepancy";
  findingCount: number;
  report: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
};

const memoryStore = new Map<string, SessionAnalysisRecord>();

function requireSession(
  request: Request,
  response: Response,
): string | null {
  const sessionHash = getAnonymousSessionHash(request, response);
  if (!sessionHash) {
    response.status(503).json({
      error: "Private session history is unavailable. Please try again later.",
    });
    return null;
  }
  return sessionHash;
}

async function purgeExpiredAnalyses(): Promise<void> {
  const now = new Date();
  for (const [id, item] of memoryStore.entries()) {
    if (item.expiresAt <= now) {
      memoryStore.delete(id);
    }
  }

  try {
    await db
      .delete(jobShieldAnalysesTable)
      .where(lte(jobShieldAnalysesTable.expiresAt, now));
  } catch {
    // Database cleanup is best-effort and must not fail user requests
  }
}

async function saveReport(
  sessionHash: string,
  report: ReturnType<typeof AnalyzeSubmissionResponse.parse>,
  request: Request,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const plainReport = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;

  // Always store in session cache
  memoryStore.set(report.id, {
    id: report.id,
    sessionHash,
    sourceType: report.sourceType,
    sourceLabel: report.sourceLabel,
    companyName: report.companyName ?? null,
    jobTitle: report.jobTitle ?? null,
    overallAssessment: report.overallAssessment,
    assessmentRationale: report.assessmentRationale,
    verificationStatus: report.verificationStatus,
    findingCount: report.findings.length,
    report: plainReport,
    createdAt: now,
    expiresAt,
  });

  // Attempt database persistence
  try {
    await db.insert(jobShieldAnalysesTable).values({
      id: report.id,
      sessionHash,
      sourceType: report.sourceType,
      sourceLabel: report.sourceLabel,
      companyName: report.companyName,
      jobTitle: report.jobTitle,
      overallAssessment: report.overallAssessment,
      assessmentRationale: report.assessmentRationale,
      verificationStatus: report.verificationStatus,
      findingCount: report.findings.length,
      report: plainReport,
      createdAt: now,
      expiresAt,
    });
  } catch (dbError) {
    request.log.warn(
      { err: dbError },
      "Database insert unavailable; report preserved in session store.",
    );
  }
}

function toSummary(
  row:
    | typeof jobShieldAnalysesTable.$inferSelect
    | SessionAnalysisRecord,
) {
  let assessment:
    | "evidence_of_concern"
    | "conflicting_evidence"
    | "no_major_warnings"
    | "insufficient_evidence" = "insufficient_evidence";

  if ("overallAssessment" in row && row.overallAssessment) {
    assessment = row.overallAssessment as typeof assessment;
  } else if ("riskLevel" in row && row.riskLevel) {
    if (row.riskLevel === "elevated") assessment = "evidence_of_concern";
    else if (row.riskLevel === "moderate") assessment = "conflicting_evidence";
    else if (row.riskLevel === "lower") assessment = "no_major_warnings";
    else assessment = "insufficient_evidence";
  }

  let rationale = ("assessmentRationale" in row ? row.assessmentRationale : null) || "";
  if (!rationale) {
    rationale =
      assessment === "evidence_of_concern"
        ? "Warning signals detected in opportunity."
        : assessment === "conflicting_evidence"
          ? "Conflicting or unverified claims detected."
          : assessment === "no_major_warnings"
            ? "No major warnings detected in the checks performed."
            : "Insufficient evidence to assess.";
  }

  return {
    id: row.id,
    createdAt: row.createdAt,
    sourceType: row.sourceType,
    sourceLabel: row.sourceLabel,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    overallAssessment: assessment,
    assessmentRationale: rationale,
    verificationStatus: row.verificationStatus,
    findingCount: row.findingCount,
  };
}

function reportForClient(value: unknown) {
  return GetAnalysisResponse.parse(value);
}

function handleFailure(request: Request, response: Response, error: unknown) {
  request.log.error({ err: error }, "JobShield request failed");
  if (!response.headersSent) {
    response.status(503).json({
      error: "JobShield could not complete this request. Please try again.",
    });
  }
}

router.post("/analyze", limitAnalysis, async (request, response): Promise<void> => {
  const parsed = AnalyzeSubmissionBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter at least 20 characters of job information." });
    return;
  }

  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    await purgeExpiredAnalyses();
    const report = await analyzeJobOpportunity({
      sourceType: parsed.data.inputType,
      content: parsed.data.content,
      sourceLabel: parsed.data.sourceLabel,
      companyHint: parsed.data.companyHint,
      roleHint: parsed.data.roleHint,
    });
    const validated = AnalyzeSubmissionResponse.parse(report);
    await saveReport(sessionHash, validated, request);
    response.status(200).json(validated);
  } catch (error) {
    handleFailure(request, response, error);
  }
});

router.post("/analyze-url", limitAnalysis, async (request, response): Promise<void> => {
  const parsed = AnalyzeUrlBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid public job listing URL." });
    return;
  }

  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    const safeUrl = await assertPublicUrl(parsed.data.url);
    await purgeExpiredAnalyses();
    const report = await analyzeJobOpportunity({
      sourceType: "url",
      content: `Job listing URL: ${safeUrl.toString()}`,
      submittedUrl: safeUrl.toString(),
      companyHint: parsed.data.companyHint,
      roleHint: parsed.data.roleHint,
    });
    const validated = AnalyzeUrlResponse.parse(report);
    await saveReport(sessionHash, validated, request);
    response.status(200).json(validated);
  } catch (error) {
    if (error instanceof Error && /public|valid|resolve|supported/i.test(error.message)) {
      response.status(400).json({ error: error.message });
      return;
    }
    handleFailure(request, response, error);
  }
});

router.get("/analyses", async (request, response): Promise<void> => {
  const parsed = ListAnalysesQueryParams.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: "The history search or limit is invalid." });
    return;
  }
  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    await purgeExpiredAnalyses();
    const { q, limit } = parsed.data;

    let dbRows: Array<typeof jobShieldAnalysesTable.$inferSelect> = [];
    let dbSuccess = false;

    try {
      const filters = [
        eq(jobShieldAnalysesTable.sessionHash, sessionHash),
        gt(jobShieldAnalysesTable.expiresAt, new Date()),
      ];
      if (q?.trim()) {
        const pattern = `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`;
        filters.push(
          or(
            ilike(jobShieldAnalysesTable.sourceLabel, pattern),
            ilike(jobShieldAnalysesTable.companyName, pattern),
            ilike(jobShieldAnalysesTable.jobTitle, pattern),
          )!,
        );
      }
      dbRows = await db
        .select()
        .from(jobShieldAnalysesTable)
        .where(and(...filters))
        .orderBy(desc(jobShieldAnalysesTable.createdAt))
        .limit(limit);
      dbSuccess = true;
    } catch {
      dbSuccess = false;
    }

    if (dbSuccess && dbRows.length > 0) {
      response.json(ListAnalysesResponse.parse(dbRows.map(toSummary)));
      return;
    }

    // Fall back to memoryStore for this session if database query was empty or offline
    const now = new Date();
    const qLower = q?.trim().toLowerCase();
    const memRows = Array.from(memoryStore.values())
      .filter((item) => {
        if (item.sessionHash !== sessionHash || item.expiresAt <= now) return false;
        if (!qLower) return true;
        return (
          item.sourceLabel.toLowerCase().includes(qLower) ||
          (item.companyName && item.companyName.toLowerCase().includes(qLower)) ||
          (item.jobTitle && item.jobTitle.toLowerCase().includes(qLower))
        );
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    response.json(ListAnalysesResponse.parse(memRows.map(toSummary)));
  } catch (error) {
    handleFailure(request, response, error);
  }
});

router.get("/analyses/:id", async (request, response): Promise<void> => {
  const parsed = GetAnalysisParams.safeParse(request.params);
  if (!parsed.success) {
    response.status(400).json({ error: "The analysis ID is invalid." });
    return;
  }
  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    await purgeExpiredAnalyses();

    // First try database
    try {
      const [row] = await db
        .select()
        .from(jobShieldAnalysesTable)
        .where(
          and(
            eq(jobShieldAnalysesTable.id, parsed.data.id),
            eq(jobShieldAnalysesTable.sessionHash, sessionHash),
            gt(jobShieldAnalysesTable.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (row) {
        response.json(reportForClient(row.report));
        return;
      }
    } catch {
      // Continue to check memoryStore
    }

    // Check memoryStore
    const memItem = memoryStore.get(parsed.data.id);
    if (
      memItem &&
      memItem.sessionHash === sessionHash &&
      memItem.expiresAt > new Date()
    ) {
      response.json(reportForClient(memItem.report));
      return;
    }

    response.status(404).json({ error: "This analysis was not found in this browser session." });
  } catch (error) {
    handleFailure(request, response, error);
  }
});

router.delete("/analyses/clear", async (request, response): Promise<void> => {
  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    for (const [id, item] of memoryStore.entries()) {
      if (item.sessionHash === sessionHash) {
        memoryStore.delete(id);
      }
    }

    try {
      await db
        .delete(jobShieldAnalysesTable)
        .where(eq(jobShieldAnalysesTable.sessionHash, sessionHash));
    } catch {
      // Best-effort database deletion
    }

    response.status(204).json(ClearAnalysesResponse.parse(undefined));
  } catch (error) {
    handleFailure(request, response, error);
  }
});

router.delete("/analyses/:id", async (request, response): Promise<void> => {
  const parsed = DeleteAnalysisParams.safeParse(request.params);
  if (!parsed.success) {
    response.status(400).json({ error: "The analysis ID is invalid." });
    return;
  }
  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    let deleted = false;
    const memItem = memoryStore.get(parsed.data.id);
    if (memItem && memItem.sessionHash === sessionHash) {
      memoryStore.delete(parsed.data.id);
      deleted = true;
    }

    try {
      const [dbDeleted] = await db
        .delete(jobShieldAnalysesTable)
        .where(
          and(
            eq(jobShieldAnalysesTable.id, parsed.data.id),
            eq(jobShieldAnalysesTable.sessionHash, sessionHash),
          ),
        )
        .returning({ id: jobShieldAnalysesTable.id });
      if (dbDeleted) deleted = true;
    } catch {
      // Best-effort database deletion
    }

    if (!deleted) {
      response.status(404).json({ error: "This analysis was not found in this browser session." });
      return;
    }
    response.status(204).end();
  } catch (error) {
    handleFailure(request, response, error);
  }
});

router.get("/dashboard", async (request, response): Promise<void> => {
  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    await purgeExpiredAnalyses();

    let total = 0;
    let elevated = 0;
    let recentRows: Array<typeof jobShieldAnalysesTable.$inferSelect> = [];
    let dbSuccess = false;

    try {
      const filter = and(
        eq(jobShieldAnalysesTable.sessionHash, sessionHash),
        gt(jobShieldAnalysesTable.expiresAt, new Date()),
      );
      const [totalRow] = await db
        .select({ value: count() })
        .from(jobShieldAnalysesTable)
        .where(filter);
      const [concernRow] = await db
        .select({ value: count() })
        .from(jobShieldAnalysesTable)
        .where(
          and(
            filter,
            or(
              eq(jobShieldAnalysesTable.overallAssessment, "evidence_of_concern"),
              eq(jobShieldAnalysesTable.riskLevel, "elevated"),
            ),
          ),
        );
      recentRows = await db
        .select()
        .from(jobShieldAnalysesTable)
        .where(filter)
        .orderBy(desc(jobShieldAnalysesTable.createdAt))
        .limit(5);

      total = totalRow?.value ?? 0;
      elevated = concernRow?.value ?? 0;
      dbSuccess = true;
    } catch {
      dbSuccess = false;
    }

    if (!dbSuccess || (total === 0 && memoryStore.size > 0)) {
      const now = new Date();
      const memItems = Array.from(memoryStore.values()).filter(
        (item) => item.sessionHash === sessionHash && item.expiresAt > now,
      );
      total = Math.max(total, memItems.length);
      elevated = Math.max(
        elevated,
        memItems.filter((item) => item.overallAssessment === "evidence_of_concern").length,
      );
      const memRecent = memItems
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
        .map(toSummary);

      response.json(
        GetDashboardSummaryResponse.parse({
          totalAnalyses: total,
          concernCount: elevated,
          recentAnalyses: memRecent,
        }),
      );
      return;
    }

    response.json(
      GetDashboardSummaryResponse.parse({
        totalAnalyses: total,
        concernCount: elevated,
        recentAnalyses: recentRows.map(toSummary),
      }),
    );
  } catch (error) {
    handleFailure(request, response, error);
  }
});

router.get("/companies/search", limitSearch, async (request, response): Promise<void> => {
  const parsed = SearchCompanySourcesQueryParams.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a company or role to search for." });
    return;
  }
  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    const outcome = await searchPublicSources(parsed.data.query);
    const result = SearchCompanySourcesResponse.parse(
      buildCompanySearchResponse(
        parsed.data.query,
        outcome.results,
        outcome.status,
        outcome.note,
      ),
    );
    response.json(result);
  } catch (error) {
    handleFailure(request, response, error);
  }
});

export default router;
