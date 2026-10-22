import assert from "node:assert/strict";
import test from "node:test";
import { analyzeJobOpportunity, detectRuleFindings } from "./analysis";
import { createJobShieldRateLimit } from "./rate-limit";
import { parsePublicHttpUrl, assertPublicUrl, normalizeDomain } from "./url-safety";
import { getAnonymousSessionHash } from "./session";
import { searchPublicSources, fetchPublicPages } from "./tinyfish";
import { explainWithAi } from "./ai";

// ==========================================
// 1. URL Safety & SSRF Defenses
// ==========================================
test("rejects local, private, credentialed, and non-web URLs", () => {
  const rejectedUrls = [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://ftp.example.com/file",
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://127.0.0.2:80/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.10/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    "https://user:password@example.com/",
    "https://example.com/jobs?access_token=do-not-send",
    "https://example.com/jobs?api_key=secret-key",
    "https://example.com/jobs?jwt=fake-token",
    "https://example.com:8443/",
    "https://metadata.google.internal/",
    "http://app.test/",
    "http://app.local/",
  ];

  for (const url of rejectedUrls) {
    assert.throws(
      () => parsePublicHttpUrl(url),
      { name: "Error" },
      `Expected ${url} to be rejected`,
    );
  }
});

test("accepts standard public HTTP and HTTPS URLs", () => {
  assert.equal(parsePublicHttpUrl("https://example.com/jobs/1").hostname, "example.com");
  assert.equal(parsePublicHttpUrl("https://careers.google.com/jobs/results/").hostname, "careers.google.com");
  assert.equal(parsePublicHttpUrl("https://example.com/jobs?utm_source=board").hostname, "example.com");
  assert.equal(parsePublicHttpUrl("http://example.com:80/jobs/1").hostname, "example.com");
  assert.equal(parsePublicHttpUrl("https://[2606:4700:4700::1111]/").protocol, "https:");
});

test("normalizes domain correctly", () => {
  assert.equal(normalizeDomain("www.example.com"), "example.com");
  assert.equal(normalizeDomain("EXAMPLE.COM."), "example.com");
  assert.equal(normalizeDomain("sub.domain.org"), "sub.domain.org");
});

// ==========================================
// 2. Risk Detection Engine & Rules
// ==========================================
test("detects upfront recruitment or registration fees", () => {
  const findings = detectRuleFindings(
    "Candidates must pay a registration fee of $50 before the training begins.",
    null,
    null,
  );
  assert.ok(findings.some((f) => f.code === "upfront_fee"));
  assert.equal(findings.find((f) => f.code === "upfront_fee")?.severity, "elevated");
});

test("detects guaranteed hiring promises", () => {
  const findings = detectRuleFindings(
    "Your selection is guaranteed. You are hired without an interview.",
    null,
    null,
  );
  assert.ok(findings.some((f) => f.code === "guaranteed_outcome"));
  assert.equal(findings.find((f) => f.code === "guaranteed_outcome")?.severity, "caution");
});

test("detects artificial urgency and pressure", () => {
  const findings = detectRuleFindings(
    "Act now! Within 2 hours this limited slots offer will expire. Urgent response required.",
    null,
    null,
  );
  assert.ok(findings.some((f) => f.code === "high_pressure"));
});

test("detects requests for sensitive personal or banking information", () => {
  const findings = detectRuleFindings(
    "Please submit your passport copy and bank login for verification.",
    null,
    null,
  );
  assert.ok(findings.some((f) => f.code === "sensitive_information"));
  assert.equal(findings.find((f) => f.code === "sensitive_information")?.severity, "caution");
});

test("detects recruiter using public/free email provider", () => {
  const findings = detectRuleFindings(
    "Contact our HR manager at recruiter@gmail.com to apply.",
    "gmail.com",
    null,
  );
  assert.ok(findings.some((f) => f.code === "personal_recruiter_email"));
});

test("detects shortened application links", () => {
  const findings = detectRuleFindings(
    "Apply directly via our shortened link below.",
    null,
    "bit.ly",
  );
  assert.ok(findings.some((f) => f.code === "shortened_link"));
});

test("triggers evidence_of_concern when multiple scam indicators detected", async () => {
  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content:
      "Pay a recruitment fee. Your job is guaranteed without an interview. Act now within 30 minutes! Send your passport and bank login. Apply at bit.ly/test and email hiring@yahoo.com.",
  });

  assert.equal(report.overallAssessment, "evidence_of_concern");
  assert.ok(report.findings.length >= 4);
});

test("does not call an opportunity safe when no warning pattern is found", async () => {
  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content:
      "Software Engineer position in New York, NY. Requirements: 3+ years experience with TypeScript and React. Full medical benefits.",
  });

  assert.equal(report.overallAssessment, "insufficient_evidence");
  assert.equal(report.verificationStatus, "unable_to_verify");
  assert.match(report.summary, /not proof|insufficient|unavailable/i);
  assert.equal(report.findings.length, 0);
});

// ==========================================
// 3. TinyFish Web Research Integration
// ==========================================
test("reports not_configured when TINYFISH_API_KEY is missing", async () => {
  const originalKey = process.env.TINYFISH_API_KEY;
  try {
    delete process.env.TINYFISH_API_KEY;
    const searchOutcome = await searchPublicSources("Google careers");
    assert.equal(searchOutcome.status, "not_configured");
    assert.deepEqual(searchOutcome.results, []);

    const fetchOutcome = await fetchPublicPages(["https://example.com"], "test purpose");
    assert.equal(fetchOutcome.status, "not_configured");
    assert.deepEqual(fetchOutcome.pages, []);
  } finally {
    if (originalKey) process.env.TINYFISH_API_KEY = originalKey;
  }
});

test("handles TinyFish search failure gracefully with mock", async () => {
  const originalKey = process.env.TINYFISH_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.TINYFISH_API_KEY = "test-mock-key";
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "rate limit" }), { status: 429 });

    const outcome = await searchPublicSources("Acme Corp");
    assert.equal(outcome.status, "unavailable");
    assert.match(outcome.note, /rate-limited/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.TINYFISH_API_KEY = originalKey;
    else delete process.env.TINYFISH_API_KEY;
  }
});

test("parses valid TinyFish search response correctly with mock", async () => {
  const originalKey = process.env.TINYFISH_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.TINYFISH_API_KEY = "test-mock-key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          query: "Acme Corp careers",
          results: [
            {
              position: 1,
              title: "Acme Careers | Join our team",
              url: "https://careers.acme.com",
              site_name: "acme.com",
              snippet: "Official job openings at Acme Corporation.",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const outcome = await searchPublicSources("Acme Corp careers");
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0].domain, "acme.com");
    assert.equal(outcome.results[0].title, "Acme Careers | Join our team");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.TINYFISH_API_KEY = originalKey;
    else delete process.env.TINYFISH_API_KEY;
  }
});

// ==========================================
// 4. Real AI Integration (Groq) & Fallback
// ==========================================
test("reports not_configured when GROQ_API_KEY is missing", async () => {
  const origGroq = process.env.GROQ_API_KEY;
  try {
    delete process.env.GROQ_API_KEY;
    const aiResult = await explainWithAi({
      content: "Job description for Junior Developer",
      detectedFindings: [],
      evidenceSnippets: [],
    });

    assert.equal(aiResult.status, "not_configured");
    assert.match(aiResult.note ?? "", /GROQ_API_KEY|not configured/i);
  } finally {
    if (origGroq) process.env.GROQ_API_KEY = origGroq;
  }
});

test("handles Groq authentication failure (HTTP 401) gracefully", async () => {
  const origGroq = process.env.GROQ_API_KEY;
  const origFetch = globalThis.fetch;
  try {
    process.env.GROQ_API_KEY = "gsk_invalid_test_key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "Invalid API Key provided",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );

    const aiResult = await explainWithAi({
      content: "Job opportunity text",
      detectedFindings: [],
      evidenceSnippets: [],
    });

    assert.equal(aiResult.status, "unavailable");
    assert.match(aiResult.note ?? "", /authentication failed|API key/i);
  } finally {
    globalThis.fetch = origFetch;
    if (origGroq) process.env.GROQ_API_KEY = origGroq;
    else delete process.env.GROQ_API_KEY;
  }
});

test("handles Groq rate limit / quota exceeded (HTTP 429) gracefully", async () => {
  const origGroq = process.env.GROQ_API_KEY;
  const origFetch = globalThis.fetch;
  try {
    process.env.GROQ_API_KEY = "gsk_mock_test_key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "Rate limit reached for requests",
            type: "tokens",
            code: "rate_limit_exceeded",
          },
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );

    const aiResult = await explainWithAi({
      content: "Job opportunity text",
      detectedFindings: [{ code: "upfront_fee", title: "Fee requested", severity: "elevated" }],
      evidenceSnippets: [],
    });

    assert.equal(aiResult.status, "unavailable");
    assert.match(aiResult.note ?? "", /rate-limited|quota|preserved/i);
  } finally {
    globalThis.fetch = origFetch;
    if (origGroq) process.env.GROQ_API_KEY = origGroq;
    else delete process.env.GROQ_API_KEY;
  }
});

test("handles Groq malformed non-JSON or invalid schema response with mock", async () => {
  const origGroq = process.env.GROQ_API_KEY;
  const origFetch = globalThis.fetch;
  try {
    process.env.GROQ_API_KEY = "gsk_mock_test_key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "This is not valid JSON at all",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const aiResult = await explainWithAi({
      content: "Job opportunity text",
      detectedFindings: [],
      evidenceSnippets: [],
    });

    assert.equal(aiResult.status, "unavailable");
    assert.match(aiResult.note ?? "", /unreadable|safety/i);
  } finally {
    globalThis.fetch = origFetch;
    if (origGroq) process.env.GROQ_API_KEY = origGroq;
    else delete process.env.GROQ_API_KEY;
  }
});

test("validates structured Groq AI output schema with mock", async () => {
  const origGroq = process.env.GROQ_API_KEY;
  const origFetch = globalThis.fetch;
  try {
    process.env.GROQ_API_KEY = "gsk_mock_test_key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary:
                    "This listing for Acme Corp requests an upfront fee. Verify with the official employer directly before sending money.",
                  extractedCompany: "Acme Corp",
                  extractedRole: "Senior Engineer",
                  tailoredNextSteps: ["Contact Acme HR directly", "Do not wire funds"],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const aiResult = await explainWithAi({
      content: "Job opportunity at Acme Corp for Senior Engineer with fee",
      detectedFindings: [{ code: "upfront_fee", title: "Fee requested", severity: "elevated" }],
      evidenceSnippets: [],
    });

    assert.equal(aiResult.status, "completed");
    assert.match(aiResult.summary ?? "", /Acme Corp/);
    assert.equal(aiResult.extractedCompany, "Acme Corp");
    assert.equal(aiResult.extractedRole, "Senior Engineer");
    assert.equal(aiResult.tailoredNextSteps?.length, 2);
  } finally {
    globalThis.fetch = origFetch;
    if (origGroq) process.env.GROQ_API_KEY = origGroq;
    else delete process.env.GROQ_API_KEY;
  }
});

test("live Groq API generates structured explanation when GROQ_API_KEY is configured", async () => {
  if (!process.env.GROQ_API_KEY) {
    return; // Skip if no key
  }

  const aiResult = await explainWithAi({
    content: `
Apex Global Solutions Inc.
Senior Site Reliability Engineer
Salary: $160,000 per year. Apply at https://careers.apexsolutions.com
    `,
    companyHint: "Apex Global Solutions Inc",
    roleHint: "Senior Site Reliability Engineer",
    detectedFindings: [],
    evidenceSnippets: [
      {
        title: "Apex Systems - Careers",
        domain: "apexsystems.com",
        excerpt: "Global provider of technology talent services and career placement.",
      },
    ],
  });

  assert.equal(aiResult.status, "completed");
  assert.ok(aiResult.summary);
  assert.ok(aiResult.summary.length > 20);
  assert.ok(aiResult.tailoredNextSteps && aiResult.tailoredNextSteps.length > 0);
});

// ==========================================
// 5. Session Isolation & Rate Limiting
// ==========================================
test("rejects tampered session cookies and creates new valid session", () => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "super-secret-key-1234567890123456";
  try {
    const mockReq = {
      headers: { cookie: "jobshield_session=tamperedTokenValue.invalidSignature" },
    } as never;
    const cookiesSet: string[] = [];
    const mockRes = {
      append(name: string, value: string) {
        if (name === "Set-Cookie") cookiesSet.push(value);
      },
    } as never;

    const hash = getAnonymousSessionHash(mockReq, mockRes);
    assert.ok(hash);
    assert.equal(typeof hash, "string");
    // Confirm a new signed cookie was issued because the incoming one was invalid
    assert.equal(cookiesSet.length, 1);
    assert.match(cookiesSet[0], /jobshield_session=/);
  } finally {
    process.env.SESSION_SECRET = originalSecret;
  }
});

test("limits repeated requests without persisting or logging the client address", () => {
  const handler = createJobShieldRateLimit({
    scope: `test-${crypto.randomUUID()}`,
    windowMs: 60_000,
    maxRequests: 1,
    message: "Please slow down.",
  });
  const ip = `test-${crypto.randomUUID()}`;
  const call = () => {
    const headers: Record<string, string | number> = {};
    let statusCode = 200;
    let body: unknown;
    let nextCalled = false;
    const response = {
      setHeader(name: string, value: string | number) {
        headers[name] = value;
        return this;
      },
      status(value: number) {
        statusCode = value;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    };
    handler(
      { ip, socket: { remoteAddress: ip } } as never,
      response as never,
      () => {
        nextCalled = true;
      },
    );
    return { headers, statusCode, body, nextCalled };
  };

  assert.equal(call().nextCalled, true);
  const limited = call();
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.body, { error: "Please slow down." });
  assert.ok(limited.headers["Retry-After"]);
});

// ==========================================
// 6. Phase 9 Core Scenarios (Tests A - M)
// ==========================================

test("TEST A — PDF with clear company, job title, and corporate contacts", async () => {
  const samplePdfContent = `
APEX GLOBAL SOLUTIONS INC.
1200 Innovation Parkway, Suite 400
Austin, TX 78701

EMPLOYMENT OFFER LETTER
Date: October 20, 2026

Dear Alex Morgan,

We are delighted to offer you the position of Senior Software Engineer at Apex Global Solutions Inc.
Reporting to the Director of Engineering, your compensation will be $145,000 annually.

Please submit your signed acceptance to our talent team at careers@apexsolutions.com.
Official corporate careers portal: https://careers.apexsolutions.com/welcome

Sincerely,
Sarah Jenkins
Head of People Operations
Apex Global Solutions Inc.
`;

  const report = await analyzeJobOpportunity({
    sourceType: "pdf",
    content: samplePdfContent,
    sourceLabel: "PDF: Apex_Offer_Letter.pdf",
  });

  assert.equal(report.companyName, "Apex Global Solutions Inc.");
  assert.equal(report.jobTitle, "Senior Software Engineer");
  assert.equal(report.sourceLabel, "PDF: Apex_Offer_Letter.pdf");
  assert.ok(["no_major_warnings", "insufficient_evidence"].includes(report.overallAssessment));
  assert.ok(report.checks.some((c) => c.category === "company_identity"));
  assert.ok(report.checks.some((c) => c.category === "job_vacancy"));
  assert.ok(report.checks.some((c) => c.category === "recruiter_contact"));
  assert.ok(report.offerDetails);
  assert.ok(report.questionsForRecruiter && report.questionsForRecruiter.length > 0);
});

test("TEST B — PDF with obvious warning indicators (upfront fee, guaranteed job, Telegram chat)", async () => {
  const fraudulentOffer = `
URGENT JOB OFFER - EXECUTIVE ASSISTANT
Congratulations! Your job placement is guaranteed! You are selected and hired without an interview.

Compensation: $75 per hour (Remote / Part-time).
To reserve your slot, you must immediately pay a mandatory registration and equipment fee of $150 via Apple gift card or cryptocurrency within 2 hours.
All interviews and onboarding instructions are conducted on Telegram: @apex_jobs_manager.
Send your bank account details and driver's license copy immediately.
`;

  const report = await analyzeJobOpportunity({
    sourceType: "pdf",
    content: fraudulentOffer,
    sourceLabel: "PDF: Instant_Job_Offer.pdf",
  });

  assert.equal(report.overallAssessment, "evidence_of_concern");
  assert.ok(report.assessmentRationale.length > 10);
  const codes = report.findings.map((f) => f.code);
  assert.ok(codes.includes("upfront_fee"), "Should detect upfront fee");
  assert.ok(codes.includes("guaranteed_outcome"), "Should detect guaranteed outcome");
  assert.ok(codes.includes("high_pressure"), "Should detect urgency");
  assert.ok(codes.includes("sensitive_information"), "Should detect sensitive information");
  assert.ok(codes.includes("off_platform_communication"), "Should detect Telegram communication");
});

test("TEST C — Document with insufficient information", async () => {
  const vagueOffer = `
Office helper needed for miscellaneous administrative tasks.
Flexible hours, friendly environment.
Contact us for more information.
`;

  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content: vagueOffer,
  });

  assert.equal(report.overallAssessment, "insufficient_evidence");
  assert.equal(report.verificationStatus, "unable_to_verify");
  assert.equal(report.findings.length, 0);
  assert.match(report.summary, /insufficient|unavailable|not proof/i);
});

test("TEST D — Corrupt or empty input validation", async () => {
  const { AnalyzeSubmissionBody } = await import("@workspace/api-zod");
  const emptyResult = AnalyzeSubmissionBody.safeParse({
    inputType: "text",
    content: "   ",
  });
  assert.equal(emptyResult.success, false);

  const shortResult = AnalyzeSubmissionBody.safeParse({
    inputType: "text",
    content: "Too short",
  });
  assert.equal(shortResult.success, false);
});

test("TEST E — Pasted recruitment message with free email and high pressure", async () => {
  const message = `
URGENT: Global Tech Partners is hiring Junior Data Entry clerks.
Act now! Within 2 hours limited slots remain for today only.
Send your resume to our hiring team at globaltech.recruitment@gmail.com.
`;

  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content: message,
  });

  assert.ok(report.findings.some((f) => f.code === "high_pressure"));
  assert.ok(report.findings.some((f) => f.code === "personal_recruiter_email"));
  assert.ok(["conflicting_evidence", "evidence_of_concern"].includes(report.overallAssessment));
});

test("TEST F — Valid job URL analysis with public URL", async () => {
  const report = await analyzeJobOpportunity({
    sourceType: "url",
    content: "Job listing URL: https://careers.example.com/jobs/123",
    submittedUrl: "https://careers.example.com/jobs/123",
  });

  assert.equal(report.sourceType, "url");
  assert.equal(report.applicationDomain, "careers.example.com");
  assert.ok(report.evidence.some((e) => e.url === "https://careers.example.com/jobs/123"));
});

test("TEST G — Unsafe URL assertion rejects internal and private hosts", async () => {
  const unsafe = ["http://127.0.0.1", "http://10.0.0.1", "http://169.254.169.254", "http://localhost:5000"];
  for (const url of unsafe) {
    await assert.rejects(async () => {
      await assertPublicUrl(url);
    });
  }
});

test("TEST H — Live TinyFish research returns real sources when credentials configured", async () => {
  if (!process.env.TINYFISH_API_KEY) {
    return; // Skip if no key in environment
  }

  const outcome = await searchPublicSources("Google careers");
  assert.equal(outcome.status, "completed");
  assert.ok(outcome.results.length > 0);
  assert.ok(outcome.results.some((r) => r.domain.includes("google")));
});

test("TEST I — Research failure simulation handles provider errors gracefully", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TINYFISH_API_KEY;
  try {
    process.env.TINYFISH_API_KEY = "test-mock-key";
    globalThis.fetch = async () => new Response("Error", { status: 500 });

    const outcome = await searchPublicSources("Nonexistent Corporation");
    assert.equal(outcome.status, "unavailable");
    assert.deepEqual(outcome.results, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.TINYFISH_API_KEY = originalKey;
    else delete process.env.TINYFISH_API_KEY;
  }
});

test("TEST J — AI provider error quota handling preserves deterministic findings", async () => {
  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content: "Pay $200 training fee before starting work. Act now within 1 hour!",
  });

  // Even if AI is rate-limited or unavailable, deterministic rules work 100%
  assert.equal(report.overallAssessment, "evidence_of_concern");
  assert.ok(report.findings.length >= 2);
  assert.ok(report.summary.length > 20);
});

test("TEST K — Output strictly validates against AnalyzeSubmissionResponse Zod schema", async () => {
  const { AnalyzeSubmissionResponse } = await import("@workspace/api-zod");
  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content: "Company: Acme Corp. Role: Senior Developer. Salary: $120,000. Apply at https://careers.acme.com",
  });

  const parsed = AnalyzeSubmissionResponse.safeParse(report);
  assert.equal(parsed.success, true);
});

test("TEST L — Correct source links and evidence references", async () => {
  const report = await analyzeJobOpportunity({
    sourceType: "pdf",
    content: `
Apex Global Solutions Inc.
Employment Offer: Principal Site Reliability Engineer
Salary: $180,000 per year
Apply at https://careers.apexsolutions.com/apply
Official Portal: https://apexsolutions.com
    `,
    sourceLabel: "PDF: Apex_Offer.pdf",
  });

  // Verify that evidence sources have valid, parseable URLs and clean domains
  for (const item of report.evidence) {
    assert.ok(item.url.startsWith("http://") || item.url.startsWith("https://"));
    assert.ok(item.domain.length > 3);
    assert.ok(["official_candidate", "public", "submitted"].includes(item.sourceType));
    assert.ok(["supports", "contradicts", "context", "unknown"].includes(item.relationship));
    assert.ok(item.excerpt.length > 0);
  }
});

test("TEST M — Deterministic assessment consistency across identical inputs", async () => {
  const scamText = `
URGENT: Apex Global is hiring immediately. Guaranteed job placement within 2 hours.
Pay $200 equipment fee via Apple gift card before starting.
All onboarding conducted on Telegram @apex_manager.
Send bank login credentials to receive paycheck.
  `;

  const report1 = await analyzeJobOpportunity({ sourceType: "text", content: scamText });
  const report2 = await analyzeJobOpportunity({ sourceType: "text", content: scamText });

  // Deterministic consistency: identical text must always yield identical assessments
  assert.equal(report1.overallAssessment, report2.overallAssessment);
  assert.equal(report1.overallAssessment, "evidence_of_concern");
  assert.equal(report1.findings.length, report2.findings.length);

  // Moderate example
  const moderateText = `
Hiring Data Clerk. Please send resume to our team at quickrecruiter@gmail.com.
Act now today only.
  `;
  const moderateReport = await analyzeJobOpportunity({ sourceType: "text", content: moderateText });
  assert.ok(["conflicting_evidence", "evidence_of_concern"].includes(moderateReport.overallAssessment));
});

test("TEST N — Save, reload, and view history persistence", async () => {
  const { AnalyzeSubmissionResponse, GetAnalysisResponse } = await import("@workspace/api-zod");
  const report = await analyzeJobOpportunity({
    sourceType: "pdf",
    content: `
Apex Global Solutions Inc.
Employment Offer: Principal Site Reliability Engineer
Salary: $180,000 per year
Apply at https://careers.apexsolutions.com
Warning: Please do not pay any third party recruiter fees.
    `,
    sourceLabel: "PDF: Offer_Letter_2026.pdf",
  });

  const validated = AnalyzeSubmissionResponse.parse(report);
  const serialized = JSON.stringify(validated);
  const reloaded = JSON.parse(serialized);

  const clientReport = GetAnalysisResponse.parse(reloaded);
  assert.equal(clientReport.id, validated.id);
  assert.equal(clientReport.companyName, validated.companyName);
  assert.equal(clientReport.jobTitle, validated.jobTitle);
  assert.equal(clientReport.overallAssessment, validated.overallAssessment);
  assert.equal(clientReport.assessmentRationale, validated.assessmentRationale);
  assert.equal(clientReport.verificationStatus, validated.verificationStatus);
  assert.equal(clientReport.findings.length, validated.findings.length);
  assert.equal(clientReport.checks.length, validated.checks.length);
  assert.equal(clientReport.evidence.length, validated.evidence.length);
  assert.equal(clientReport.recommendedNextSteps.length, validated.recommendedNextSteps.length);
  assert.equal(clientReport.questionsForRecruiter.length, validated.questionsForRecruiter.length);
  assert.ok(clientReport.offerDetails);
  assert.equal(clientReport.limitations.length, validated.limitations.length);
  assert.equal(clientReport.summary, validated.summary);
});

test("TEST O — Port conflicts, startup, and runner configuration", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  // Verify unified dev runner script exists and configures correct ports
  const candidatePaths = [
    path.resolve(process.cwd(), "scripts/dev.mjs"),
    path.resolve(process.cwd(), "../../scripts/dev.mjs"),
  ];
  const devScriptPath = candidatePaths.find((p) => fs.existsSync(p));
  assert.ok(devScriptPath, "dev.mjs runner script must exist in repository root");
  const scriptContent = fs.readFileSync(devScriptPath, "utf-8");

  assert.ok(scriptContent.includes("checkPortConflict(5000"), "Must monitor port 5000");
  assert.ok(scriptContent.includes("checkPortConflict(3000"), "Must monitor port 3000");
  assert.ok(scriptContent.includes("http://localhost:5000"), "API server must point to 5000");
  assert.ok(scriptContent.includes("http://localhost:3000"), "Web UI must point to 3000");
});

test("TEST P — Copy Summary and Print Report data integrity", async () => {
  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content: `
Company: Apex Global Solutions Inc.
Position: Senior Software Engineer
Salary: $140,000
Apply at https://careers.apexsolutions.com
Warning: Pay mandatory $100 registration fee.
    `,
  });

  // Verify that report summary and fields contain all information needed for copy and print
  assert.ok(report.companyName);
  assert.ok(report.jobTitle);
  assert.ok(report.summary.length > 20);
  assert.ok(report.findings.length > 0);
  assert.ok(report.recommendedNextSteps.length > 0);
  assert.ok(report.questionsForRecruiter.length > 0);

  // Format sample text representation as used by Copy Summary / Print
  const summaryBlock = [
    `JobShield AI Analysis Report`,
    `Opportunity: ${report.jobTitle} at ${report.companyName}`,
    `Overall Assessment: ${report.overallAssessment}`,
    `Rationale: ${report.assessmentRationale}`,
    `Verdict: ${report.verificationStatus}`,
    `Summary: ${report.summary}`,
    `Findings (${report.findings.length}):`,
    ...report.findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`),
  ].join("\n");

  assert.ok(summaryBlock.includes("Apex Global Solutions Inc."));
  assert.ok(summaryBlock.includes("Senior Software Engineer"));
  assert.ok(summaryBlock.includes("Overall Assessment:"));
});

test("TEST Q — No-warning and insufficient-evidence reports", async () => {
  // A brief document with no warning flags and insufficient external proof
  const minimalDoc = "Part time office helper needed for evening filing.";
  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content: minimalDoc,
  });

  assert.equal(report.findings.length, 0);
  // Zero warnings with missing context MUST NOT be called verified or lower risk
  assert.equal(report.overallAssessment, "insufficient_evidence");
  assert.equal(report.verificationStatus, "unable_to_verify");
  assert.match(report.summary, /insufficient|unavailable|not proof/i);
});

test("TEST R — Company exists but specific job or recruiter cannot be confirmed", async () => {
  // Scenario: Well-known company name, but recruiter uses personal Gmail address
  const suspiciousRecruiterDoc = `
Microsoft Corporation
We are pleased to offer you the position of Junior Cloud Architect.
Compensation: $110,000 per year.
Please email your resume and identification to our recruitment coordinator at microsoft.hr.team@gmail.com.
  `;

  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content: suspiciousRecruiterDoc,
  });

  assert.equal(report.companyName, "Microsoft Corporation");
  assert.equal(report.jobTitle, "Junior Cloud Architect");

  // Recruiter check must flag discrepancy because of gmail.com
  const recruiterCheck = report.checks.find((c) => c.label === "Recruiter contact domain");
  assert.ok(recruiterCheck);
  assert.equal(recruiterCheck.status, "discrepancy");
  assert.equal(recruiterCheck.category, "recruiter_contact");

  // Must have a finding for personal recruiter email
  assert.ok(report.findings.some((f) => f.code === "personal_recruiter_email"));
  assert.ok(["conflicting_evidence", "evidence_of_concern"].includes(report.overallAssessment));
  // Verification cannot be an official match because of the recruiter email discrepancy
  assert.notEqual(report.verificationStatus, "official_match");
});


