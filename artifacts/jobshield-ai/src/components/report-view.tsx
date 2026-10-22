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
      textColor: '#C62828',
      bgColor: '#FFF1F0',
      borderColor: '#FECDCA',
      badgeBg: '#FFF1F0',
      badgeText: '#C62828',
      badgeBorder: '#FECDCA',
      accentBar: '#C62828',
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
      textColor: '#B76E00',
      bgColor: '#FFF7E8',
      borderColor: '#FEDF89',
      badgeBg: '#FFF7E8',
      badgeText: '#8A5100',
      badgeBorder: '#FEDF89',
      accentBar: '#B76E00',
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
      textColor: '#16803D',
      bgColor: '#EFF8F1',
      borderColor: '#A6F4C5',
      badgeBg: '#EFF8F1',
      badgeText: '#16803D',
      badgeBorder: '#A6F4C5',
      accentBar: '#16803D',
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
    textColor: '#475569',
    bgColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    badgeBg: '#F1F5F9',
    badgeText: '#475569',
    badgeBorder: '#CBD5E1',
    accentBar: '#64748B',
    IconComponent: HelpCircle,
  };
}

function checkStatusBadge(status: string) {
  switch (status) {
    case 'match':
      return {
        label: 'Supported by evidence',
        icon: CheckCircle2,
        bg: '#EFF8F1',
        text: '#16803D',
        border: '#A6F4C5',
      };
    case 'partial':
      return {
        label: 'Inconclusive',
        icon: AlertTriangle,
        bg: '#FFF7E8',
        text: '#8A5100',
        border: '#FEDF89',
      };
    case 'discrepancy':
      return {
        label: 'Mismatch found',
        icon: XCircle,
        bg: '#FFF1F0',
        text: '#C62828',
        border: '#FECDCA',
      };
    case 'not_checked':
      return {
        label: 'Not checked',
        icon: Info,
        bg: '#F8FAFC',
        text: '#64748B',
        border: '#E2E8F0',
      };
    default:
      return {
        label: 'Inconclusive / Unverified',
        icon: HelpCircle,
        bg: '#F8FAFC',
        text: '#475569',
        border: '#E2E8F0',
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
    <article className="space-y-7 pb-16 font-sans text-[#172B4D]" aria-label="Job Verification Report">
      {/* =========================================================================
          SECTION 1 — TOP ACTION BAR
      ========================================================================= */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E2E8F0] pb-5">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/analyze')}
            className="gap-2 border-[#D5DDE7] text-[#334155] hover:bg-[#F8FAFC]"
            data-testid="button-back-to-analyze"
          >
            <ArrowLeft size={14} />
            Analyze Another Offer
          </Button>
          <span className="text-xs font-medium text-[#64748B]">
            Reviewed on {new Date(report.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            className="gap-2 border-[#D5DDE7] text-[#334155] hover:bg-[#F8FAFC]"
            data-testid="button-copy-summary"
          >
            {copied ? (
              <>
                <Check size={14} className="text-[#16803D]" />
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
            className="gap-2 border-[#D5DDE7] text-[#334155] hover:bg-[#F8FAFC]"
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
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#475569]">
                <FileText size={13} />
                {report.sourceType.toUpperCase()} SUBMISSION
              </span>
              <span className="truncate text-xs text-[#64748B]">{report.sourceLabel}</span>
            </div>

            <h1
              className="font-display mt-2.5 text-2xl font-black tracking-tight text-[#0F172A] sm:text-3xl"
              data-testid="text-report-title"
            >
              {report.jobTitle || report.sourceLabel || 'Job Opportunity Review'}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#475569]">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#1E293B]">
                <Building2 size={16} className="text-[#2563EB]" />
                {report.companyName || 'Company Not Specified'}
              </span>
              {report.companyDomain && (
                <span className="inline-flex items-center gap-1 text-xs text-[#2563EB]">
                  <Globe2 size={13} />
                  {report.companyDomain}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold shadow-sm"
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
          className="mt-6 rounded-xl border p-5"
          style={{
            backgroundColor: assessment.bgColor,
            borderColor: assessment.borderColor,
          }}
        >
          <div className="flex items-start gap-3.5">
            <div
              className="grid size-9 shrink-0 place-items-center rounded-lg"
              style={{ backgroundColor: 'white', color: assessment.textColor }}
            >
              <assessment.IconComponent size={20} />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-base font-extrabold" style={{ color: assessment.textColor }}>
                {assessment.headline}
              </h2>
              <p className="text-xs leading-relaxed text-[#334155]">
                {report.assessmentRationale || assessment.summaryNote}
              </p>
            </div>
          </div>

          {/* AI or Deterministic Narrative Summary */}
          {report.summary && (
            <div className="mt-4 rounded-lg bg-white/80 p-3.5 text-xs leading-relaxed text-[#1E293B] border border-white">
              <strong className="block font-semibold text-[#0F172A] mb-1">Detailed Findings Summary:</strong>
              {report.summary}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-[#64748B]">
            <Info size={13} className="shrink-0" />
            <span>
              <strong>Integrity reminder:</strong> The absence of detected warning signs is not proof that an offer is authentic. Legitimate organizations can still be impersonated.
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 3 — EXTRACTED OFFER DETAILS
      ========================================================================= */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[#64748B]">
          Extracted Offer Details
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
              <DollarSign size={14} className="text-[#16803D]" />
              Compensation
            </span>
            <div className="mt-1.5 text-sm font-bold text-[#0F172A]">
              {report.offerDetails?.compensation || 'Not specified in text'}
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
              <BriefcaseIcon size={14} className="text-[#2563EB]" />
              Employment Type
            </span>
            <div className="mt-1.5 text-sm font-bold text-[#0F172A]">
              {report.offerDetails?.employmentType || 'Not specified'}
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
              <MapPin size={14} className="text-[#D97706]" />
              Workplace / Location
            </span>
            <div className="mt-1.5 text-sm font-bold text-[#0F172A]">
              {report.offerDetails?.location || 'Not specified'}
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
              <Mail size={14} className="text-[#7C3AED]" />
              Recruiter / Contact Email
            </span>
            <div className="mt-1.5 truncate text-sm font-bold text-[#0F172A]" title={report.offerDetails?.contactEmail || 'None detected'}>
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#0F172A]">
              Independent Verification Checks
            </h2>
            <p className="text-xs text-[#64748B]">
              Evaluated against public corporate records and authoritative web searches.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Card 1: Company Identity Check */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-[#0F172A]">
                  <Building2 size={16} className="text-[#2563EB]" />
                  Company Identity Check
                </span>
                {companyChecks[0] && (
                  <StatusPill status={companyChecks[0].status} />
                )}
              </div>

              <div className="mt-3.5 space-y-2.5 text-xs">
                <div>
                  <span className="text-[#64748B] block">Extracted Employer:</span>
                  <strong className="text-[#0F172A] text-sm">
                    {report.companyName || 'Not identified in submitted content'}
                  </strong>
                </div>

                <div>
                  <span className="text-[#64748B] block">Authoritative Web Domain:</span>
                  {report.companyDomain ? (
                    <a
                      href={`https://${report.companyDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#2563EB] hover:underline"
                    >
                      {report.companyDomain}
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="text-[#94A3B8]">No verified corporate domain found</span>
                  )}
                </div>

                <div className="rounded-lg bg-[#F8FAFC] p-3 text-xs leading-relaxed text-[#334155] border border-[#E2E8F0]">
                  {companyChecks[0]?.explanation ||
                    (report.companyName
                      ? `Searched public sources for "${report.companyName}".`
                      : 'No company name was present in the submitted material to research.')}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#E2E8F0] text-[11px] text-[#64748B]">
              Source: Authoritative corporate web presence or domain index
            </div>
          </div>

          {/* Card 2: Job Vacancy Check */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-[#0F172A]">
                  <FileSearch size={16} className="text-[#D97706]" />
                  Job Vacancy Check
                </span>
                {vacancyChecks[0] && (
                  <StatusPill status={vacancyChecks[0].status} />
                )}
              </div>

              <div className="mt-3.5 space-y-2.5 text-xs">
                <div>
                  <span className="text-[#64748B] block">Specified Role / Title:</span>
                  <strong className="text-[#0F172A] text-sm">
                    {report.jobTitle || 'Role title not specified'}
                  </strong>
                </div>

                <div>
                  <span className="text-[#64748B] block">Careers Portal Confirmation:</span>
                  <span className="font-semibold text-[#0F172A]">
                    {vacancyChecks[0]?.status === 'match'
                      ? 'Role corroborated in public records'
                      : vacancyChecks[0]?.status === 'partial'
                        ? 'Role not located in retrieved public excerpts'
                        : 'Could not corroborate against official portal'}
                  </span>
                </div>

                <div className="rounded-lg bg-[#F8FAFC] p-3 text-xs leading-relaxed text-[#334155] border border-[#E2E8F0]">
                  {vacancyChecks[0]?.explanation ||
                    'Confirm this vacancy directly on the employer’s careers portal. A genuine company can still be impersonated in a fraudulent vacancy.'}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#E2E8F0] text-[11px] text-[#B76E00]">
              Warning: A real company can still be impersonated in a fake role
            </div>
          </div>

          {/* Card 3: Recruiter and Contact Check */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-[#0F172A]">
                  <UserCheck size={16} className="text-[#7C3AED]" />
                  Recruiter & Contact Check
                </span>
                {recruiterChecks[0] && (
                  <StatusPill status={recruiterChecks[0].status} />
                )}
              </div>

              <div className="mt-3.5 space-y-2.5 text-xs">
                <div>
                  <span className="text-[#64748B] block">Identified Contact Email:</span>
                  <strong className="text-[#0F172A] text-sm truncate block" title={recruiterChecks[0]?.submittedValue || 'None found'}>
                    {recruiterChecks[0]?.submittedValue || 'No contact email in text'}
                  </strong>
                </div>

                <div>
                  <span className="text-[#64748B] block">Domain Authentication:</span>
                  <span className="font-semibold text-[#0F172A]">
                    {recruiterChecks[0]?.status === 'discrepancy'
                      ? 'Free / Public email address (high caution)'
                      : recruiterChecks[0]?.status === 'match'
                        ? 'Authenticated corporate domain'
                        : 'Unverified contact domain'}
                  </span>
                </div>

                <div className="rounded-lg bg-[#F8FAFC] p-3 text-xs leading-relaxed text-[#334155] border border-[#E2E8F0]">
                  {recruiterChecks[0]?.explanation ||
                    'Treat unverified recruiter information as unconfirmed, not proof of fraud. Request communication from an authenticated corporate email.'}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#E2E8F0] text-[11px] text-[#64748B]">
              Standard: Corporate email addresses ending in the official domain
            </div>
          </div>
        </div>

        {/* Other checks if any */}
        {otherChecks.length > 0 && (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">
              Application Channel & Terms Check
            </h3>
            <div className="space-y-3">
              {otherChecks.map((check, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#F1F5F9] pt-2.5 first:border-0 first:pt-0">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs text-[#0F172A]">{check.label}</span>
                    <p className="text-xs text-[#475569]">{check.explanation}</p>
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
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#0F172A]">
              Specific Offer Findings
            </h2>
            <p className="text-xs text-[#64748B]">
              Excerpts and warning patterns evaluated in the submitted document.
            </p>
          </div>
          <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-extrabold text-[#475569]">
            {report.findings.length} {report.findings.length === 1 ? 'Finding' : 'Findings'}
          </span>
        </div>

        {report.findings.length === 0 ? (
          <div className="py-8 text-center" data-testid="empty-findings">
            <ShieldCheck size={36} className="mx-auto text-[#16803D]" />
            <h3 className="mt-3 font-display text-base font-extrabold text-[#0F172A]">
              No overt warning patterns detected
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#64748B]">
              The automated rule engine found no explicit mentions of upfront fees, guaranteed hiring, artificial urgency, or unverified chat apps in the submitted content.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {report.findings.map((finding) => (
              <div
                key={finding.code}
                className="rounded-xl border border-[#E2E8F0] p-4.5 transition-colors hover:border-[#CBD5E1]"
                data-testid={`finding-${finding.code}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${
                        finding.severity === 'elevated'
                          ? 'bg-[#FFF1F0] text-[#C62828] border border-[#FECDCA]'
                          : 'bg-[#FFF7E8] text-[#8A5100] border border-[#FEDF89]'
                      }`}
                    >
                      {finding.severity === 'elevated' ? <ShieldAlert size={12} /> : <AlertTriangle size={12} />}
                      {finding.severity === 'elevated' ? 'Elevated Concern' : 'Caution'}
                    </span>
                    <h3 className="font-display text-sm font-extrabold text-[#0F172A]">
                      {finding.title}
                    </h3>
                  </div>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-[#334155]">
                  {finding.description}
                </p>

                {/* Excerpt if present */}
                {finding.evidenceExcerpt && (
                  <div className="mt-3 rounded-md bg-[#F8FAFC] border-l-2 border-[#2563EB] px-3 py-2 text-xs font-mono text-[#334155]">
                    <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-[#64748B] mb-0.5">
                      Excerpt from submitted text:
                    </span>
                    &ldquo;{finding.evidenceExcerpt}&rdquo;
                  </div>
                )}

                <div className="mt-3 grid gap-2.5 sm:grid-cols-2 text-xs">
                  <div className="rounded-lg bg-[#F8FAFC] p-3 border border-[#E2E8F0]">
                    <span className="font-semibold text-[#0F172A] block mb-0.5">Why this matters:</span>
                    <p className="text-[#475569] leading-relaxed">{finding.whyItMatters}</p>
                  </div>
                  <div className="rounded-lg bg-[#EFF8F1] p-3 border border-[#A6F4C5]">
                    <span className="font-semibold text-[#16803D] block mb-0.5">Recommended action:</span>
                    <p className="text-[#166534] leading-relaxed">{finding.recommendedAction}</p>
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
      <section className="rounded-2xl border border-[#FEDF89] bg-[#FFFCF5] p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-[#B76E00] text-white">
            <MessageSquare size={16} />
          </div>
          <div>
            <h2 className="font-display text-base font-extrabold text-[#78350F]">
              What to Ask the Recruiter
            </h2>
            <p className="text-xs text-[#92400E]">
              Specific questions tailored to resolve unconfirmed details before you proceed.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {report.questionsForRecruiter?.map((question, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#FDE68A] bg-white p-3.5 shadow-xs"
            >
              <div className="flex items-start gap-2.5 text-xs text-[#1E293B]">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#FEF3C7] text-[11px] font-bold text-[#92400E]">
                  {index + 1}
                </span>
                <span className="font-medium leading-relaxed">{question}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyQuestion(question, index)}
                className="shrink-0 gap-1.5 text-xs text-[#78350F] hover:bg-[#FEF3C7]"
                title="Copy question to clipboard"
              >
                {copiedQuestionIndex === index ? (
                  <>
                    <Check size={13} className="text-[#16803D]" />
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
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <h2 className="font-display text-base font-extrabold text-[#0F172A]">
          Recommended Verification Steps
        </h2>
        <p className="text-xs text-[#64748B] mt-0.5">
          Step-by-step actions to safeguard your identity and financial security.
        </p>

        <ol className="mt-4 space-y-3">
          {report.recommendedNextSteps.map((step, index) => (
            <li
              key={index}
              className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-xs text-[#334155]"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#2563EB] text-xs font-bold text-white">
                {index + 1}
              </span>
              <span className="font-medium leading-relaxed pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* =========================================================================
          SECTION 8 — EVIDENCE & PUBLIC SOURCES (TINYFISH SEARCH)
      ========================================================================= */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
          <div>
            <h2 className="font-display text-base font-extrabold text-[#0F172A]">
              Retrieved Public Sources
            </h2>
            <p className="text-xs text-[#64748B]">
              Real public web records gathered during live research.
            </p>
          </div>
          <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-extrabold text-[#475569]">
            {report.evidence.length} {report.evidence.length === 1 ? 'Source' : 'Sources'}
          </span>
        </div>

        {report.evidence.length === 0 ? (
          <div className="py-8 text-center">
            <Search size={32} className="mx-auto text-[#94A3B8]" />
            <p className="mt-2 text-xs text-[#64748B]">
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
                className="rounded-xl border border-[#E2E8F0] p-4 text-xs hover:border-[#CBD5E1]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#0F172A] truncate">
                      {source.title}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        source.relationship === 'supports'
                          ? 'bg-[#EFF8F1] text-[#16803D]'
                          : source.relationship === 'contradicts'
                            ? 'bg-[#FFF1F0] text-[#C62828]'
                            : 'bg-[#F1F5F9] text-[#475569]'
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
                    className="inline-flex items-center gap-1 font-semibold text-[#2563EB] hover:underline"
                  >
                    {source.domain}
                    <ExternalLink size={12} />
                  </a>
                </div>

                <p className="mt-2 text-[#475569] leading-relaxed line-clamp-3">
                  {source.excerpt}
                </p>
              </div>
            ))}

            {report.evidence.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandSources(!expandSources)}
                className="w-full text-xs text-[#2563EB] hover:bg-[#F8FAFC]"
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
      <footer className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-xs text-[#475569] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="block text-[11px] font-bold text-[#64748B]">TinyFish Live Research:</span>
              <span className="font-semibold text-[#0F172A] capitalize">{report.researchStatus}</span>
            </div>
            <div>
              <span className="block text-[11px] font-bold text-[#64748B]">Groq AI Explanation:</span>
              <span className="font-semibold text-[#0F172A] capitalize">{report.aiStatus}</span>
            </div>
            <div>
              <span className="block text-[11px] font-bold text-[#64748B]">Methodology Engine:</span>
              <span className="font-semibold text-[#0F172A]">{report.methodologyVersion}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-[#0F172A] mb-1.5">Methodology Limitations & Honest Disclosure</h3>
          <ul className="space-y-1 text-[#64748B] list-disc list-inside">
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
      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold"
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
