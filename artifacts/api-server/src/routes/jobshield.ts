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
  await db
    .delete(jobShieldAnalysesTable)
    .where(lte(jobShieldAnalysesTable.expiresAt, new Date()));
}

async function saveReport(
  sessionHash: string,
  report: ReturnType<typeof AnalyzeSubmissionResponse.parse>,
): Promise<void> {
  const now = new Date();
  await db.insert(jobShieldAnalysesTable).values({
    id: report.id,
    sessionHash,
    sourceType: report.sourceType,
    sourceLabel: report.sourceLabel,
    companyName: report.companyName,
    jobTitle: report.jobTitle,
    riskScore: report.riskScore,
    riskLevel: report.riskLevel,
    verificationStatus: report.verificationStatus,
    findingCount: report.findings.length,
    report: JSON.parse(JSON.stringify(report)) as Record<string, unknown>,
    expiresAt: new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
  });
}

function toSummary(
  row: typeof jobShieldAnalysesTable.$inferSelect,
) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    sourceType: row.sourceType,
    sourceLabel: row.sourceLabel,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    riskScore: row.riskScore,
    riskLevel: row.riskLevel,
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
    await saveReport(sessionHash, validated);
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
    await saveReport(sessionHash, validated);
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
    const rows = await db
      .select()
      .from(jobShieldAnalysesTable)
      .where(and(...filters))
      .orderBy(desc(jobShieldAnalysesTable.createdAt))
      .limit(limit);
    response.json(ListAnalysesResponse.parse(rows.map(toSummary)));
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
    if (!row) {
      response.status(404).json({ error: "This analysis was not found in this browser session." });
      return;
    }
    response.json(reportForClient(row.report));
  } catch (error) {
    handleFailure(request, response, error);
  }
});

router.delete("/analyses/clear", async (request, response): Promise<void> => {
  const sessionHash = requireSession(request, response);
  if (!sessionHash) return;

  try {
    await db
      .delete(jobShieldAnalysesTable)
      .where(eq(jobShieldAnalysesTable.sessionHash, sessionHash));
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
    const [deleted] = await db
      .delete(jobShieldAnalysesTable)
      .where(
        and(
          eq(jobShieldAnalysesTable.id, parsed.data.id),
          eq(jobShieldAnalysesTable.sessionHash, sessionHash),
        ),
      )
      .returning({ id: jobShieldAnalysesTable.id });
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
    const filter = and(
      eq(jobShieldAnalysesTable.sessionHash, sessionHash),
      gt(jobShieldAnalysesTable.expiresAt, new Date()),
    );
    const [totalRow] = await db
      .select({ value: count() })
      .from(jobShieldAnalysesTable)
      .where(filter);
    const [elevatedRow] = await db
      .select({ value: count() })
      .from(jobShieldAnalysesTable)
      .where(and(filter, eq(jobShieldAnalysesTable.riskLevel, "elevated")));
    const recentRows = await db
      .select()
      .from(jobShieldAnalysesTable)
      .where(filter)
      .orderBy(desc(jobShieldAnalysesTable.createdAt))
      .limit(5);
    response.json(
      GetDashboardSummaryResponse.parse({
        totalAnalyses: totalRow?.value ?? 0,
        elevatedCount: elevatedRow?.value ?? 0,
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
