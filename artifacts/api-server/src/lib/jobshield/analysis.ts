import { randomUUID } from "node:crypto";
import { AnalyzeSubmissionResponse } from "@workspace/api-zod";
import {
  fetchPublicPages,
  searchPublicSources,
  type PublicSearchResult,
} from "./tinyfish";
import { normalizeDomain } from "./url-safety";

type SourceType = "url" | "text" | "pdf";
type AnalysisReport = ReturnType<typeof AnalyzeSubmissionResponse.parse>;

type AnalyzeJobInput = {
  sourceType: SourceType;
  content: string;
  sourceLabel?: string;
  submittedUrl?: string;
  companyHint?: string;
  roleHint?: string;
};

type RuleFinding = {
  code: string;
  title: string;
  severity: "info" | "caution" | "elevated";
  description: string;
  whyItMatters: string;
  recommendedAction: string;
  points: number;
};

const METHODOLOGY_VERSION = "jobshield-rules-1.0";
const MAX_CONTENT_LENGTH = 50_000;
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
]);

function cleanText(value: string | undefined, maxLength: number): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return cleaned || null;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function labelValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const expression = new RegExp(
      `(?:^|\\n)\\s*(?:${label})\\s*[:\\-–]\\s*([^\\n]{2,120})`,
      "i",
    );
    const match = text.match(expression);
    if (match?.[1]) return cleanText(match[1], 120);
  }
  return null;
}

function inferCompanyName(
  text: string,
  companyHint?: string,
): string | null {
  const supplied = cleanText(companyHint, 120);
  if (supplied) return supplied;

  const labeled = labelValue(text, ["company", "employer", "organization"]);
  if (labeled) return labeled;

  const titleLine = text.match(
    /(?:^|\n)\s*([^\n]{2,100}?)\s+(?:at|@)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,4})(?:\s*(?:\||$|\n))/,
  );
  if (titleLine?.[2]) return cleanText(titleLine[2], 120);

  const hiringLine = text.match(
    /\b(?:hiring|careers at|join)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,4})\b/,
  );
  return hiringLine?.[1] ? cleanText(hiringLine[1], 120) : null;
}

function inferJobTitle(text: string, roleHint?: string): string | null {
  const supplied = cleanText(roleHint, 120);
  if (supplied) return supplied;
  return labelValue(text, ["job title", "position", "role", "opening"]);
}

function extractEmailDomain(text: string): string | null {
  const match = text.match(
    /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>)"']{1,2048}/i);
  if (!match?.[0]) return null;
  try {
    return new URL(match[0]).toString();
  } catch {
    return null;
  }
}

export function detectRuleFindings(
  text: string,
  emailDomain: string | null,
  applicationHost: string | null,
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const add = (finding: RuleFinding) => {
    if (!findings.some((item) => item.code === finding.code)) {
      findings.push(finding);
    }
  };

  if (
    /\b(?:registration|recruitment|interview|security|processing|placement|training)\s+(?:fee|charge)\b|\bpay\s+(?:a|the)\s+(?:fee|deposit)\b|\b(?:deposit|upfront payment)\s+(?:is|required|before)\b/i.test(
      text,
    )
  ) {
    add({
      code: "upfront_fee",
      title: "Payment requested before employment",
      severity: "elevated",
      description:
        "The submitted content mentions a recruitment, registration, interview, training, or other upfront payment.",
      whyItMatters:
        "Requests for money before a job begins are a serious warning signal and should be checked independently.",
      recommendedAction:
        "Do not pay yet. Contact the employer through a phone number or careers page you find independently.",
      points: 38,
    });
  }

  if (
    /\b(?:guaranteed|guarantee)\s+(?:job|placement|offer|selection|employment)\b|\b(?:job|offer|placement)\s+(?:is\s+)?guaranteed\b|\b(?:selected|hired)\s+without\s+(?:an?\s+)?interview\b/i.test(
      text,
    )
  ) {
    add({
      code: "guaranteed_outcome",
      title: "Guaranteed hiring or placement claim",
      severity: "caution",
      description:
        "The message promises a job, offer, or placement as guaranteed.",
      whyItMatters:
        "Guaranteed outcomes can be used to rush applicants past normal verification.",
      recommendedAction:
        "Verify the role and hiring process with the employer using an independently found official channel.",
      points: 18,
    });
  }

  if (
    /\b(?:act now|immediately|within \d+\s*(?:hours?|minutes?)|today only|limited slots|last chance|urgent response)\b/i.test(
      text,
    )
  ) {
    add({
      code: "high_pressure",
      title: "Pressure to act quickly",
      severity: "caution",
      description:
        "The message uses urgency or a short deadline to encourage a quick decision.",
      whyItMatters:
        "Pressure can make it harder to check a recruiter, link, or payment request carefully.",
      recommendedAction:
        "Pause and verify the opportunity before sharing documents or making a payment.",
      points: 12,
    });
  }

  if (
    /\b(?:passport|social security|national id|aadhaar|bank login|online banking password|card pin)\b/i.test(
      text,
    )
  ) {
    add({
      code: "sensitive_information",
      title: "Sensitive personal or financial information mentioned",
      severity: "caution",
      description:
        "The submitted text refers to identity documents or financial credentials.",
      whyItMatters:
        "Sensitive data should only be shared after the recipient and purpose have been verified.",
      recommendedAction:
        "Do not send account passwords, PINs, or identity documents to an unverified contact.",
      points: 22,
    });
  }

  if (emailDomain && FREE_EMAIL_DOMAINS.has(emailDomain)) {
    add({
      code: "personal_recruiter_email",
      title: "Recruiter contact uses a public email provider",
      severity: "caution",
      description: `The submitted contact address uses ${emailDomain}, which is a public email service.`,
      whyItMatters:
        "A public mailbox does not establish that the sender represents the named employer.",
      recommendedAction:
        "Confirm the recruiter's identity through the employer's official website or careers team.",
      points: 10,
    });
  }

  if (
    applicationHost &&
    /^(?:bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|ow\.ly)$/i.test(
      normalizeDomain(applicationHost),
    )
  ) {
    add({
      code: "shortened_link",
      title: "Application link uses a URL shortener",
      severity: "caution",
      description:
        "The supplied application link hides its final destination behind a URL shortener.",
      whyItMatters:
        "A shortened link makes it harder to see which site will receive your information.",
      recommendedAction:
        "Open the employer's careers page independently and find the vacancy there.",
      points: 12,
    });
  }

  return findings;
}

function candidateCompanyDomain(
  companyName: string | null,
  searchResults: PublicSearchResult[],
): string | null {
  if (!companyName) return null;
  const companyTokens = normalizeForMatch(companyName)
    .split(" ")
    .filter((token) => token.length > 2);
  const careerResult = searchResults.find((result) => {
    const candidate = `${result.title} ${result.domain} ${result.url}`;
    const normalized = normalizeForMatch(candidate);
    return (
      /career|job|vacan|opening/i.test(candidate) &&
      companyTokens.some((token) => normalized.includes(token))
    );
  });
  return careerResult ? normalizeDomain(careerResult.domain) : null;
}

function excerpt(text: string, maxLength = 700): string {
  return text
    .replace(/[#>*_`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function analyzeJobOpportunity(
  input: AnalyzeJobInput,
): Promise<AnalysisReport> {
  const sourceText = input.content.trim().slice(0, MAX_CONTENT_LENGTH);
  const companyName = inferCompanyName(sourceText, input.companyHint);
  const jobTitle = inferJobTitle(sourceText, input.roleHint);
  const sourceUrl = input.submittedUrl ?? extractFirstUrl(sourceText);
  let applicationDomain: string | null = null;
  if (sourceUrl) {
    try {
      applicationDomain = normalizeDomain(new URL(sourceUrl).hostname);
    } catch {
      applicationDomain = null;
    }
  }

  const searchQuery = companyName
    ? `${companyName} official careers ${jobTitle ?? ""}`.trim()
    : applicationDomain
      ? `site:${applicationDomain} jobs careers`
      : "";

  const search = searchQuery
    ? await searchPublicSources(searchQuery)
    : {
        status: "unavailable" as const,
        results: [],
        note: "A company or public website could not be identified for research.",
      };

  const candidateUrls = [
    ...(input.submittedUrl ? [input.submittedUrl] : []),
    ...search.results.slice(0, 3).map((result) => result.url),
  ];
  const fetched = candidateUrls.length
    ? await fetchPublicPages(
        candidateUrls,
        "Compare public job and company claims with a submitted job opportunity.",
      )
    : {
        status: search.status,
        pages: [],
        note: search.note,
      };

  const retrievedAt = new Date();
  const fetchedByUrl = new Map(
    fetched.pages.map((page) => [new URL(page.url).toString(), page]),
  );
  const evidence = [];
  const seenUrls = new Set<string>();

  for (const result of search.results) {
    const normalizedUrl = new URL(result.url).toString();
    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);
    const page = fetchedByUrl.get(normalizedUrl);
    const combinedText = `${result.title} ${result.domain} ${result.snippet} ${page?.text ?? ""}`;
    const domain = normalizeDomain(result.domain);
    const normalizedCompany = companyName
      ? normalizeForMatch(companyName)
      : "";
    const isCareerCandidate =
      /career|job|vacan|opening/i.test(`${result.title} ${result.url}`) &&
      Boolean(
        normalizedCompany &&
          normalizeForMatch(`${result.title} ${domain}`).includes(
            normalizedCompany,
          ),
      );
    evidence.push({
      url: normalizedUrl,
      title: result.title,
      domain,
      sourceType: isCareerCandidate
        ? ("official_candidate" as const)
        : ("public" as const),
      excerpt: excerpt(page?.text || result.snippet || result.title),
      retrievedAt,
      relationship: "unknown" as const,
    });
  }

  if (input.submittedUrl && !seenUrls.has(input.submittedUrl)) {
    const submittedPage = fetchedByUrl.get(new URL(input.submittedUrl).toString());
    if (submittedPage) {
      evidence.unshift({
        url: new URL(input.submittedUrl).toString(),
        title: submittedPage.title,
        domain: normalizeDomain(new URL(input.submittedUrl).hostname),
        sourceType: "submitted" as const,
        excerpt: excerpt(submittedPage.text),
        retrievedAt,
        relationship: "unknown" as const,
      });
    }
  }

  const findings = detectRuleFindings(
    sourceText,
    extractEmailDomain(sourceText),
    applicationDomain,
  );
  const riskScore = Math.min(
    100,
    findings.reduce((total, finding) => total + finding.points, 0),
  );
  const riskLevel =
    riskScore >= 50
      ? "elevated"
      : riskScore >= 20
        ? "moderate"
        : evidence.length === 0
          ? "insufficient_evidence"
          : "lower";
  const allSourceText = evidence
    .map((item) => `${item.title} ${item.excerpt}`)
    .join(" ");
  const companyMentioned =
    Boolean(companyName) &&
    normalizeForMatch(allSourceText).includes(normalizeForMatch(companyName!));
  const roleMentioned =
    Boolean(jobTitle) &&
    normalizeForMatch(allSourceText).includes(normalizeForMatch(jobTitle!));
  const verificationStatus =
    evidence.length === 0
      ? "unable_to_verify"
      : companyMentioned && roleMentioned
        ? "partial_match"
        : search.status === "completed"
          ? "no_match"
          : "unable_to_verify";
  const likelyCareerDomain = candidateCompanyDomain(
    companyName,
    search.results,
  );

  const checks = [
    {
      label: "Company name in public sources",
      status: companyMentioned
        ? ("partial" as const)
        : evidence.length
          ? ("unable_to_verify" as const)
          : ("unable_to_verify" as const),
      submittedValue: companyName,
      observedValue: companyMentioned ? companyName : null,
      explanation: companyMentioned
        ? "The name appears in a public search result. This is a lead, not independent proof of identity."
        : "Available public sources did not confirm the submitted company name.",
    },
    {
      label: "Job title in public sources",
      status: roleMentioned
        ? ("partial" as const)
        : evidence.length
          ? ("unable_to_verify" as const)
          : ("unable_to_verify" as const),
      submittedValue: jobTitle,
      observedValue: roleMentioned ? jobTitle : null,
      explanation: roleMentioned
        ? "The title appears in a public source, but the vacancy and recruiter still need independent verification."
        : "No matching title was confirmed in the retrieved public excerpts.",
    },
    {
      label: "Application website",
      status: applicationDomain
        ? likelyCareerDomain && likelyCareerDomain === applicationDomain
          ? ("match" as const)
          : likelyCareerDomain
            ? ("partial" as const)
            : ("unable_to_verify" as const)
        : ("unable_to_verify" as const),
      submittedValue: applicationDomain,
      observedValue: likelyCareerDomain,
      explanation: applicationDomain
        ? likelyCareerDomain && likelyCareerDomain === applicationDomain
          ? "The submitted link uses the same domain as a careers-page candidate found in public search. This does not authenticate the recruiter."
          : likelyCareerDomain
            ? "The submitted host differs from a careers-page candidate. Some legitimate employers use external hiring platforms."
            : "No likely company careers domain was identified for comparison."
        : "No application website was present in the submitted content.",
    },
  ];

  const riskSummary =
    findings.length > 0
      ? `The checks found ${findings.length} explicit warning signal${findings.length === 1 ? "" : "s"}. Review the evidence and verify the recruiter independently before paying or sharing sensitive information.`
      : "No explicit warning patterns were found in the submitted material. This is not proof that the opportunity or recruiter is genuine.";
  const researchStatus =
    search.status === "not_configured"
      ? "not_configured"
      : search.status === "unavailable" && fetched.status !== "completed"
        ? "unavailable"
        : search.results.length > 0 || fetched.pages.length > 0
          ? "completed"
          : search.status === "completed"
            ? "completed"
            : "partial";
  const limitations = [
    "The risk score is a versioned rule-based indicator, not a probability or a verdict.",
    "A legitimate company can be impersonated. This report does not authenticate a recruiter or guarantee a job is genuine.",
    "Search results are public-source leads. Search ranking and a matching company name are not proof of identity.",
    ...(researchStatus === "not_configured"
      ? ["Live web research is not configured; only deterministic checks were performed."]
      : researchStatus === "unavailable"
        ? ["Live web research was unavailable; findings may be incomplete."]
        : []),
    ...(search.results.length === 0 && search.status === "completed"
      ? ["The search returned no relevant sources. No match does not mean fraud is confirmed."]
      : []),
  ];

  const report = {
    id: randomUUID(),
    createdAt: new Date(),
    sourceType: input.sourceType,
    sourceLabel:
      input.sourceType === "url" && input.submittedUrl
        ? `Job listing on ${applicationDomain ?? "public website"}`
        : input.sourceType === "pdf"
          ? "Uploaded PDF text"
          : cleanText(input.sourceLabel, 180) ?? "Pasted job opportunity",
    companyName,
    jobTitle,
    companyDomain: likelyCareerDomain,
    applicationDomain,
    riskScore,
    riskLevel,
    verificationStatus,
    summary:
      researchStatus === "unavailable"
        ? `${riskSummary} Live web research did not complete, so public-source comparisons are unavailable.`
        : riskSummary,
    findings: findings.map(({ points: _points, ...finding }) => ({
      ...finding,
      evidenceUrl: null,
    })),
    evidence,
    checks,
    recommendedNextSteps: [
      "Find the employer's official careers page independently and check whether the role is listed.",
      "Contact the company through a phone number or email address published on its official website.",
      "Do not pay recruitment, registration, interview, or training fees until the opportunity is independently verified.",
      "Do not share identity documents, account passwords, or financial credentials with an unverified contact.",
    ],
    limitations,
    researchStatus,
    aiStatus: "not_configured",
    methodologyVersion: METHODOLOGY_VERSION,
  };

  return AnalyzeSubmissionResponse.parse(report);
}

export function buildCompanySearchResponse(
  query: string,
  results: PublicSearchResult[],
  status: "completed" | "not_configured" | "unavailable",
  note: string,
) {
  return {
    query,
    results,
    retrievedAt: new Date(),
    status,
    note,
  };
}
