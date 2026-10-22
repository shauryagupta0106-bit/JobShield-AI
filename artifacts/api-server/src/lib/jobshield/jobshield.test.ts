import assert from "node:assert/strict";
import test from "node:test";
import { analyzeJobOpportunity } from "./analysis";
import { createJobShieldRateLimit } from "./rate-limit";
import { parsePublicHttpUrl } from "./url-safety";

test("rejects local, private, credentialed, and non-web URLs", () => {
  const rejectedUrls = [
    "javascript:alert(1)",
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.10/",
    "http://[::1]/",
    "https://user:password@example.com/",
    "https://example.com/jobs?access_token=do-not-send",
    "https://example.com:8443/",
    "https://metadata.google.internal/",
  ];

  for (const url of rejectedUrls) {
    assert.throws(() => parsePublicHttpUrl(url), { name: "Error" }, url);
  }
});

test("accepts standard public HTTP and HTTPS URLs", () => {
  assert.equal(parsePublicHttpUrl("https://example.com/jobs/1").hostname, "example.com");
  assert.equal(parsePublicHttpUrl("https://example.com/jobs?utm_source=board").hostname, "example.com");
  assert.equal(parsePublicHttpUrl("http://example.com:80/jobs/1").hostname, "example.com");
  assert.equal(parsePublicHttpUrl("https://[2606:4700:4700::1111]/").protocol, "https:");
});

test("reports explicit rule matches without treating them as a verdict", async () => {
  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content:
      "Pay a registration fee before joining. You have a guaranteed job. Act within 2 hours. Send your passport.",
  });

  assert.equal(report.riskScore, 90);
  assert.equal(report.riskLevel, "elevated");
  assert.deepEqual(
    report.findings.map((finding) => finding.code),
    ["upfront_fee", "guaranteed_outcome", "high_pressure", "sensitive_information"],
  );
  assert.match(report.summary, /warning signal/i);
  assert.match(report.summary, /verify the recruiter independently/i);
  assert.equal(report.aiStatus, "not_configured");
  assert.equal(report.researchStatus, "unavailable");
});

test("does not call an opportunity safe when no warning pattern is found", async () => {
  const report = await analyzeJobOpportunity({
    sourceType: "text",
    content:
      "The full-time role includes daily duties, paid leave, health coverage, and a fixed schedule.",
  });

  assert.equal(report.riskScore, 0);
  assert.equal(report.riskLevel, "insufficient_evidence");
  assert.equal(report.verificationStatus, "unable_to_verify");
  assert.match(report.summary, /not proof/i);
  assert.equal(report.findings.length, 0);
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
