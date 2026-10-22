import { useState, type ReactNode } from 'react';
import type {
  AnalysisReport,
  AnalysisFinding,
  EvidenceSource,
  VerificationCheck,
} from '@workspace/api-client-react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  DollarSign,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FileText,
  Globe2,
  HelpCircle,
  Info,
  Mail,
  MapPin,
  MessageSquare,
  Printer,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';

interface ReportViewProps {
  report: AnalysisReport;
  onCopy: () => void;
  copied: boolean;
}

interface AssessmentPresentation {
  state: 'concern' | 'conflicting' | 'no_warnings' | 'insufficient';
  badgeLabel: string;
  headline: string;
  summaryNote: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentBar: string;
  IconComponent: typeof Shield;
}

function resolveAssessment(report: AnalysisReport): AssessmentPresentation {
  const assessment = report.overallAssessment;

  if (assessment === 'evidence_of_concern') {
    return {
      state: 'concern',
      badgeLabel: 'Evidence of concern',
      headline: 'Warning signals detected in this opportunity',
      summaryNote:
        'Elevated warning patterns were detected in the submitted material (such as payment requests, unverified communication apps, or high-pressure tactics). Legitimate employers do not ask applicants to pay fees, purchase equipment with personal funds, or conduct hiring exclusively over private chat.',
      textColor: '#C94F45',
      bgColor: '#FDF0EE',
      borderColor: '#F8D0CB',
      badgeBg: '#FDF0EE',
      badgeText: '#C94F45',
      badgeBorder: '#F8D0CB',
      accentBar: '#C94F45',
      IconComponent: ShieldAlert,
    };
  }

  if (assessment === 'conflicting_evidence') {
    return {
      state: 'conflicting',
      badgeLabel: 'Mixed or conflicting evidence',
      headline: 'Unresolved mismatches and cautionary patterns identified',
      summaryNote:
        'One or more cautionary indicators or discrepancies were detected (such as recruiter communication from a public mailbox, unconfirmed vacancy records, or divergent application links). Exercise caution and independently verify the recruiter through verified company contacts.',
      textColor: '#B5740D',
      bgColor: '#FDF8EE',
      borderColor: '#F9E4B7',
      badgeBg: '#FDF8EE',
      badgeText: '#B5740D',
      badgeBorder: '#F9E4B7',
      accentBar: '#B5740D',
      IconComponent: AlertTriangle,
    };
  }

  if (assessment === 'no_major_warnings') {
    return {
      state: 'no_warnings',
      badgeLabel: 'No major warning signs detected',
      headline: 'No overt warning patterns detected in checks performed',
      summaryNote:
        'No known scam triggers were identified in the submitted text, and the named employer was corroborated in public records. NOTE: Absence of detected problems does NOT constitute proof of legitimacy. Impersonation of legitimate organizations is widespread. Always verify the vacancy directly on the employer’s official careers page.',
      textColor: '#246A3B',
      bgColor: '#EAF5ED',
      borderColor: '#C5E5CF',
      badgeBg: '#EAF5ED',
      badgeText: '#246A3B',
      badgeBorder: '#C5E5CF',
      accentBar: '#246A3B',
      IconComponent: ShieldCheck,
    };
  }

  // Default: insufficient_evidence
  return {
    state: 'insufficient',
    badgeLabel: 'Insufficient evidence to assess',
    headline: 'Inconclusive research — insufficient public evidence',
    summaryNote:
      'Not enough external evidence was available to verify or disprove this opportunity. No overt warning patterns were triggered in the text, but the employer identity, vacancy, or contact channels could not be independently corroborated against public sources.',
    textColor: '#5C6460',
    bgColor: '#E6EBE4',
    borderColor: '#D8DFD5',
    badgeBg: '#E6EBE4',
    badgeText: '#38403C',
    badgeBorder: '#D8DFD5',
    accentBar: '#8C948F',
    IconComponent: HelpCircle,
  };
}

function checkStatusBadge(status: string) {
  switch (status) {
    case 'match':
      return {
        label: 'Supported by evidence',
        icon: CheckCircle2,
        bg: '#EAF5ED',
        text: '#246A3B',
        border: '#C5E5CF',
      };
    case 'partial':
      return {
        label: 'Inconclusive',
        icon: AlertTriangle,
        bg: '#FDF8EE',
        text: '#B5740D',
        border: '#F9E4B7',
      };
    case 'discrepancy':
      return {
        label: 'Mismatch found',
        icon: XCircle,
        bg: '#FDF0EE',
        text: '#C94F45',
        border: '#F8D0CB',
      };
    case 'not_checked':
      return {
        label: 'Not checked',
        icon: Info,
        bg: '#E6EBE4',
        text: '#616965',
        border: '#D8DFD5',
      };
    default:
      return {
        label: 'Inconclusive / Unverified',
        icon: HelpCircle,
        bg: '#E6EBE4',
        text: '#5C6460',
        border: '#D8DFD5',
      };
  }
}

export function ReportView({ report, onCopy, copied }: ReportViewProps) {
  const [, navigate] = useLocation();
  const [copiedQuestionIndex, setCopiedQuestionIndex] = useState<number | null>(null);
  const [expandSources, setExpandSources] = useState(false);

  const assessment = resolveAssessment(report);

  const copyQuestion = (text: string, index: number) => {
    void navigator.clipboard.writeText(text);
    setCopiedQuestionIndex(index);
    window.setTimeout(() => setCopiedQuestionIndex(null), 2000);
  };

  // Group checks into separate categories
  const companyChecks = report.checks.filter(
    (c) => c.category === 'company_identity' || c.label.toLowerCase().includes('company'),
  );
  const vacancyChecks = report.checks.filter(
    (c) => c.category === 'job_vacancy' || c.label.toLowerCase().includes('job') || c.label.toLowerCase().includes('vacancy'),
  );
  const recruiterChecks = report.checks.filter(
    (c) => c.category === 'recruiter_contact' || c.label.toLowerCase().includes('recruiter') || c.label.toLowerCase().includes('contact'),
  );
  const otherChecks = report.checks.filter(
    (c) =>
      c.category === 'offer_terms' ||
      (!companyChecks.includes(c) && !vacancyChecks.includes(c) && !recruiterChecks.includes(c)),
  );

  return (
    <article className="space-y-7 pb-16 font-sans text-[#171A19]" aria-label="Job Verification Report">
      {/* =========================================================================
          SECTION 1 — TOP ACTION BAR
      ========================================================================= */}
      <header className="flex flex-col gap-4 border-b border-[#D8DFD5] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/analyze')}
            className="gap-2 rounded-xl border-[#D8DFD5] bg-white text-xs font-semibold text-[#171A19] shadow-2xs transition hover:border-[#CBD3C8] hover:bg-[#FAF9F5]"
            data-testid="button-back-to-analyze"
          >
            <ArrowLeft size={14} />
            Analyze Another Offer
          </Button>
          <span className="font-mono text-xs text-[#8C948F]">
            Reviewed on {new Date(report.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            className="gap-2 rounded-xl border-[#D8DFD5] bg-white text-xs font-semibold text-[#171A19] shadow-2xs transition hover:border-[#CBD3C8] hover:bg-[#FAF9F5]"
            data-testid="button-copy-summary"
          >
            {copied ? (
              <>
                <Check size={14} className="text-[#246A3B]" />
                Copied to clipboard
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy summary
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-2 rounded-xl border-[#D8DFD5] bg-white text-xs font-semibold text-[#171A19] shadow-2xs transition hover:border-[#CBD3C8] hover:bg-[#FAF9F5]"
            data-testid="button-print-report"
          >
            <Printer size={14} />
            Print report
          </Button>
        </div>
      </header>

      {/* =========================================================================
          SECTION 2 — REPORT HERO HEADER
      ========================================================================= */}
      <section className="rounded-2xl border border-[#D8DFD5] bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DFD5] bg-[#E6EBE4] px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[#171A19]">
                <FileText size={13} />
                {report.sourceType.toUpperCase()} SUBMISSION
              </span>
              <span className="truncate font-mono text-xs text-[#8C948F]">{report.sourceLabel}</span>
            </div>

            <h1
              className="mt-3 font-display text-2xl font-black tracking-tight text-[#171A19] sm:text-3xl"
              data-testid="text-report-title"
            >
              {report.jobTitle || report.sourceLabel || 'Job Opportunity Review'}
            </h1>

            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-[#616965]">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#171A19]">
                <Building2 size={16} className="text-[#171A19]" />
                {report.companyName || 'Company Not Specified'}
              </span>
              {report.companyDomain && (
                <span className="inline-flex items-center gap-1 font-mono text-xs text-[#171A19]">
                  <Globe2 size={13} className="text-[#8C948F]" />
                  {report.companyDomain}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end">
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-3.5 py-1.5 font-mono text-xs font-bold tracking-tight shadow-2xs"
              style={{
                backgroundColor: assessment.badgeBg,
                color: assessment.badgeText,
                borderColor: assessment.badgeBorder,
              }}
              data-testid="assessment-status-badge"
            >
              <assessment.IconComponent size={14} />
              {assessment.badgeLabel}
            </span>
          </div>
        </div>

        {/* Assessment Banner Box */}
        <div
          className="mt-6 rounded-xl border p-5 sm:p-6 shadow-2xs"
          style={{
            backgroundColor: assessment.bgColor,
            borderColor: assessment.borderColor,
          }}
        >
          <div className="flex items-start gap-3.5">
            <div
              className="grid size-9 shrink-0 place-items-center rounded-lg shadow-2xs"
              style={{ backgroundColor: 'white', color: assessment.textColor }}
            >
              <assessment.IconComponent size={20} />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-base font-extrabold" style={{ color: assessment.textColor }}>
                {assessment.headline}
              </h2>
              <p className="text-xs leading-relaxed text-[#38403C]">
                {report.assessmentRationale || assessment.summaryNote}
              </p>
            </div>
          </div>

          {/* AI or Deterministic Narrative Summary */}
          {report.summary && (
            <div className="mt-4 rounded-xl border border-white bg-white/90 p-4 text-xs leading-relaxed text-[#171A19] shadow-2xs">
              <strong className="mb-1 block font-display font-bold text-[#171A19]">Detailed Findings Summary:</strong>
              <p className="text-[#38403C]">{report.summary}</p>
            </div>
          )}

          <div className="mt-3.5 flex items-center gap-2 text-[11px] font-medium text-[#616965]">
            <Info size={13} className="shrink-0 text-[#171A19]" />
            <span>
              <strong className="text-[#171A19]">Integrity reminder:</strong> The absence of detected warning signs is not proof that an offer is authentic. Legitimate organizations can still be impersonated.
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 3 — EXTRACTED OFFER DETAILS
      ========================================================================= */}
      <section className="rounded-2xl border border-[#D8DFD5] bg-white p-6 shadow-xs">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#8C948F]">
          Extracted Offer Details
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E2E6DF] bg-[#FAF9F5] p-4 transition hover:border-[#D8DFD5]">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#8C948F]">
              <DollarSign size={14} className="text-[#246A3B]" />
              Compensation
            </span>
            <div className="mt-1.5 text-sm font-bold text-[#171A19]">
              {report.offerDetails?.compensation || 'Not specified in text'}
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E6DF] bg-[#FAF9F5] p-4 transition hover:border-[#D8DFD5]">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#8C948F]">
              <BriefcaseIcon size={14} className="text-[#171A19]" />
              Employment Type
            </span>
            <div className="mt-1.5 text-sm font-bold text-[#171A19]">
              {report.offerDetails?.employmentType || 'Not specified'}
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E6DF] bg-[#FAF9F5] p-4 transition hover:border-[#D8DFD5]">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#8C948F]">
              <MapPin size={14} className="text-[#B5740D]" />
              Workplace / Location
            </span>
            <div className="mt-1.5 text-sm font-bold text-[#171A19]">
              {report.offerDetails?.location || 'Not specified'}
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E6DF] bg-[#FAF9F5] p-4 transition hover:border-[#D8DFD5]">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#8C948F]">
              <Mail size={14} className="text-[#171A19]" />
              Recruiter / Contact Email
            </span>
            <div className="mt-1.5 truncate font-mono text-sm font-bold text-[#171A19]" title={report.offerDetails?.contactEmail || 'None detected'}>
              {report.offerDetails?.contactEmail || 'None detected'}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 4 — SEPARATED VERIFICATION CHECKS
          (Company Identity, Job Vacancy, Recruiter & Contact)
      ========================================================================= */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-extrabold text-[#171A19]">
            Independent Verification Checks
          </h2>
          <p className="mt-0.5 text-xs text-[#616965]">
            Evaluated against public corporate records and authoritative web searches.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Card 1: Company Identity Check */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#D8DFD5] bg-white p-5 shadow-xs sm:p-6">
            <div>
              <div className="flex items-center justify-between border-b border-[#E2E6DF] pb-3.5">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-[#171A19]">
                  <Building2 size={16} className="text-[#171A19]" />
                  Company Identity Check
                </span>
                {companyChecks[0] && (
                  <StatusPill status={companyChecks[0].status} />
                )}
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#8C948F] block">Extracted Employer:</span>
                  <strong className="mt-0.5 block text-sm font-bold text-[#171A19]">
                    {report.companyName || 'Not identified in submitted content'}
                  </strong>
                </div>

                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#8C948F] block">Authoritative Web Domain:</span>
                  {report.companyDomain ? (
                    <a
                      href={`https://${report.companyDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 font-mono font-bold text-[#171A19] hover:underline"
                    >
                      {report.companyDomain}
                      <ExternalLink size={11} className="text-[#8C948F]" />
                    </a>
                  ) : (
                    <span className="text-[#8C948F]">No verified corporate domain found</span>
                  )}
                </div>

                <div className="rounded-xl border border-[#E2E6DF] bg-[#FAF9F5] p-3.5 text-xs leading-relaxed text-[#38403C]">
                  {companyChecks[0]?.explanation ||
                    (report.companyName
                      ? `Searched public sources for "${report.companyName}".`
                      : 'No company name was present in the submitted material to research.')}
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-[#E2E6DF] pt-3 font-mono text-[11px] text-[#8C948F]">
              Source: Authoritative corporate web presence or domain index
            </div>
          </div>

          {/* Card 2: Job Vacancy Check */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#D8DFD5] bg-white p-5 shadow-xs sm:p-6">
            <div>
              <div className="flex items-center justify-between border-b border-[#E2E6DF] pb-3.5">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-[#171A19]">
                  <FileSearch size={16} className="text-[#171A19]" />
                  Job Vacancy Check
                </span>
                {vacancyChecks[0] && (
                  <StatusPill status={vacancyChecks[0].status} />
                )}
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#8C948F] block">Specified Role / Title:</span>
                  <strong className="mt-0.5 block text-sm font-bold text-[#171A19]">
                    {report.jobTitle || 'Role title not specified'}
                  </strong>
                </div>

                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#8C948F] block">Careers Portal Confirmation:</span>
                  <span className="mt-0.5 block font-semibold text-[#171A19]">
                    {vacancyChecks[0]?.status === 'match'
                      ? 'Role corroborated in public records'
                      : vacancyChecks[0]?.status === 'partial'
                        ? 'Role not located in retrieved public excerpts'
                        : 'Could not corroborate against official portal'}
                  </span>
                </div>

                <div className="rounded-xl border border-[#E2E6DF] bg-[#FAF9F5] p-3.5 text-xs leading-relaxed text-[#38403C]">
                  {vacancyChecks[0]?.explanation ||
                    'Confirm this vacancy directly on the employer’s careers portal. A genuine company can still be impersonated in a fraudulent vacancy.'}
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-[#E2E6DF] pt-3 font-mono text-[11px] text-[#B5740D]">
              Warning: A real company can still be impersonated in a fake role
            </div>
          </div>

          {/* Card 3: Recruiter and Contact Check */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#D8DFD5] bg-white p-5 shadow-xs sm:p-6">
            <div>
              <div className="flex items-center justify-between border-b border-[#E2E6DF] pb-3.5">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-[#171A19]">
                  <UserCheck size={16} className="text-[#171A19]" />
                  Recruiter & Contact Check
                </span>
                {recruiterChecks[0] && (
                  <StatusPill status={recruiterChecks[0].status} />
                )}
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#8C948F] block">Identified Contact Email:</span>
                  <strong className="mt-0.5 block truncate font-mono text-sm font-bold text-[#171A19]" title={recruiterChecks[0]?.submittedValue || 'None found'}>
                    {recruiterChecks[0]?.submittedValue || 'No contact email in text'}
                  </strong>
                </div>

                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#8C948F] block">Domain Authentication:</span>
                  <span className="mt-0.5 block font-semibold text-[#171A19]">
                    {recruiterChecks[0]?.status === 'discrepancy'
                      ? 'Free / Public email address (high caution)'
                      : recruiterChecks[0]?.status === 'match'
                        ? 'Authenticated corporate domain'
                        : 'Unverified contact domain'}
                  </span>
                </div>

                <div className="rounded-xl border border-[#E2E6DF] bg-[#FAF9F5] p-3.5 text-xs leading-relaxed text-[#38403C]">
                  {recruiterChecks[0]?.explanation ||
                    'Treat unverified recruiter information as unconfirmed, not proof of fraud. Request communication from an authenticated corporate email.'}
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-[#E2E6DF] pt-3 font-mono text-[11px] text-[#8C948F]">
              Standard: Corporate email addresses ending in the official domain
            </div>
          </div>
        </div>

        {/* Other checks if any */}
        {otherChecks.length > 0 && (
          <div className="rounded-2xl border border-[#D8DFD5] bg-white p-5 shadow-xs">
            <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-[#8C948F]">
              Application Channel & Terms Check
            </h3>
            <div className="space-y-3">
              {otherChecks.map((check, i) => (
                <div key={i} className="flex flex-col justify-between gap-2 border-t border-[#E2E6DF] pt-3 first:border-0 first:pt-0 sm:flex-row sm:items-center">
                  <div className="space-y-0.5">
                    <span className="font-display text-xs font-bold text-[#171A19]">{check.label}</span>
                    <p className="text-xs text-[#616965]">{check.explanation}</p>
                  </div>
                  <div className="shrink-0">
                    <StatusPill status={check.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTION 5 — KEY FINDINGS & DETECTED WARNING SIGNS
      ========================================================================= */}
      <section className="rounded-2xl border border-[#D8DFD5] bg-white p-6 shadow-xs sm:p-8">
        <div className="flex items-center justify-between border-b border-[#E2E6DF] pb-4">
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#171A19]">
              Specific Offer Findings
            </h2>
            <p className="mt-0.5 text-xs text-[#616965]">
              Excerpts and warning patterns evaluated in the submitted document.
            </p>
          </div>
          <span className="rounded-full border border-[#D8DFD5] bg-[#E6EBE4] px-3 py-0.5 font-mono text-xs font-bold text-[#171A19]">
            {report.findings.length} {report.findings.length === 1 ? 'Finding' : 'Findings'}
          </span>
        </div>

        {report.findings.length === 0 ? (
          <div className="py-8 text-center" data-testid="empty-findings">
            <ShieldCheck size={36} className="mx-auto text-[#246A3B]" />
            <h3 className="mt-3 font-display text-base font-extrabold text-[#171A19]">
              No overt warning patterns detected
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#616965]">
              The automated rule engine found no explicit mentions of upfront fees, guaranteed hiring, artificial urgency, or unverified chat apps in the submitted content.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {report.findings.map((finding) => (
              <div
                key={finding.code}
                className="rounded-xl border border-[#E2E6DF] bg-white p-5 transition-colors hover:border-[#CBD3C8]"
                data-testid={`finding-${finding.code}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider ${
                        finding.severity === 'elevated'
                          ? 'border border-[#F8D0CB] bg-[#FDF0EE] text-[#C94F45]'
                          : 'border border-[#F9E4B7] bg-[#FDF8EE] text-[#B5740D]'
                      }`}
                    >
                      {finding.severity === 'elevated' ? <ShieldAlert size={12} /> : <AlertTriangle size={12} />}
                      {finding.severity === 'elevated' ? 'Elevated Concern' : 'Caution'}
                    </span>
                    <h3 className="font-display text-sm font-extrabold text-[#171A19]">
                      {finding.title}
                    </h3>
                  </div>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-[#38403C]">
                  {finding.description}
                </p>

                {/* Excerpt if present */}
                {finding.evidenceExcerpt && (
                  <div className="mt-3 rounded-lg border-l-3 border-[#171A19] bg-[#FAF9F5] px-3.5 py-2.5 font-mono text-xs text-[#171A19]">
                    <span className="mb-0.5 block font-sans text-[10px] font-bold uppercase tracking-wider text-[#8C948F]">
                      Excerpt from submitted text:
                    </span>
                    &ldquo;{finding.evidenceExcerpt}&rdquo;
                  </div>
                )}

                <div className="mt-3 grid gap-2.5 sm:grid-cols-2 text-xs">
                  <div className="rounded-lg border border-[#E2E6DF] bg-[#FAF9F5] p-3.5">
                    <span className="mb-0.5 block font-semibold text-[#171A19]">Why this matters:</span>
                    <p className="leading-relaxed text-[#616965]">{finding.whyItMatters}</p>
                  </div>
                  <div className="rounded-lg border border-[#C5E5CF] bg-[#EAF5ED] p-3.5">
                    <span className="mb-0.5 block font-semibold text-[#246A3B]">Recommended action:</span>
                    <p className="leading-relaxed text-[#246A3B]">{finding.recommendedAction}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTION 6 — QUESTIONS TO ASK THE RECRUITER ("ASK THE RECRUITER")
      ========================================================================= */}
      <section className="rounded-2xl border border-[#D8DFD5] bg-[#E6EBE4]/70 p-6 shadow-xs sm:p-7">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-[#171A19] text-[#C7F36B] shadow-2xs">
            <MessageSquare size={16} />
          </div>
          <div>
            <h2 className="font-display text-base font-extrabold text-[#171A19]">
              What to Ask the Recruiter
            </h2>
            <p className="text-xs text-[#616965]">
              Specific questions tailored to resolve unconfirmed details before you proceed.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {report.questionsForRecruiter?.map((question, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#D8DFD5] bg-white p-3.5 shadow-2xs"
            >
              <div className="flex items-start gap-2.5 text-xs text-[#171A19]">
                <span className="grid size-5.5 shrink-0 place-items-center rounded-full bg-[#171A19] font-mono text-[11px] font-bold text-[#C7F36B]">
                  {index + 1}
                </span>
                <span className="font-medium leading-relaxed">{question}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyQuestion(question, index)}
                className="shrink-0 gap-1.5 text-xs text-[#616965] hover:bg-[#FAF9F5] hover:text-[#171A19]"
                title="Copy question to clipboard"
              >
                {copiedQuestionIndex === index ? (
                  <>
                    <Check size={13} className="text-[#246A3B]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    Copy
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          SECTION 7 — WHAT TO DO NEXT (ACTION PLAN)
      ========================================================================= */}
      <section className="rounded-2xl border border-[#D8DFD5] bg-white p-6 shadow-xs sm:p-8">
        <h2 className="font-display text-base font-extrabold text-[#171A19]">
          Recommended Verification Steps
        </h2>
        <p className="mt-0.5 text-xs text-[#616965]">
          Step-by-step actions to safeguard your identity and financial security.
        </p>

        <ol className="mt-4 space-y-3">
          {report.recommendedNextSteps.map((step, index) => (
            <li
              key={index}
              className="flex items-start gap-3 rounded-xl border border-[#E2E6DF] bg-[#FAF9F5] p-3.5 text-xs text-[#38403C]"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#171A19] font-mono text-xs font-bold text-[#C7F36B]">
                {index + 1}
              </span>
              <span className="pt-0.5 font-medium leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* =========================================================================
          SECTION 8 — EVIDENCE & PUBLIC SOURCES (TINYFISH SEARCH)
      ========================================================================= */}
      <section className="rounded-2xl border border-[#D8DFD5] bg-white p-6 shadow-xs sm:p-8">
        <div className="flex items-center justify-between border-b border-[#E2E6DF] pb-4">
          <div>
            <h2 className="font-display text-base font-extrabold text-[#171A19]">
              Retrieved Public Sources
            </h2>
            <p className="mt-0.5 text-xs text-[#616965]">
              Real public web records gathered during live research.
            </p>
          </div>
          <span className="rounded-full border border-[#D8DFD5] bg-[#E6EBE4] px-3 py-0.5 font-mono text-xs font-bold text-[#171A19]">
            {report.evidence.length} {report.evidence.length === 1 ? 'Source' : 'Sources'}
          </span>
        </div>

        {report.evidence.length === 0 ? (
          <div className="py-8 text-center">
            <Search size={32} className="mx-auto text-[#8C948F]" />
            <p className="mt-2 text-xs text-[#616965]">
              {report.researchStatus === 'not_configured'
                ? 'Live web research is not configured. External sources could not be gathered.'
                : report.researchStatus === 'unavailable'
                  ? 'Live web research was temporarily unavailable during this request.'
                  : 'No matching external web records were found for this query.'}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {report.evidence.slice(0, expandSources ? undefined : 3).map((source, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#E2E6DF] p-4 text-xs transition hover:border-[#CBD3C8]"
              >
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-sm font-bold text-[#171A19]">
                      {source.title}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        source.relationship === 'supports'
                          ? 'border border-[#C5E5CF] bg-[#EAF5ED] text-[#246A3B]'
                          : source.relationship === 'contradicts'
                            ? 'border border-[#F8D0CB] bg-[#FDF0EE] text-[#C94F45]'
                            : 'border border-[#D8DFD5] bg-[#E6EBE4] text-[#38403C]'
                      }`}
                    >
                      {source.relationship === 'supports'
                        ? 'Corroborating record'
                        : source.relationship === 'contradicts'
                          ? 'Contradicting record'
                          : 'Contextual record'}
                    </span>
                  </div>

                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono font-bold text-[#171A19] hover:underline"
                  >
                    {source.domain}
                    <ExternalLink size={12} className="text-[#8C948F]" />
                  </a>
                </div>

                <p className="mt-2 line-clamp-3 leading-relaxed text-[#616965]">
                  {source.excerpt}
                </p>
              </div>
            ))}

            {report.evidence.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandSources(!expandSources)}
                className="w-full text-xs font-bold text-[#171A19] hover:bg-[#FAF9F5]"
              >
                {expandSources ? 'Show fewer sources' : `Show all ${report.evidence.length} sources`}
              </Button>
            )}
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTION 9 — SERVICE STATUS & HONEST LIMITATIONS
      ========================================================================= */}
      <footer className="space-y-4 rounded-2xl border border-[#D8DFD5] bg-[#E6EBE4]/60 p-6 text-xs text-[#616965]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D8DFD5] pb-4">
          <div className="flex flex-wrap items-center gap-5 sm:gap-8">
            <div>
              <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#8C948F]">TinyFish Live Research</span>
              <span className="font-mono font-semibold text-[#171A19] capitalize">{report.researchStatus}</span>
            </div>
            <div>
              <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#8C948F]">Groq AI Explanation</span>
              <span className="font-mono font-semibold text-[#171A19] capitalize">{report.aiStatus}</span>
            </div>
            <div>
              <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#8C948F]">Methodology Engine</span>
              <span className="font-mono font-semibold text-[#171A19]">{report.methodologyVersion}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-1.5 font-display font-bold text-[#171A19]">Methodology Limitations & Honest Disclosure</h3>
          <ul className="list-inside list-disc space-y-1 text-[#616965]">
            {report.limitations.map((limit, idx) => (
              <li key={idx} className="leading-relaxed">
                {limit}
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = checkStatusBadge(status);
  const Icon = badge.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-tight"
      style={{
        backgroundColor: badge.bg,
        color: badge.text,
        border: `1px solid ${badge.border}`,
      }}
    >
      <Icon size={12} />
      {badge.label}
    </span>
  );
}

function BriefcaseIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
