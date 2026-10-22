import { randomUUID } from "node:crypto";
import { AnalyzeSubmissionResponse } from "@workspace/api-zod";
import {
  fetchPublicPages,
  searchPublicSources,
  type PublicSearchResult,
} from "./tinyfish";
import { normalizeDomain, parsePublicHttpUrl } from "./url-safety";
import { explainWithAi } from "./ai";

type SourceType = "url" | "text" | "pdf";
type AnalysisReport = ReturnType<typeof AnalyzeSubmissionResponse.parse>;

export type AnalyzeJobInput = {
  sourceType: SourceType;
  content: string;
  sourceLabel?: string;
  submittedUrl?: string;
  companyHint?: string;
  roleHint?: string;
};

export type RuleFinding = {
  code: string;
  title: string;
  severity: "info" | "caution" | "elevated";
  description: string;
  whyItMatters: string;
  recommendedAction: string;
  evidenceUrl?: string | null;
  evidenceExcerpt?: string | null;
};

const METHODOLOGY_VERSION = "jobshield-rules-2.0";
const MAX_CONTENT_LENGTH = 50_000;

export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "zoho.com",
  "gmx.com",
  "inbox.com",
  "fastmail.com",
  "yandex.com",
]);

function cleanText(value: string | undefined | null, maxLength: number): string | null {
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

/**
 * Searches for labeled key-value fields regardless of line breaks, punctuation, or bullet markers.
 */
function labelValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:^|[\\r\\n•*\\-\\[\\]|;]|(?:^|\\s)(?:the|our|from)\\s+)(?:${escaped})\\s*[:\\-–=]\\s*([^\\r\\n,;|]{2,100})`,
      "i",
    );
    const match = text.match(pattern);
    if (match?.[1]) {
      let candidate = cleanText(match[1], 100);
      if (candidate) {
        // Strip trailing inline field markers if multiple labels appear on the same line
        candidate = candidate
          .replace(/\s+(?:salary|compensation|pay|location|date|apply|contact|reporting|hours)\s*[:\-–].*$/i, "")
          .trim();
        // Strip trailing "at Company Name" if role was captured with company suffix
        candidate = candidate
          .replace(
            /\s+(?:at|with)\s+[A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+){0,4}(?:\s+(?:Inc\.?|LLC|Ltd\.?|Corporation|Corp\.?))?$/i,
            "",
          )
          .trim();
      }
      if (candidate && candidate.length >= 2 && !/^(?:n\/a|none|unknown|null|undefined)$/i.test(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Extracts all email addresses from content and categorizes them into recruiter/contact vs applicant.
 */
export function extractEmailAddresses(text: string): { all: string[]; recruiterEmails: string[] } {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
  const matches = Array.from(text.matchAll(emailRegex));
  const all = Array.from(new Set(matches.map((m) => m[0].toLowerCase())));

  // Find recruiter/contact emails (preceded by cues like contact, send, recruiter, from, hr, inquiries, email)
  const recruiterEmails: string[] = [];
  for (const email of all) {
    const emailIndex = text.toLowerCase().indexOf(email);
    const precedingSlice = text.slice(Math.max(0, emailIndex - 80), emailIndex).toLowerCase();
    const isContactContext =
      /(?:contact|send|submit|resume|cv|email|reach|write|apply|hr|recruiter|inquiries|hiring|from|manager)\b/i.test(
        precedingSlice,
      );
    if (isContactContext || all.length === 1) {
      recruiterEmails.push(email);
    }
  }

  return { all, recruiterEmails: recruiterEmails.length ? recruiterEmails : all };
}

/**
 * Extracts safe public URLs from text, ignoring generic XML schemas and specification hosts.
 */
export function extractUrlsFromText(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>)"']{4,2048}/gi;
  const matches = Array.from(text.matchAll(urlRegex));
  const valid: string[] = [];
  const seen = new Set<string>();

  for (const m of matches) {
    const raw = m[0];
    try {
      const parsed = parsePublicHttpUrl(raw);
      const host = parsed.hostname.toLowerCase();
      // Ignore XML/W3C/schema metadata URLs
      if (
        host === "www.w3.org" ||
        host === "w3.org" ||
        host.includes("schemas.microsoft.com") ||
        host.includes("schemas.openxmlformats.org") ||
        host.includes("ns.adobe.com")
      ) {
        continue;
      }
      const norm = parsed.toString();
      if (!seen.has(norm)) {
        seen.add(norm);
        valid.push(norm);
      }
    } catch {
      // Ignore invalid or private URLs
    }
  }
  return valid;
}

/**
 * Robustly infers employer/company name from text, hints, letterhead, or domains.
 */
export function inferCompanyName(
  text: string,
  companyHint?: string,
  sourceLabel?: string,
): string | null {
  const supplied = cleanText(companyHint, 100);
  if (supplied) return supplied;

  // 1. Explicitly labeled company lines
  const labeled = labelValue(text, [
    "company name",
    "company",
    "employer name",
    "employer",
    "organization name",
    "organization",
    "hiring company",
    "firm",
    "client",
  ]);
  if (labeled) return labeled;

  // 2. Letterhead: Check first 5 non-empty lines for formal corporate entity (e.g. "APEX GLOBAL SOLUTIONS INC.")
  const initialLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 80)
    .slice(0, 6);

  const corporateHeaderRegex =
    /^([A-Za-z0-9&.'-]+(?:\s+[A-Za-z0-9&.'-]+){0,4}\s+(?:Inc\.?|LLC|Ltd\.?|Limited|Corporation|Corp\.?|Technologies|Solutions|Enterprises|Holdings|Group|Systems|Services))$/i;

  for (const line of initialLines) {
    if (corporateHeaderRegex.test(line)) {
      if (!/^(?:job\s+offer|employment\s+offer|offer\s+letter|curriculum\s+vitae|resume)/i.test(line)) {
        let candidate = cleanText(line, 80);
        if (candidate && candidate === candidate.toUpperCase()) {
          candidate = candidate
            .toLowerCase()
            .replace(/(?:^|\s|[-(])\w/g, (c) => c.toUpperCase())
            .replace(/\bLlc\b/i, "LLC")
            .replace(/\bInc\.?$/i, "Inc.")
            .replace(/\bLtd\.?$/i, "Ltd.")
            .replace(/\bCorp\.?$/i, "Corp.")
            .replace(/\.\.+$/, ".");
        }
        return candidate;
      }
    }
  }

  // 3. Formal offer phrasing
  const formalPhrases = [
    /\b(?:offer of employment from|employment offer from|congratulations on your offer from|welcome to)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,4})/i,
    /\b(?:delighted|pleased|excited|proud)\s+to\s+offer\s+you\s+(?:the|a)\s+position\s+(?:of\s+[^,\n]+?\s+at|at)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,4})/i,
    /\b(?:on behalf of)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,4})(?:,|\.|\s+we|\s+I)/i,
    /\b([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})\s+(?:is pleased to offer|is excited to offer|is thrilled to offer|is hiring|invites applications)\b/i,
  ];

  for (const regex of formalPhrases) {
    const match = text.match(regex);
    if (match?.[1]) {
      const candidate = cleanText(match[1], 80);
      if (candidate && candidate.length >= 2 && !/^(?:this|your|our|any|the)$/i.test(candidate)) {
        return candidate;
      }
    }
  }

  // 4. Entity with strict legal suffixes (Inc, LLC, Ltd, Corp, Corporation)
  const legalSuffixRegex =
    /\b([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,4}\s+(?:Inc\.?|LLC|Ltd\.?|Limited|Corporation|Corp\.?))\b/;
  const legalMatch = text.slice(0, 1500).match(legalSuffixRegex);
  if (legalMatch?.[1]) {
    const candidate = cleanText(legalMatch[1], 80);
    if (candidate && !/^(?:Job Description|Terms and Conditions|Equal Opportunity Employer)/i.test(candidate)) {
      return candidate;
    }
  }

  // 5. Role "at" Company
  const atMatch = text.match(
    /(?:^|[\r\n•*\-])\s*(?:[A-Za-z/ ]{3,60})\s+(?:at|@)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})(?:[\r\n,;|]|$)/,
  );
  if (atMatch?.[1]) {
    const candidate = cleanText(atMatch[1], 80);
    if (candidate && !/^(?:home|remote|your|will|any)$/i.test(candidate)) {
      return candidate;
    }
  }

  // 6. Check if filename in sourceLabel has company name (e.g. "PDF: Google_Offer_Letter.pdf")
  if (sourceLabel) {
    const cleanLabel = sourceLabel.replace(/^PDF:\s*/i, "").replace(/\.pdf$/i, "");
    const fileCompanyMatch = cleanLabel.match(/^([A-Za-z0-9]+)(?:[_-]Offer|[_-]Letter|[_-]Job)/i);
    if (fileCompanyMatch?.[1] && fileCompanyMatch[1].length >= 3) {
      return fileCompanyMatch[1];
    }
  }

  // 6. Recruiter email domain fallback if official corporate domain
  const { recruiterEmails } = extractEmailAddresses(text);
  for (const email of recruiterEmails) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
      const parts = domain.split(".");
      if (parts.length >= 2) {
        const baseName = parts[parts.length - 2];
        if (baseName && baseName.length >= 3 && !/^(?:mail|email|recruiting|careers)$/i.test(baseName)) {
          return baseName.charAt(0).toUpperCase() + baseName.slice(1);
        }
      }
    }
  }

  return null;
}

/**
 * Robustly infers job/role title from text, hints, or common roles.
 */
export function inferJobTitle(
  text: string,
  roleHint?: string,
  pageTitle?: string,
): string | null {
  const supplied = cleanText(roleHint, 100);
  if (supplied) return supplied;

  // 1. Explicitly labeled position/role lines
  const labeled = labelValue(text, [
    "job title",
    "position title",
    "position offered",
    "position",
    "role title",
    "role offered",
    "role",
    "employment offer",
    "job offer",
    "offer for",
    "offer",
    "designation",
    "title",
    "opening",
    "vacancy",
  ]);
  if (labeled) return labeled;

  // 2. Formal offer position phrasing
  const phrasingRegexes = [
    /\b(?:position of|role of|employment as (?:a|an)?|hired as (?:a|an)?|appointed as (?:a|an)?|selected for (?:the position of|the role of)|employment offer(?:\s*[:\-]\s*|\s+for\s+)|job offer(?:\s*[:\-]\s*|\s+for\s+)|offer of employment(?:\s*[:\-]\s*|\s+for\s+))\s+([A-Z][A-Za-z0-9/& -]{2,60}?)(?:\s+(?:at|with|in|for)\s+|[\r\n,.;]|$)/i,
    /\b(?:opportunity for (?:a|an)?|hiring (?:a|an)?)\s+([A-Z][A-Za-z0-9/& -]{2,60}?)(?:\s+(?:at|with|in|for)\s+|[\r\n,.;]|$)/i,
  ];

  for (const regex of phrasingRegexes) {
    const match = text.match(regex);
    if (match?.[1]) {
      const candidate = cleanText(match[1], 80);
      if (candidate && candidate.length >= 3 && !/^(?:team member|full time|part time|permanent)$/i.test(candidate)) {
        return candidate;
      }
    }
  }

  // 3. Dictionary of common standard job titles
  const commonTitles = [
    "Software Engineer",
    "Senior Software Engineer",
    "Junior Software Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Full Stack Developer",
    "Full-Stack Engineer",
    "DevOps Engineer",
    "Data Analyst",
    "Data Scientist",
    "Product Manager",
    "Project Manager",
    "Administrative Assistant",
    "Executive Assistant",
    "Office Assistant",
    "Customer Support Specialist",
    "Customer Service Representative",
    "Quality Assurance Engineer",
    "QA Engineer",
    "Security Analyst",
    "Cybersecurity Analyst",
    "Graphic Designer",
    "UI/UX Designer",
    "Marketing Specialist",
    "Business Analyst",
    "Research Assistant",
    "Accountant",
    "Financial Analyst",
    "HR Specialist",
    "Recruiter",
    "Content Writer",
  ];

  for (const title of commonTitles) {
    if (
      title === "Recruiter" &&
      /\b(?:recruiter\s+(?:fee|contact|email|reach|message)|third\s*party\s*recruiter)\b/i.test(text)
    ) {
      continue;
    }
    const pattern = new RegExp(`\\b${title.replace(/[/\\-]/g, "[/\\- ]")}\\b`, "i");
    if (pattern.test(text.slice(0, 3000))) {
      return title;
    }
  }

  // 4. Web page title fallback if available
  if (pageTitle) {
    const cleanTitle = pageTitle
      .replace(/\s*[-–|].*$/, "")
      .replace(/^Careers?\s*[-–|:]\s*/i, "")
      .trim();
    if (cleanTitle.length >= 3 && cleanTitle.length <= 80) {
      return cleanTitle;
    }
  }

  return null;
}

/**
 * Detects warning signs across all core risk categories.
 */
export function detectRuleFindings(
  text: string,
  emailDomain: string | null,
  applicationHost: string | null,
  allEmails: string[] = [],
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const add = (finding: RuleFinding) => {
    if (!findings.some((item) => item.code === finding.code)) {
      findings.push(finding);
    }
  };

  // Rule 1: Upfront recruitment, registration, training, background check, equipment, or gift card / crypto fees
  const feeRegex =
    /\b(?:registration|recruitment|interview|security|processing|placement|training|onboarding|background check|clearance|equipment|laptop|orientation)\s+(?:fee|charge|deposit|cost|payment)\b|\bpay\s+(?:a|the|our)\s+(?:fee|deposit|charge|cost)\b|\b(?:deposit|upfront payment|initial payment)\s+(?:is\s+)?(?:required|mandatory|needed)\b|\b(?:wire|transfer|send)\s+(?:money|funds|\$\d+|fee)\b|\b(?:gift\s*card|apple\s*gift|steam\s*card|google\s*play\s*card|western\s*union|moneygram)\b|\b(?:bitcoin|usdt|crypto|cryptocurrency)\b|\b(?:check\s+cashing|mail\s+you\s+a\s+check\s+to\s+buy)\b/i;

  const feeMatch = text.match(feeRegex);
  if (feeMatch) {
    add({
      code: "upfront_fee",
      title: "Payment or financial transaction requested before employment",
      severity: "elevated",
      description:
        "The submission mentions an upfront fee, equipment deposit, gift card, cryptocurrency, wire transfer, or payment before or during hiring.",
      whyItMatters:
        "Legitimate employers do not require job applicants to pay for interviews, equipment, training, or background checks through personal funds, wire transfers, or gift cards.",
      recommendedAction:
        "Never send money, purchase gift cards, or wire funds to secure a job. Contact the employer independently through official public contacts.",
      evidenceExcerpt: excerpt(feeMatch[0], 200),
    });
  }

  // Rule 2: Guaranteed hiring / instant offer without interview
  const guaranteeRegex =
    /\b(?:guaranteed|guarantee)\s+(?:job|placement|offer|selection|employment|position)\b|\b(?:job|offer|placement|selection)\s+(?:is\s+)?guaranteed\b|\b(?:selected|hired)\s+without\s+(?:an?\s+)?interview\b|\b(?:no\s+interview\s+required|instant\s+offer|direct\s+selection|100%\s+placement)\b/i;

  const guaranteeMatch = text.match(guaranteeRegex);
  if (guaranteeMatch) {
    add({
      code: "guaranteed_outcome",
      title: "Guaranteed hiring or placement without formal interview",
      severity: "caution",
      description:
        "The offer promises guaranteed hiring, immediate selection, or employment without a standard interview or evaluation process.",
      whyItMatters:
        "Guaranteed outcomes and skipped interview procedures are commonly used in employment scams to rush applicants past critical verification checks.",
      recommendedAction:
        "Verify the vacancy and standard hiring stages directly through the employer's official careers portal.",
      evidenceExcerpt: excerpt(guaranteeMatch[0], 200),
    });
  }

  // Rule 3: Artificial urgency and high pressure
  const urgencyRegex =
    /\b(?:act now|immediately|within \d+\s*(?:hours?|minutes?|days?)|today only|limited slots|last chance|urgent response|urgent hiring|expire[s]? in \d+)\b/i;

  const urgencyMatch = text.match(urgencyRegex);
  if (urgencyMatch) {
    add({
      code: "high_pressure",
      title: "Artificial urgency and pressure to decide immediately",
      severity: "caution",
      description:
        "The message uses urgency, short countdowns, or limited-slot pressure to force a rapid commitment.",
      whyItMatters:
        "Artificial urgency prevents candidates from taking time to research the company, compare details, or seek trusted advice.",
      recommendedAction:
        "Slow down. Genuine employers provide reasonable time to review offers and do not require instant commitments.",
      evidenceExcerpt: excerpt(urgencyMatch[0], 200),
    });
  }

  // Rule 4: Sensitive personal or banking information requests
  const sensitiveRegex =
    /\b(?:passport|social security|ssn|national id|aadhaar|bank login|online banking password|card pin|cvv|routing number|bank account details|credit card details|debit card number|mother['’]s maiden name|otp|verification code)\b/i;

  const sensitiveMatch = text.match(sensitiveRegex);
  if (sensitiveMatch) {
    add({
      code: "sensitive_information",
      title: "Sensitive identity or banking credentials requested",
      severity: "caution",
      description:
        "The submission asks for identity documents, bank account details, card PINs, passwords, or financial credentials.",
      whyItMatters:
        "Sharing banking logins, PINs, or identity documents before independent corporate verification puts you at risk of identity theft or financial fraud.",
      recommendedAction:
        "Never share bank login credentials, card numbers, or passwords. Verify the employer before providing tax or identity documents.",
      evidenceExcerpt: excerpt(sensitiveMatch[0], 200),
    });
  }

  // Rule 5: Recruiter uses free/public mailbox
  const emailsToCheck = allEmails.length ? allEmails : emailDomain ? [`contact@${emailDomain}`] : [];
  const freeEmailFound = emailsToCheck.find((em) => {
    const domain = em.split("@")[1]?.toLowerCase();
    return domain && FREE_EMAIL_DOMAINS.has(domain);
  });

  if (freeEmailFound || (emailDomain && FREE_EMAIL_DOMAINS.has(emailDomain))) {
    const dom = freeEmailFound ? freeEmailFound.split("@")[1] : emailDomain;
    add({
      code: "personal_recruiter_email",
      title: "Recruiter contact uses a public/free email provider",
      severity: "caution",
      description: `The communication lists a free public email address (${dom}) rather than a corporate company domain.`,
      whyItMatters:
        "Anyone can create an email on a free public service using a company's name. A public mailbox does not prove the sender represents the employer.",
      recommendedAction:
        "Reach out to the company's verified HR or recruitment team via the official domain found on their website.",
      evidenceExcerpt: freeEmailFound ? excerpt(freeEmailFound, 100) : dom,
    });
  }

  // Rule 6: Application link uses a URL shortener
  if (
    applicationHost &&
    /^(?:bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|ow\.ly|rb\.gy|shorturl\.at)$/i.test(
      normalizeDomain(applicationHost),
    )
  ) {
    add({
      code: "shortened_link",
      title: "Application link hides destination behind a URL shortener",
      severity: "caution",
      description: `The application link uses ${applicationHost}, obscuring the real destination domain.`,
      whyItMatters:
        "Shortened links hide where personal or resume data is being submitted and can redirect to phishing pages.",
      recommendedAction:
        "Do not submit credentials through shortened links. Find the official vacancy directly on the employer's careers site.",
      evidenceExcerpt: applicationHost,
    });
  }

  // Rule 7: Off-platform communication (Telegram / WhatsApp interviews)
  const chatRegex =
    /\b(?:telegram(?:\.me|\.org|\s+app|\s+at|\s+@|\s+handle)?\s*[:\-@]?\s*@?[A-Za-z0-9_]{4,}|whatsapp(?:\s+interview|\s+only|\s+chat|\s+group|\s+at)?\s*[:\-]?\s*\+?\d{8,}|interview\s+(?:on|via)\s+(?:telegram|whatsapp|signal))\b/i;

  const chatMatch = text.match(chatRegex);
  if (chatMatch) {
    add({
      code: "off_platform_communication",
      title: "Directing interview or hiring to unverified private chat apps",
      severity: "caution",
      description:
        "The recruiter directs candidates to conduct interviews or submit documents strictly through Telegram or WhatsApp.",
      whyItMatters:
        "Legitimate corporate recruitment processes occur through official corporate email, applicant tracking systems, or scheduled video calls, not anonymous Telegram handles.",
      recommendedAction:
        "Request communication through verified company email and cross-check the recruiter on LinkedIn or the official company team directory.",
      evidenceExcerpt: excerpt(chatMatch[0], 200),
    });
  }

  return findings;
}

/**
 * Extracts structured job offer terms (compensation, employment type, location, contact, deadline).
 */
export function extractOfferDetails(
  text: string,
  recruiterEmails: string[],
): {
  compensation: string | null;
  employmentType: string | null;
  location: string | null;
  contactEmail: string | null;
  deadline: string | null;
} {
  // Compensation: match salary/pay/rate patterns
  const compMatch = text.match(
    /(?:salary|compensation|pay|rate|remuneration)\s*[:\-–]?\s*([^\r\n,;]{2,80})|(?:\$|€|£|₹|USD|INR|EUR|GBP)\s*[\d,]+(?:\.\d+)?(?:\s*(?:-|to)\s*(?:\$|€|£|₹|USD|INR|EUR|GBP)?\s*[\d,]+(?:\.\d+)?)?(?:\s*(?:per|\/|a)\s*(?:hour|hr|year|yr|month|mo|annum|day))?|\b\d+[\d,]*\s*(?:lpa|k|usd|inr|eur)\b/i,
  );
  let compensation: string | null = null;
  if (compMatch) {
    compensation = cleanText(compMatch[1] || compMatch[0], 60);
  }

  // Employment Type
  const empMatch = text.match(
    /\b(Full-time|Part-time|Contract|Remote|Hybrid|Internship|Temporary|Freelance)\b/i,
  );
  const employmentType = empMatch ? cleanText(empMatch[0], 40) : null;

  // Location
  const locMatch = text.match(
    /(?:location|based in|workplace|office)\s*[:\-–]?\s*([^\r\n,;]{2,60})/i,
  );
  let location = locMatch ? cleanText(locMatch[1], 60) : null;
  if (!location) {
    const remoteMatch = text.match(/\b(Remote|Work from home|Hybrid|On-site)\b/i);
    if (remoteMatch) location = remoteMatch[0];
  }

  // Contact Email
  const contactEmail = recruiterEmails[0] ?? null;

  // Deadline
  const deadlineMatch = text.match(
    /(?:deadline|closing date|apply before|valid until|expires on)\s*[:\-–]?\s*([A-Za-z0-9, ]{4,40})/i,
  );
  const deadline = deadlineMatch ? cleanText(deadlineMatch[1], 40) : null;

  return {
    compensation,
    employmentType,
    location,
    contactEmail,
    deadline,
  };
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
      /career|job|vacan|opening|work|about/i.test(candidate) &&
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

/**
 * Main analysis orchestration engine.
 */
export async function analyzeJobOpportunity(
  input: AnalyzeJobInput,
): Promise<AnalysisReport> {
  let sourceText = input.content.trim().slice(0, MAX_CONTENT_LENGTH);
  let submittedUrl = input.submittedUrl;

  // Extract URLs from content if none submitted explicitly
  const contentUrls = extractUrlsFromText(sourceText);
  if (!submittedUrl && contentUrls.length > 0) {
    submittedUrl = contentUrls[0];
  }

  let applicationDomain: string | null = null;
  if (submittedUrl) {
    try {
      applicationDomain = normalizeDomain(new URL(submittedUrl).hostname);
    } catch {
      applicationDomain = null;
    }
  }

  // Initial field extraction
  let companyName = inferCompanyName(sourceText, input.companyHint, input.sourceLabel);
  let jobTitle = inferJobTitle(sourceText, input.roleHint);

  // If this is a URL submission or has a submitted URL, fetch the page content first so we can analyze real content
  let submittedPageText = "";
  let submittedPageTitle = "";
  if (submittedUrl) {
    try {
      const pageFetch = await fetchPublicPages(
        [submittedUrl],
        "Retrieve public job listing text to evaluate claims and warning signals.",
      );
      if (pageFetch.pages.length > 0) {
        submittedPageText = pageFetch.pages[0].text;
        submittedPageTitle = pageFetch.pages[0].title;
        // Augment sourceText with fetched page content for comprehensive analysis
        if (input.sourceType === "url") {
          sourceText = `${sourceText}\n\n[FETCHED PAGE CONTENT]\nTitle: ${submittedPageTitle}\n${submittedPageText}`;
        }
        // Refine company and title using fetched page if not already found
        if (!companyName) {
          companyName = inferCompanyName(submittedPageText, input.companyHint, submittedPageTitle);
        }
        if (!jobTitle) {
          jobTitle = inferJobTitle(submittedPageText, input.roleHint, submittedPageTitle);
        }
      }
    } catch {
      // Best-effort retrieval of submitted URL
    }
  }

  // Search public sources using company name and role
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
        note: "A company name or public career website could not be identified for external research.",
      };

  // Select candidate URLs to fetch for deeper evidence corroboration
  const candidateUrls: string[] = [];
  if (submittedUrl) candidateUrls.push(submittedUrl);
  for (const r of search.results.slice(0, 3)) {
    if (!candidateUrls.includes(r.url)) candidateUrls.push(r.url);
  }

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

  // Add submitted page to evidence if available
  if (submittedUrl) {
    try {
      const normSub = new URL(submittedUrl).toString();
      seenUrls.add(normSub);
      const subPage = fetchedByUrl.get(normSub);
      evidence.push({
        url: normSub,
        title: subPage?.title || submittedPageTitle || `Job Listing at ${applicationDomain ?? "Public Website"}`,
        domain: applicationDomain || normalizeDomain(new URL(submittedUrl).hostname),
        sourceType: "submitted" as const,
        excerpt: excerpt(subPage?.text || submittedPageText || sourceText),
        retrievedAt,
        relationship: "context" as const,
      });
    } catch {
      // ignore URL parse error
    }
  }

  // Correlate search results into evidence
  const normalizedCompany = companyName ? normalizeForMatch(companyName) : "";

  for (const result of search.results) {
    try {
      const normalizedUrl = new URL(result.url).toString();
      if (seenUrls.has(normalizedUrl)) continue;
      seenUrls.add(normalizedUrl);

      const page = fetchedByUrl.get(normalizedUrl);
      const domain = normalizeDomain(result.domain);
      const candidateText = `${result.title} ${domain} ${result.snippet} ${page?.text ?? ""}`;
      const normalizedCandidate = normalizeForMatch(candidateText);

      const isCompanyMatch =
        Boolean(normalizedCompany) && normalizedCandidate.includes(normalizedCompany);
      const isCareerCandidate =
        /career|job|vacan|opening|work/i.test(candidateText) && isCompanyMatch;

      evidence.push({
        url: normalizedUrl,
        title: result.title,
        domain,
        sourceType: isCareerCandidate
          ? ("official_candidate" as const)
          : ("public" as const),
        excerpt: excerpt(page?.text || result.snippet || result.title),
        retrievedAt,
        relationship: isCompanyMatch ? ("supports" as const) : ("context" as const),
      });
    } catch {
      // ignore
    }
  }

  // Extract all emails for comprehensive contact analysis
  const { all: allExtractedEmails, recruiterEmails } = extractEmailAddresses(sourceText);
  const primaryEmailDomain = recruiterEmails.length
    ? recruiterEmails[0].split("@")[1]?.toLowerCase()
    : null;

  // Detect warning rule findings
  const findings = detectRuleFindings(
    sourceText,
    primaryEmailDomain,
    applicationDomain,
    allExtractedEmails,
  );

  // Extract structured offer terms
  const offerDetails = extractOfferDetails(sourceText, recruiterEmails);

  const likelyCareerDomain = candidateCompanyDomain(companyName, search.results);

  const allSourceText = evidence
    .map((item) => `${item.title} ${item.excerpt}`)
    .join(" ");

  const companyMentioned =
    Boolean(companyName) &&
    normalizeForMatch(allSourceText).includes(normalizeForMatch(companyName!));

  const roleMentioned =
    Boolean(jobTitle) &&
    normalizeForMatch(allSourceText).includes(normalizeForMatch(jobTitle!));

  // Determine researchStatus accurately
  const researchStatus: "completed" | "partial" | "unavailable" | "not_configured" =
    search.status === "not_configured"
      ? "not_configured"
      : search.status === "unavailable" && fetched.status !== "completed"
        ? "unavailable"
        : search.results.length > 0 || fetched.pages.length > 0
          ? "completed"
          : search.status === "completed"
            ? "completed"
            : "partial";

  // Determine verificationStatus
  const verificationStatus =
    evidence.length === 0 || researchStatus === "unavailable" || researchStatus === "not_configured"
      ? "unable_to_verify"
      : companyMentioned && likelyCareerDomain && applicationDomain && likelyCareerDomain === applicationDomain
        ? "official_match"
        : companyMentioned
          ? "partial_match"
          : search.status === "completed"
            ? "no_match"
            : "unable_to_verify";

  // Assemble Categorized Verification Checks
  const topCompanySource = evidence.find((e) => e.relationship === "supports")?.url ?? (likelyCareerDomain ? `https://${likelyCareerDomain}` : null);

  const checks = [
    {
      category: "company_identity" as const,
      label: "Company identity in public sources",
      status: companyMentioned
        ? ("match" as const)
        : companyName
          ? researchStatus === "completed"
            ? ("discrepancy" as const)
            : ("unable_to_verify" as const)
          : ("unable_to_verify" as const),
      submittedValue: companyName,
      observedValue: companyMentioned ? (likelyCareerDomain || companyName) : null,
      explanation: companyMentioned
        ? `The employer identity was corroborated in public records (${likelyCareerDomain ?? "public sources"}).`
        : companyName
          ? researchStatus === "completed"
            ? "Public research completed, but could not confirm records for this exact employer name."
            : "External sources were not available to confirm the company name."
          : "No employer or company name could be identified from the submitted content.",
      sourceUrl: topCompanySource,
    },
    {
      category: "company_identity" as const,
      label: "Official company website",
      status: likelyCareerDomain
        ? ("match" as const)
        : researchStatus === "completed"
          ? ("unable_to_verify" as const)
          : ("unable_to_verify" as const),
      submittedValue: likelyCareerDomain ? `Domain for ${companyName || "employer"}` : null,
      observedValue: likelyCareerDomain,
      explanation: likelyCareerDomain
        ? `Official corporate web presence located: ${likelyCareerDomain}.`
        : "No authoritative company web presence was identified in retrieved sources.",
      sourceUrl: likelyCareerDomain ? `https://${likelyCareerDomain}` : null,
    },
    {
      category: "job_vacancy" as const,
      label: "Job vacancy in public sources",
      status: roleMentioned
        ? ("match" as const)
        : jobTitle
          ? researchStatus === "completed"
            ? ("partial" as const)
            : ("unable_to_verify" as const)
          : ("unable_to_verify" as const),
      submittedValue: jobTitle,
      observedValue: roleMentioned ? jobTitle : null,
      explanation: roleMentioned
        ? "The role title corresponds with public vacancy records. Note: A genuine company can still be impersonated in a fraudulent vacancy."
        : jobTitle
          ? "The specific role was not confirmed in retrieved public excerpts. Roles change frequently."
          : "No specific job title was detected in the submitted content.",
      sourceUrl: null,
    },
    {
      category: "recruiter_contact" as const,
      label: "Recruiter contact domain",
      status: primaryEmailDomain
        ? FREE_EMAIL_DOMAINS.has(primaryEmailDomain)
          ? ("discrepancy" as const)
          : ("match" as const)
        : ("unable_to_verify" as const),
      submittedValue: recruiterEmails[0] ?? null,
      observedValue: primaryEmailDomain ?? null,
      explanation: primaryEmailDomain
        ? FREE_EMAIL_DOMAINS.has(primaryEmailDomain)
          ? `The recruiter contact uses a free public email provider (${primaryEmailDomain}) rather than an authenticated corporate domain.`
          : `The recruiter email uses a private corporate domain (${primaryEmailDomain}).`
        : "No recruiter email address was identified in the submitted text. Treat absence of public recruiter information as unverified, not proof of fraud.",
      sourceUrl: null,
    },
    {
      category: "offer_terms" as const,
      label: "Application channel and terms",
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
          ? "The application URL matches the official company career domain found in public search."
          : likelyCareerDomain
            ? `The application domain (${applicationDomain}) differs from the likely corporate domain (${likelyCareerDomain}). Legitimate employers sometimes use third-party hiring platforms.`
            : "No official company career domain was available for comparison."
        : "No application website or link was present in the submitted material.",
      sourceUrl: submittedUrl || null,
    },
  ];

  // AI-Assisted Explanation (Groq)
  const aiResult = await explainWithAi({
    content: sourceText,
    companyHint: input.companyHint,
    roleHint: input.roleHint,
    detectedFindings: findings.map((f) => ({
      code: f.code,
      title: f.title,
      severity: f.severity,
    })),
    evidenceSnippets: evidence.map((e) => ({
      title: e.title,
      domain: e.domain,
      excerpt: e.excerpt,
    })),
  });

  // Final Company Name and Job Title resolution
  const finalCompanyName =
    companyName ?? (aiResult.status === "completed" ? aiResult.extractedCompany ?? null : null);
  const finalJobTitle =
    jobTitle ?? (aiResult.status === "completed" ? aiResult.extractedRole ?? null : null);

  // Determine Evidence-Based Overall Assessment
  const elevatedFindings = findings.filter((f) => f.severity === "elevated");
  const cautionFindings = findings.filter((f) => f.severity === "caution");

  let overallAssessment:
    | "evidence_of_concern"
    | "conflicting_evidence"
    | "no_major_warnings"
    | "insufficient_evidence";
  let defaultRationale: string;

  if (elevatedFindings.length > 0 || cautionFindings.length >= 2) {
    overallAssessment = "evidence_of_concern";
    defaultRationale = `Critical warning signals detected (${findings.map((f) => f.title).join("; ")}). Legitimate employers do not request candidate fees, cryptocurrency, or unverified private chat communications.`;
  } else if (
    cautionFindings.length === 1 ||
    (primaryEmailDomain && FREE_EMAIL_DOMAINS.has(primaryEmailDomain)) ||
    (applicationDomain && likelyCareerDomain && applicationDomain !== likelyCareerDomain)
  ) {
    overallAssessment = "conflicting_evidence";
    defaultRationale = `Mixed or conflicting evidence detected. One or more warning indicators (such as free public email for corporate recruitment or divergent application domains) conflict with standard corporate practices.`;
  } else if (
    findings.length === 0 &&
    companyMentioned &&
    likelyCareerDomain &&
    (applicationDomain ? likelyCareerDomain === applicationDomain : true)
  ) {
    overallAssessment = "no_major_warnings";
    defaultRationale = `No major warning signs found in the checks performed. Public records for "${finalCompanyName}" were corroborated. Note: Absence of detected warnings does not guarantee legitimacy; impersonation of genuine companies is common.`;
  } else {
    overallAssessment = "insufficient_evidence";
    defaultRationale = `Insufficient evidence to assess this opportunity. While no overt scam patterns were detected in the text, independent public records could not corroborate the employer identity or vacancy details.`;
  }

  // Generate intelligent deterministic summary if AI is unavailable
  let deterministicSummary: string;
  if (findings.length > 0) {
    deterministicSummary = `Identified ${findings.length} warning signal${findings.length === 1 ? "" : "s"} in this opportunity (including ${findings.map((f) => f.title.toLowerCase()).join("; ")}). ${
      companyMentioned
        ? `While public records exist for "${finalCompanyName}", the presence of explicit warning patterns requires extreme caution.`
        : "Exercise extreme caution and verify the recruiter independently through official public contacts before sharing any funds or sensitive credentials."
    }`;
  } else if (companyMentioned) {
    deterministicSummary = `No explicit warning patterns were identified in the submitted material. Public records were found for "${finalCompanyName}" (${likelyCareerDomain ?? "verified domain"}). Because automated reviews cannot guarantee authenticity, confirm this specific opening through the employer's official careers site.`;
  } else if (researchStatus === "unavailable" || researchStatus === "not_configured") {
    deterministicSummary = `No warning patterns were identified in the submitted text. However, live public research was unavailable, so claims could not be compared with external corporate records. Absence of warnings is not proof that the opportunity is genuine.`;
  } else {
    deterministicSummary = `No warning patterns were identified in the submitted material. However, public search records did not confirm details for "${finalCompanyName ?? "the named employer"}". Independently verify the employer through official channels.`;
  }

  const finalSummary =
    aiResult.status === "completed" && aiResult.summary
      ? aiResult.summary
      : deterministicSummary;

  const finalRationale =
    aiResult.status === "completed" && aiResult.assessmentRationale
      ? aiResult.assessmentRationale
      : defaultRationale;

  // Practical, tailored next steps
  const defaultNextSteps: string[] = [];
  if (findings.some((f) => f.code === "upfront_fee")) {
    defaultNextSteps.push("Do not pay any fee, deposit, or purchase gift cards or cryptocurrency under any circumstances.");
  }
  if (findings.some((f) => f.code === "sensitive_information")) {
    defaultNextSteps.push("Do not send passport copies, banking logins, card details, or tax numbers to an unverified contact.");
  }
  if (likelyCareerDomain) {
    defaultNextSteps.push(`Visit the official careers page at https://${likelyCareerDomain} and verify that this vacancy is listed.`);
  } else {
    defaultNextSteps.push(`Search for "${finalCompanyName || "the employer"}" independently and contact their human resources department.`);
  }
  defaultNextSteps.push("Contact the company's human resources or recruitment team using contact details you find independently.");
  defaultNextSteps.push("Pause your application process until all unresolved questions are clarified through official channels.");

  const finalNextSteps =
    aiResult.status === "completed" && aiResult.tailoredNextSteps && aiResult.tailoredNextSteps.length > 0
      ? aiResult.tailoredNextSteps
      : defaultNextSteps.slice(0, 5);

  // Situation-specific questions for the recruiter
  const defaultQuestions: string[] = [];
  if (findings.some((f) => f.code === "upfront_fee")) {
    defaultQuestions.push("Can you provide the official written company policy explaining why a candidate fee or deposit is required?");
  }
  if (primaryEmailDomain && FREE_EMAIL_DOMAINS.has(primaryEmailDomain)) {
    defaultQuestions.push(`Could you send an official confirmation email from your corporate domain (@${likelyCareerDomain || "company.com"})?`);
  }
  if (findings.some((f) => f.code === "off_platform_communication")) {
    defaultQuestions.push("Can we conduct our interviews via an official corporate video platform or through your company's official careers portal?");
  }
  if (!roleMentioned && jobTitle) {
    defaultQuestions.push(`What is the official Requisition or Job ID for the "${jobTitle}" position on your corporate careers portal?`);
  }
  if (defaultQuestions.length < 3) {
    defaultQuestions.push(`Could you provide the name, title, and corporate email of the hiring manager or department head?`);
    defaultQuestions.push(`Where on your official careers website can I view this exact job posting and its requirements?`);
  }

  const finalQuestions =
    aiResult.status === "completed" && aiResult.questionsForRecruiter && aiResult.questionsForRecruiter.length > 0
      ? aiResult.questionsForRecruiter
      : defaultQuestions;

  const limitations = [
    "This assessment is an evidence-grounded heuristic evaluation of detectable indicators and public records, not a legal fraud determination or guarantee of authenticity.",
    "Legitimate employers can be impersonated by unauthorized third parties. Verification requires contacting the real organization through independent channels.",
    "Public search results represent web index leads and do not constitute independent corporate identity audits.",
    ...(researchStatus === "not_configured"
      ? ["Live web research is unconfigured; only deterministic text checks were performed."]
      : researchStatus === "unavailable"
        ? ["Live web research could not be reached; external source comparisons were unavailable."]
        : []),
    ...(search.results.length === 0 && search.status === "completed"
      ? ["Public search returned no matching sources for this query. New or unindexed companies may not appear in web searches."]
      : []),
    ...(aiResult.status === "unavailable"
      ? ["AI model explanation was unavailable; deterministic rule findings and live web research were preserved."]
      : []),
  ];

  // Meaningful sourceLabel
  let finalSourceLabel: string;
  if (input.sourceType === "url" && submittedUrl) {
    finalSourceLabel = `Job listing on ${applicationDomain ?? "public website"}`;
  } else if (input.sourceType === "pdf") {
    if (input.sourceLabel && input.sourceLabel.startsWith("PDF: ")) {
      finalSourceLabel = input.sourceLabel;
    } else if (finalCompanyName && finalJobTitle) {
      finalSourceLabel = `${finalCompanyName} - ${finalJobTitle} (PDF)`;
    } else if (finalCompanyName) {
      finalSourceLabel = `Offer letter from ${finalCompanyName} (PDF)`;
    } else {
      finalSourceLabel = "Offer letter (PDF)";
    }
  } else {
    if (finalCompanyName && finalJobTitle) {
      finalSourceLabel = `${finalCompanyName} - ${finalJobTitle}`;
    } else {
      finalSourceLabel = cleanText(input.sourceLabel, 180) ?? "Pasted recruitment offer";
    }
  }

  const report = {
    id: randomUUID(),
    createdAt: new Date(),
    sourceType: input.sourceType,
    sourceLabel: finalSourceLabel,
    companyName: finalCompanyName,
    jobTitle: finalJobTitle,
    companyDomain: likelyCareerDomain,
    applicationDomain,
    overallAssessment,
    assessmentRationale: finalRationale,
    verificationStatus,
    summary: finalSummary,
    findings: findings.map((finding) => ({
      ...finding,
      evidenceUrl: finding.evidenceUrl ?? (submittedUrl || null),
      evidenceExcerpt: finding.evidenceExcerpt ?? null,
    })),
    evidence,
    checks,
    offerDetails,
    questionsForRecruiter: finalQuestions,
    recommendedNextSteps: finalNextSteps,
    limitations,
    researchStatus,
    aiStatus: aiResult.status,
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
