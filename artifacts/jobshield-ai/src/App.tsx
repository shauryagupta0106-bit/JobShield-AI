import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import {
  getGetDashboardSummaryQueryKey,
  getListAnalysesQueryKey,
  getGetAnalysisQueryKey,
  getSearchCompanySourcesQueryKey,
  useAnalyzeSubmission,
  useAnalyzeUrl,
  useClearAnalyses,
  useDeleteAnalysis,
  useGetAnalysis,
  useGetDashboardSummary,
  useHealthCheck,
  useListAnalyses,
  useSearchCompanySources,
} from '@workspace/api-client-react';
import type { AnalysisReport, AnalysisSummary, SearchCompanySourcesParams } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen,
  Check, CheckCircle2, Clipboard, FileCheck2, FileText, Globe2, Info,
  LoaderCircle, LockKeyhole, Menu, Search, Shield, ShieldAlert, ShieldCheck,
  Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary as RoutedErrorBoundary } from '@/components/error-boundary';
import { ReportView } from '@/components/report-view';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const NAV = [
  { href: '/', label: 'Overview', icon: ShieldCheck },
  { href: '/analyze', label: 'Analyze an offer', icon: FileCheck2 },
  { href: '/history', label: 'Your history', icon: Clipboard },
  { href: '/companies', label: 'Company sources', icon: Search },
  { href: '/safety', label: 'Safety guide', icon: BookOpen },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${compact ? '' : 'brand-lockup'}`}>
      <span className="relative grid size-8.5 shrink-0 place-items-center rounded-lg bg-[#242927] border border-[#353C39] text-[#C7F36B]" aria-hidden="true">
        <Shield size={18} strokeWidth={2} />
        <span className="absolute bottom-[8px] left-[13px] h-[5px] w-[2px] rotate-45 rounded bg-[#C7F36B]" />
        <span className="absolute bottom-[8px] left-[16px] h-[3px] w-[2px] -rotate-45 rounded bg-[#C7F36B]" />
      </span>
      {!compact && (
        <span className="font-display text-[16px] font-extrabold tracking-tight text-white">
          JobShield<span className="text-[#C7F36B]">.AI</span>
        </span>
      )}
    </span>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const health = useHealthCheck();
  const okay = health.data?.status === 'ok' || health.data?.status === 'healthy';
  return (
    <div className="min-h-[100dvh] bg-[#F6F4EE] text-[#171A19]">
      <header className="sticky top-0 z-40 border-b border-[#242927] bg-[#171A19] text-[#F6F4EE]">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="rounded-lg focus-ring" aria-label="JobShield AI home" data-testid="link-brand-home"><BrandMark /></Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {NAV.map(({ href, label }) => (
              <Link key={href} href={href} data-testid={`nav-${label.toLowerCase().replaceAll(' ', '-')}`}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${location === href ? 'bg-[#242927] text-[#C7F36B] font-semibold' : 'text-[#A0ABA5] hover:bg-[#242927] hover:text-[#F6F4EE]'}`}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-4 lg:flex">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] text-[#A0ABA5]" data-testid="status-api-health">
              <span className={`size-1.5 rounded-full ${health.isLoading ? 'bg-[#E5A83B]' : health.isError ? 'bg-[#C94F45]' : okay ? 'bg-[#C7F36B]' : 'bg-[#E5A83B]'}`} />
              {health.isLoading ? 'CHECKING...' : health.isError ? 'OFFLINE' : okay ? 'SYSTEM ONLINE' : `STATUS: ${health.data?.status ?? 'UNKNOWN'}`}
            </span>
            <Link href="/analyze" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#C7F36B] px-4 text-[13px] font-bold text-[#171A19] transition hover:bg-[#BCEE57] active:bg-[#B1E549] shadow-xs" data-testid="button-header-analyze">Check an offer <ArrowRight size={14} /></Link>
          </div>
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}
            className="grid size-10 place-items-center rounded-lg border border-[#353C39] bg-[#242927] text-[#F6F4EE] lg:hidden" data-testid="button-mobile-menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        {menuOpen && <nav className="grid gap-1 border-t border-[#242927] bg-[#171A19] px-5 py-3 lg:hidden" aria-label="Mobile navigation">
          {NAV.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${location === href ? 'bg-[#242927] text-[#C7F36B] font-semibold' : 'text-[#A0ABA5] hover:text-[#F6F4EE]'}`} data-testid={`mobile-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} />{label}</Link>)}
          <div className="px-3 py-2 font-mono text-xs text-[#A0ABA5]" data-testid="mobile-health-status">System: {health.isLoading ? 'checking' : health.isError ? 'unavailable' : health.data?.status ?? 'unknown'}</div>
        </nav>}
      </header>
      <main className="bg-[#F6F4EE]">{children}</main>
      <footer className="border-t border-[#D8DFD5] bg-[#EAE8E1] text-[#616965]">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-3"><BrandMark compact /><div><div className="text-sm font-bold text-[#171A19]">JobShield AI</div><div className="text-xs text-[#616965]">Evidence-grounded job & offer verification</div></div></div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-[#616965]">
            <Link href="/safety" className="hover:text-[#171A19] transition" data-testid="footer-safety">Safety guide</Link>
            <Link href="/history" className="hover:text-[#171A19] transition" data-testid="footer-history">Private history</Link>
            <Link href="/companies" className="hover:text-[#171A19] transition">Company sources</Link>
            <span className="text-[#8C948F]">Empirical evidence · Not legal determinations</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D8DFD5] bg-[#E6EBE4] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[.12em] text-[#171A19]">{children}</div>;
}

function HomePage() {
  return (
    <div className="page-enter">
      <section className="relative overflow-hidden border-b border-[#D8DFD5] bg-[#F6F4EE]">
        <div className="absolute inset-y-0 right-0 hidden w-[48%] soft-grid lg:block" aria-hidden="true" />
        <div className="absolute right-[14%] top-[15%] hidden size-[430px] rounded-full border border-[#D8DFD5] lg:block" aria-hidden="true" />
        <div className="absolute right-[19%] top-[21%] hidden size-[320px] rounded-full border border-[#D8DFD5] lg:block" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.03fr_.97fr] lg:gap-8 lg:py-28">
          <div className="max-w-[660px]">
            <Eyebrow><ShieldCheck size={14} className="text-[#171A19]" /> Evidence-Grounded Verification</Eyebrow>
            <h1 className="font-display max-w-[660px] text-[clamp(40px,5.3vw,66px)] font-extrabold leading-[1.04] tracking-[-.065em] text-[#171A19]" data-testid="text-home-headline">Not Sure About That Job Offer? Investigate Before You Apply.</h1>
            <p className="mt-5 max-w-[540px] text-lg font-semibold leading-8 text-[#2D3330]" data-testid="text-home-tagline">Verify Before You Apply.</p>
            <p className="mt-3 max-w-[540px] text-[15px] leading-7 text-[#616965]">Cross-examine recruitment messages, public job links, and offer letters against public records, company domains, and empirical fraud patterns.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/analyze" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#C7F36B] px-6 text-sm font-bold text-[#171A19] shadow-xs transition hover:bg-[#BCEE57] active:bg-[#B1E549]" data-testid="button-start-analysis">Analyze an offer <ArrowRight size={17} /></Link>
              <Link href="/safety" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#D8DFD5] bg-white px-5 text-sm font-bold text-[#171A19] transition hover:bg-[#E6EBE4]" data-testid="button-read-safety">Read safety guide <ArrowUpRight size={16} /></Link>
            </div>
            <div className="mt-8 flex items-center gap-2 font-mono text-xs text-[#616965]"><LockKeyhole size={14} className="text-[#171A19]" /> Anonymous browser session. Zero account or password required.</div>
          </div>
          <div className="relative mx-auto w-full max-w-[470px] lg:ml-auto lg:mr-4">
            <div className="absolute -left-6 top-12 hidden h-20 w-20 rounded-2xl border border-[#D8DFD5] bg-[#E6EBE4] sm:block" />
            <div className="relative rounded-2xl border border-[#E2E6DF] bg-white p-5 shadow-[0_20px_50px_-30px_rgba(23,26,25,.18)] sm:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-[#E2E6DF] pb-5">
                <div><div className="font-mono text-[11px] font-bold uppercase tracking-[.12em] text-[#616965]">Investigation Brief</div><div className="mt-1.5 font-display text-xl font-bold tracking-tight text-[#171A19]">Evidence Before Instinct</div></div>
                <span className="grid size-11 place-items-center rounded-xl bg-[#171A19] text-[#C7F36B]"><FileCheck2 size={22} /></span>
              </div>
              <div className="space-y-4 py-5">
                {[
                  ['Corroborated Details', 'Compared against the submitted offer', CheckCircle2, '#2D7D46'],
                  ['Public Evidence Sources', 'Live web research with real citations', Globe2, '#171A19'],
                  ['Explicit Unknowns', 'Limits and gaps highlighted honestly', Info, '#B5740D'],
                ].map(([title, detail, Icon, color], i) => <div className="flex gap-3" key={title as string}><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#F6F4EE]" style={{ color: color as string }}><Icon size={16} /></span><div className="min-w-0 flex-1"><div className="text-sm font-bold text-[#171A19]">{title as string}</div><div className="mt-0.5 text-xs leading-5 text-[#616965]">{detail as string}</div></div><span className="pt-2 font-mono text-[10px] text-[#A0ABA5]">0{i + 1}</span></div>)}
              </div>
              <div className="rounded-xl border border-[#D8DFD5] bg-[#F6F4EE] px-4 py-3 text-xs leading-5 text-[#2D3330]">JobShield findings are evidence-grounded heuristic signals—not mathematical guarantees or legal fraud determinations.</div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1280px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16 lg:py-20">
        <div><Eyebrow><Sparkles size={14} className="text-[#171A19]" /> Investigation Flow</Eyebrow><h2 className="font-display max-w-[430px] text-3xl font-extrabold leading-tight tracking-[-.045em] text-[#171A19] sm:text-4xl">A second look, grounded in what can be verified.</h2><p className="mt-4 max-w-[420px] text-sm leading-relaxed text-[#616965]">Start with a public listing, pasted message, or offer letter PDF. We organize available evidence so you can make informed decisions rather than guessing.</p></div>
        <div className="grid gap-0 sm:grid-cols-3">
          {[['01', 'Bring the details', 'Paste the offer, add a public listing URL, or extract text from a PDF locally.'], ['02', 'Review evidence', 'Examine findings across Company, Vacancy, and Recruiter domains.'], ['03', 'Take action', 'Use tailored questions and verify directly through official channels.']].map(([n, title, body]) => <article className="border-t border-[#D8DFD5] py-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pr-4" key={n}><span className="font-mono text-xs font-bold text-[#171A19]">{n}</span><h3 className="mt-2 text-sm font-bold text-[#171A19]">{title}</h3><p className="mt-1.5 text-xs leading-relaxed text-[#616965]">{body}</p></article>)}
        </div>
      </section>
      <section className="border-y border-[#D8DFD5] bg-[#E6EBE4]">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-5 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-16">
          <div><Eyebrow><ShieldAlert size={14} className="text-[#171A19]" /> Keep perspective</Eyebrow><h2 className="font-display text-2xl font-extrabold tracking-[-.04em] text-[#171A19] sm:text-3xl">A signal is a starting point.<br className="hidden sm:block" /> Your judgment still matters.</h2><p className="mt-3 max-w-[640px] text-sm leading-relaxed text-[#616965]">Online records can be incomplete or out of date. JobShield never calls an offer legitimate simply because no warnings were detected.</p></div>
          <Link href="/companies" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D8DFD5] bg-white px-5 text-sm font-bold text-[#171A19] hover:bg-[#F6F4EE] shadow-xs" data-testid="button-company-sources">Search public sources <ArrowRight size={16} /></Link>
        </div>
      </section>
    </div>
  );
}

type AnalyzeFormValues = { content: string; sourceLabel: string; companyHint: string; roleHint: string };
type UrlFormValues = { url: string; companyHint: string; roleHint: string };

async function extractLocalPdfText(file: File): Promise<string> {
  if (file.size === 0) {
    throw new Error('The selected PDF file is completely empty (0 bytes). Please select a valid document.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('That PDF is larger than 8 MB. Choose a smaller file or copy and paste the relevant text.');
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Invalid file format. Please choose a standard PDF file (.pdf) to continue.');
  }

  const [{ GlobalWorkerOptions, getDocument }, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useWorkerFetch: false,
  });

  const timeout = window.setTimeout(() => {
    void loadingTask.destroy();
  }, 30_000);

  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages > 100) {
      throw new Error('This PDF has more than 100 pages. Choose a shorter document or paste the relevant offer text.');
    }

    const pageTexts: string[] = [];
    let characterCount = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages && characterCount < 50000; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      let lastY: number | null = null;
      let pageText = '';

      for (const rawItem of content.items) {
        if (!('str' in rawItem) || !rawItem.str) continue;
        const item = rawItem as typeof rawItem & { str: string; hasEOL?: boolean; transform?: number[] };
        const currentY = Array.isArray(item.transform) ? item.transform[5] : null;
        const hasEol = Boolean(item.hasEOL);

        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
          pageText += '\n';
        } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }

        pageText += item.str;
        if (hasEol) {
          pageText += '\n';
        }
        lastY = currentY;
      }

      pageTexts.push(pageText);
      characterCount += pageText.length;
      page.cleanup();
    }

    const rawExtracted = pageTexts.join('\n\n');
    // Normalize horizontal whitespace per line while preserving structural linebreaks
    const extracted = rawExtracted
      .replace(/[^\S\r\n]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();

    if (extracted.length < 20) {
      throw new Error('No readable text was found in this PDF. It may be a scanned or image-only document; please copy and paste the offer text instead.');
    }
    return extracted.slice(0, 50000);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'PasswordException' || /password/i.test(error.message)) {
        throw new Error('This PDF is password-protected. Please upload an unprotected copy or paste the offer text.');
      }
      if (error.name === 'InvalidPDFException' || /invalid|corrupt/i.test(error.message)) {
        throw new Error('This file appears to be corrupted or is not a valid PDF document. Please check the file and try again.');
      }
      if (
        error.message.startsWith('This PDF has more than') ||
        error.message.startsWith('No readable text was found') ||
        error.message.startsWith('The selected PDF')
      ) {
        throw error;
      }
    }
    throw new Error('We could not read this PDF. Try a standard text-based PDF or paste the offer text directly.');
  } finally {
    window.clearTimeout(timeout);
    await loadingTask.destroy().catch(() => undefined);
  }
}

function AnalyzePage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<'text' | 'url'>('text');
  const [fileName, setFileName] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [notice, setNotice] = useState('');
  const analyzeText = useAnalyzeSubmission();
  const analyzeUrl = useAnalyzeUrl();
  const queryClient = useQueryClient();
  const textForm = useForm<AnalyzeFormValues>({ defaultValues: { content: '', sourceLabel: '', companyHint: '', roleHint: '' } });
  const urlForm = useForm<UrlFormValues>({ defaultValues: { url: '', companyHint: '', roleHint: '' } });

  const onTextSubmit = textForm.handleSubmit((values) => {
    setNotice(''); setPdfError('');
    if (values.content.trim().length < 20) { setNotice('Add at least 20 characters of offer or listing text.'); return; }
    const effectiveSourceLabel = fileName ? `PDF: ${fileName}` : values.sourceLabel.trim() || undefined;
    analyzeText.mutate({ data: { inputType: fileName ? 'pdf' : 'text', content: values.content.trim(), sourceLabel: effectiveSourceLabel, companyHint: values.companyHint.trim() || undefined, roleHint: values.roleHint.trim() || undefined } }, {
      onSuccess: (report) => {
        queryClient.invalidateQueries({ queryKey: getListAnalysesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(report.id) });
        navigate(`/report/${encodeURIComponent(report.id)}`);
      },
    });
  });

  const onUrlSubmit = urlForm.handleSubmit((values) => {
    setNotice('');
    try { const parsed = new URL(values.url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
    catch { setNotice('Enter a complete public link beginning with https://'); return; }
    analyzeUrl.mutate({ data: { url: values.url.trim(), companyHint: values.companyHint.trim() || undefined, roleHint: values.roleHint.trim() || undefined } }, {
      onSuccess: (report) => {
        queryClient.invalidateQueries({ queryKey: getListAnalysesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(report.id) });
        navigate(`/report/${encodeURIComponent(report.id)}`);
      },
    });
  });

  const busy = analyzeText.isPending || analyzeUrl.isPending;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPdfError('');
    if (!file) return;
    try {
      const text = await extractLocalPdfText(file);
      textForm.setValue('content', text, { shouldValidate: true });
      textForm.setValue('sourceLabel', `PDF: ${file.name}`);
      setFileName(file.name);
    } catch (error) {
      setFileName('');
      setPdfError(error instanceof Error ? error.message : 'Unable to read this file.');
      event.target.value = '';
    }
  }
  return (
    <div className="page-enter mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="max-w-[680px]">
        <Eyebrow><ShieldCheck size={14} className="text-[#171A19]" /> Job Verification Engine</Eyebrow>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#171A19] sm:text-4xl" data-testid="text-analyze-title">
          Analyze a job offer
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#616965] sm:text-base">
          Inspect an opportunity using pasted text, an offer PDF, or a public job link. JobShield cross-references public records and identifies fraud signals without scoring guesswork.
        </p>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
        <section className="rounded-2xl border border-[#E2E6DF] bg-white p-5 shadow-[0_4px_24px_-8px_rgba(23,26,25,0.06)] sm:p-7">
          {/* Refined segmented tab control */}
          <div className="inline-flex rounded-xl bg-[#E6EBE4] p-1 border border-[#D8DFD5] shadow-2xs" role="tablist" aria-label="Offer input type">
            <button
              type="button"
              onClick={() => { setTab('text'); setNotice(''); }}
              aria-selected={tab === 'text'}
              role="tab"
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171A19] ${
                tab === 'text'
                  ? 'bg-white text-[#171A19] shadow-xs border border-[#D8DFD5]'
                  : 'text-[#616965] hover:text-[#171A19] hover:bg-white/50 border border-transparent'
              }`}
              data-testid="tab-paste-text"
            >
              <FileText size={15} className={tab === 'text' ? 'text-[#171A19]' : 'text-[#616965]'} />
              <span>Paste or PDF</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('url'); setNotice(''); }}
              aria-selected={tab === 'url'}
              role="tab"
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171A19] ${
                tab === 'url'
                  ? 'bg-white text-[#171A19] shadow-xs border border-[#D8DFD5]'
                  : 'text-[#616965] hover:text-[#171A19] hover:bg-white/50 border border-transparent'
              }`}
              data-testid="tab-url"
            >
              <Globe2 size={15} className={tab === 'url' ? 'text-[#171A19]' : 'text-[#616965]'} />
              <span>Public URL</span>
            </button>
          </div>

          {tab === 'text' ? (
            <Form {...textForm}>
              <form onSubmit={onTextSubmit} className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="offer-text" className="text-xs sm:text-sm font-semibold text-[#171A19] flex items-center gap-1.5">
                    Offer or job description
                    <span className="text-[11px] font-normal text-[#8C948F]">· required</span>
                  </label>
                  <div id="text-length" className="text-[11px] font-medium text-[#8C948F] flex items-center gap-1.5 font-mono">
                    <span className="hidden sm:inline">20–50k chars</span>
                    <span className="hidden sm:inline text-[#D8DFD5]">·</span>
                    <span className={textForm.watch('content').length > 45000 ? 'text-[#B5740D] font-bold' : 'text-[#616965]'} data-testid="text-character-count">
                      {textForm.watch('content').length.toLocaleString()} / 50,000
                    </span>
                  </div>
                </div>

                <Textarea
                  id="offer-text"
                  maxLength={50000}
                  {...textForm.register('content')}
                  placeholder="Paste the job description, recruitment email, or offer message here. Include sender contacts, requested next steps, and payment or platform instructions when relevant."
                  className="min-h-[160px] sm:min-h-[185px] resize-y rounded-xl border border-[#D8DFD5] bg-[#FAFAF7] px-3.5 py-3 text-sm leading-relaxed text-[#171A19] placeholder:text-[#8C948F] transition focus:border-[#171A19] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C7F36B] shadow-2xs"
                  aria-describedby="text-length"
                  data-testid="input-offer-text"
                />

                {/* PDF extraction toolbar */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#D8DFD5] bg-[#F6F4EE] p-2.5 sm:px-3.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <label
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#D8DFD5] bg-white px-3 text-xs font-semibold text-[#171A19] shadow-2xs transition hover:border-[#171A19] hover:bg-[#F6F4EE] focus-within:ring-2 focus-within:ring-[#171A19]"
                      data-testid="label-upload-pdf"
                    >
                      <Upload size={13} className="text-[#171A19] shrink-0" />
                      <span>{fileName ? 'Replace PDF' : 'Extract from PDF'}</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={onFile}
                        className="sr-only"
                        aria-label="Choose a PDF for local text extraction"
                        data-testid="input-upload-pdf"
                      />
                    </label>
                    <span className="hidden sm:inline text-[11px] text-[#616965]">
                      Local browser extraction. Original file is never uploaded.
                    </span>
                  </div>

                  {fileName && (
                    <div
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[#C5E5CF] bg-[#EAF5ED] px-2.5 py-1 text-xs font-medium text-[#246A3B]"
                      data-testid="text-pdf-loaded"
                    >
                      <Check size={13} className="text-[#246A3B] shrink-0" />
                      <span className="truncate max-w-[180px] sm:max-w-[240px]">{fileName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFileName('');
                          textForm.setValue('sourceLabel', '');
                          textForm.setValue('content', '');
                        }}
                        className="ml-1 rounded p-0.5 text-[#246A3B] hover:bg-[#C5E5CF] hover:text-[#C94F45] transition"
                        aria-label="Remove extracted PDF text"
                        data-testid="button-remove-pdf"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {pdfError && (
                  <p role="alert" className="mt-2.5 rounded-lg border border-[#F9E4B7] bg-[#FDF8EE] px-3.5 py-2 text-xs font-medium text-[#B5740D]" data-testid="error-pdf">
                    {pdfError}
                  </p>
                )}

                {/* Company & Role hints */}
                <div className="mt-5 border-t border-[#E2E6DF] pt-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#8C948F]">
                      Target Details (Optional)
                    </span>
                    <span className="text-[11px] text-[#8C948F]">Helps public web research corroborate identity</span>
                  </div>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="company-hint" className="mb-1.5 block text-xs font-semibold text-[#171A19]">
                        Company name <span className="font-normal text-[#8C948F]">· optional</span>
                      </label>
                      <Input
                        id="company-hint"
                        {...textForm.register('companyHint')}
                        maxLength={120}
                        placeholder="e.g. Acme Innovations"
                        className="h-10 rounded-lg border-[#D8DFD5] bg-white px-3 text-sm text-[#171A19] placeholder:text-[#8C948F] transition focus-visible:border-[#171A19] focus-visible:ring-2 focus-visible:ring-[#C7F36B] shadow-2xs"
                        data-testid="input-company-hint"
                      />
                    </div>
                    <div>
                      <label htmlFor="role-hint" className="mb-1.5 block text-xs font-semibold text-[#171A19]">
                        Role title <span className="font-normal text-[#8C948F]">· optional</span>
                      </label>
                      <Input
                        id="role-hint"
                        {...textForm.register('roleHint')}
                        maxLength={120}
                        placeholder="e.g. Software Engineer Intern"
                        className="h-10 rounded-lg border-[#D8DFD5] bg-white px-3 text-sm text-[#171A19] placeholder:text-[#8C948F] transition focus-visible:border-[#171A19] focus-visible:ring-2 focus-visible:ring-[#C7F36B] shadow-2xs"
                        data-testid="input-role-hint"
                      />
                    </div>
                  </div>
                </div>

                {notice && (
                  <p role="alert" className="mt-4 rounded-lg border border-[#F8D0CB] bg-[#FDF0EE] px-3.5 py-2.5 text-xs font-medium text-[#C94F45]" data-testid="error-analyze-form">
                    {notice}
                  </p>
                )}
                {analyzeText.isError && (
                  <p role="alert" className="mt-4 rounded-lg border border-[#F8D0CB] bg-[#FDF0EE] px-3.5 py-2.5 text-xs font-medium text-[#C94F45]" data-testid="error-analyze-api">
                    We could not analyze this submission. Check your connection and try again.
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3.5 border-t border-[#E2E6DF] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs text-[#616965]">
                    <Shield size={14} className="text-[#171A19] shrink-0" />
                    <span>Only extracted text is checked. Original documents are never stored.</span>
                  </div>
                  <Button
                    type="submit"
                    disabled={busy}
                    className="h-11 shrink-0 gap-2 rounded-xl bg-[#C7F36B] px-6 font-bold text-[#171A19] shadow-xs transition hover:bg-[#BCEE57] active:bg-[#B1E549] disabled:opacity-50"
                    data-testid="button-analyze-text"
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="animate-spin" size={16} />
                        Analyzing offer…
                      </>
                    ) : (
                      <>
                        Analyze offer
                        <ArrowRight size={16} />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <Form {...urlForm}>
              <form onSubmit={onUrlSubmit} className="pt-5">
                <label htmlFor="offer-url" className="mb-2 block text-xs sm:text-sm font-semibold text-[#171A19]">
                  Public job listing URL
                </label>
                <div className="relative">
                  <Globe2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C948F]" />
                  <Input
                    id="offer-url"
                    type="url"
                    {...urlForm.register('url')}
                    placeholder="https://careers.example.com/jobs/123…"
                    className="h-11 rounded-lg border-[#D8DFD5] bg-white pl-10 text-sm text-[#171A19] placeholder:text-[#8C948F] transition focus-visible:border-[#171A19] focus-visible:ring-2 focus-visible:ring-[#C7F36B] shadow-2xs"
                    data-testid="input-offer-url"
                  />
                </div>
                <p className="mt-2 text-xs text-[#616965]">
                  Must be a publicly accessible job listing page. Do not submit private applicant account URLs or sign-in links.
                </p>

                <div className="mt-5 border-t border-[#E2E6DF] pt-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#8C948F]">
                      Target Details (Optional)
                    </span>
                    <span className="text-[11px] text-[#8C948F]">Clarifies company if URL domain is an aggregator</span>
                  </div>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="url-company-hint" className="mb-1.5 block text-xs font-semibold text-[#171A19]">
                        Company name <span className="font-normal text-[#8C948F]">· optional</span>
                      </label>
                      <Input
                        id="url-company-hint"
                        {...urlForm.register('companyHint')}
                        maxLength={120}
                        placeholder="Company as presented"
                        className="h-10 rounded-lg border-[#D8DFD5] bg-white px-3 text-sm text-[#171A19] placeholder:text-[#8C948F] transition focus-visible:border-[#171A19] focus-visible:ring-2 focus-visible:ring-[#C7F36B] shadow-2xs"
                        data-testid="input-url-company-hint"
                      />
                    </div>
                    <div>
                      <label htmlFor="url-role-hint" className="mb-1.5 block text-xs font-semibold text-[#171A19]">
                        Role title <span className="font-normal text-[#8C948F]">· optional</span>
                      </label>
                      <Input
                        id="url-role-hint"
                        {...urlForm.register('roleHint')}
                        maxLength={120}
                        placeholder="Job title"
                        className="h-10 rounded-lg border-[#D8DFD5] bg-white px-3 text-sm text-[#171A19] placeholder:text-[#8C948F] transition focus-visible:border-[#171A19] focus-visible:ring-2 focus-visible:ring-[#C7F36B] shadow-2xs"
                        data-testid="input-url-role-hint"
                      />
                    </div>
                  </div>
                </div>

                {notice && (
                  <p role="alert" className="mt-4 rounded-lg border border-[#F8D0CB] bg-[#FDF0EE] px-3.5 py-2.5 text-xs font-medium text-[#C94F45]" data-testid="error-url-form">
                    {notice}
                  </p>
                )}
                {analyzeUrl.isError && (
                  <p role="alert" className="mt-4 rounded-lg border border-[#F8D0CB] bg-[#FDF0EE] px-3.5 py-2.5 text-xs font-medium text-[#C94F45]" data-testid="error-url-api">
                    This listing could not be checked. It may be unavailable or block public access. Try pasting its text instead.
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3.5 border-t border-[#E2E6DF] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs text-[#616965]">
                    <Globe2 size={14} className="text-[#171A19] shrink-0" />
                    <span>Only public pages can be reviewed. A failed retrieval is not proof of fraud.</span>
                  </div>
                  <Button
                    type="submit"
                    disabled={busy}
                    className="h-11 shrink-0 gap-2 rounded-xl bg-[#C7F36B] px-6 font-bold text-[#171A19] shadow-xs transition hover:bg-[#BCEE57] active:bg-[#B1E549] disabled:opacity-50"
                    data-testid="button-analyze-url"
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="animate-spin" size={16} />
                        Checking listing…
                      </>
                    ) : (
                      <>
                        Check public listing
                        <ArrowRight size={16} />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </section>

        {/* Supporting Privacy & Reassurance Sidebar */}
        <aside className="space-y-4">
          {/* Card 1: Privacy with subtle soft tint */}
          <div className="rounded-2xl border border-[#D8DFD5] bg-[#E6EBE4]/80 p-5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-[#D8DFD5] text-[#171A19] border border-[#CBD3C8] shadow-2xs">
                <LockKeyhole size={14} />
              </span>
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#171A19]">Your Privacy</h3>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[#38403C]">
              Analysis reports are indexed by a private, anonymous session cookie. No password or personal account required.
            </p>
            <div className="mt-3.5 flex items-center gap-1.5 text-[11px] font-medium text-[#246A3B]">
              <Check size={12} className="shrink-0" />
              <span>Local browser PDF text extraction</span>
            </div>
          </div>

          {/* Card 2: Evidence-Based Assessment on pure white surface */}
          <div className="rounded-2xl border border-[#E2E6DF] bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-[#171A19] text-[#C7F36B] shadow-2xs">
                <Info size={14} />
              </span>
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#171A19]">Evidence-Based</h3>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[#616965]">
              JobShield replaces arbitrary numerical risk scores with transparent, evidence-grounded findings across Company Identity, Vacancies, and Recruiter Contacts.
            </p>
            <div className="mt-4 border-t border-[#E2E6DF] pt-3">
              <Link
                href="/safety"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#171A19] hover:underline transition"
                data-testid="link-understand-results"
              >
                Read student safety guide <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function assessmentPresentation(assessment: string) {
  switch (assessment) {
    case 'no_major_warnings':
      return { label: 'No major warnings found', tone: 'green' as const };
    case 'conflicting_evidence':
      return { label: 'Mixed / conflicting', tone: 'amber' as const };
    case 'evidence_of_concern':
      return { label: 'Evidence of concern', tone: 'red' as const };
    default:
      return { label: 'Insufficient evidence', tone: 'neutral' as const };
  }
}
function verificationLabel(status: string) {
  const labels: Record<string, string> = { official_match: 'Official match', partial_match: 'Partial match', no_match: 'No match found', unable_to_verify: 'Unable to verify', material_discrepancy: 'Material discrepancy' };
  return labels[status] ?? status.replaceAll('_', ' ');
}
function dateLabel(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function StatusTag({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'green' | 'amber' | 'red' }) {
  const tones = {
    neutral: 'bg-[#E6EBE4] text-[#38403C] border border-[#D8DFD5]',
    green: 'bg-[#EAF5ED] text-[#246A3B] border border-[#C5E5CF]',
    amber: 'bg-[#FDF8EE] text-[#B5740D] border border-[#F9E4B7]',
    red: 'bg-[#FDF0EE] text-[#C94F45] border border-[#F8D0CB]',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-tight ${tones[tone]}`}
      data-testid={`status-tag-${text.toLowerCase().replaceAll(' ', '-')}`}
    >
      {text}
    </span>
  );
}

function ReportPage({ id }: { id: string }) {
  const { data: report, isLoading, isError, refetch } = useGetAnalysis(id, { query: { enabled: !!id, queryKey: getGetAnalysisQueryKey(id) } });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copySummary() {
    if (!report) return;
    const lines = [
      `JOB VERIFICATION REPORT: ${report.jobTitle || report.sourceLabel || 'Job Offer Analysis'}`,
      `Company: ${report.companyName || 'Not identified'}`,
      `Overall Assessment: ${report.overallAssessment.replace(/_/g, ' ').toUpperCase()}`,
      `Assessment Rationale: ${report.assessmentRationale || report.summary}`,
      `Verification Status: ${report.verificationStatus.replace(/_/g, ' ')}`,
      `Reviewed: ${dateLabel(report.createdAt)}`,
      '',
      '--- ASSESSMENT SUMMARY ---',
      report.summary,
      '',
      '--- KEY FINDINGS ---',
      ...(report.findings.length
        ? report.findings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}: ${f.description}\n   Why it matters: ${f.whyItMatters}\n   Action: ${f.recommendedAction}`)
        : ['No warning patterns were detected in the submitted material. (Verification may be incomplete).']),
      '',
      '--- VERIFICATION CHECKS ---',
      ...report.checks.map((c) => `- ${c.label}: ${c.status} (${c.explanation})`),
      '',
      '--- RECOMMENDED NEXT STEPS ---',
      ...report.recommendedNextSteps.map((step, i) => `${i + 1}. ${step}`),
      '',
      '--- QUESTIONS TO ASK THE RECRUITER ---',
      ...(report.questionsForRecruiter?.map((q, i) => `${i + 1}. ${q}`) || []),
      '',
      '--- NOTICE ---',
      'JobShield AI reports are heuristic indicators based on submitted text and available public data. Absence of detected warning signs is not a guarantee of legitimacy. They do not constitute legal fraud determinations.',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      setCopied(false);
    }
  }

  return (
    <div className="page-enter mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      {isLoading && (
        <div className="space-y-4" aria-label="Loading report" data-testid="loading-report">
          <div className="h-8 w-64 animate-pulse rounded bg-[#E6EBE4]" />
          <div className="h-44 animate-pulse rounded-2xl bg-[#E6EBE4]" />
          <div className="h-64 animate-pulse rounded-2xl bg-[#E6EBE4]" />
        </div>
      )}
      {isError && (
        <div className="rounded-2xl border border-[#E2E6DF] bg-white p-8 text-center shadow-xs" data-testid="error-report">
          <ShieldAlert className="mx-auto text-[#B5740D]" size={36} />
          <h1 className="mt-4 font-display text-xl font-bold text-[#171A19]">This report could not be loaded</h1>
          <p className="mt-2 text-sm text-[#616965]">It may have expired, been cleared, or belong to another browser session.</p>
          <Button onClick={() => refetch()} variant="outline" className="mt-5 border-[#D8DFD5] text-[#171A19] hover:bg-[#FAF9F5]" data-testid="button-retry-report">Try again</Button>
        </div>
      )}
      {copyError && (
        <p role="status" className="mb-4 text-xs font-semibold text-[#C94F45]" data-testid="error-copy-summary">
          Could not copy the report summary to clipboard. Please check browser permissions.
        </p>
      )}
      {report && <ReportView report={report} onCopy={copySummary} copied={copied} />}
    </div>
  );
}

function SummaryRow({ item, onDelete }: { item: AnalysisSummary; onDelete?: (id: string) => void }) {
  const assessment = assessmentPresentation(item.overallAssessment);
  return (
    <div className="grid gap-4 border-b border-[#E2E6DF] bg-white p-4 transition hover:bg-[#FAF9F5] last:border-b-0 sm:grid-cols-[1fr_160px_150px_auto] sm:items-center sm:px-6" data-testid={`analysis-row-${item.id}`}>
      <Link href={`/report/${encodeURIComponent(item.id)}`} className="group min-w-0" data-testid={`link-analysis-${item.id}`}>
        <div className="truncate text-sm font-bold text-[#171A19] group-hover:text-[#246A3B] transition">
          {item.jobTitle || item.sourceLabel || 'Offer review'}
        </div>
        <div className="mt-1 flex items-center gap-2 truncate font-mono text-[11px] text-[#616965]">
          <span>{item.companyName || 'Company not identified'}</span>
          <span>·</span>
          <span className="uppercase text-[#8C948F]">{item.sourceType}</span>
          <span>·</span>
          <span>{dateLabel(item.createdAt)}</span>
        </div>
      </Link>
      <StatusTag text={assessment.label} tone={assessment.tone} />
      <div className="text-xs text-[#616965]">
        <div className="font-semibold text-[#171A19]">{verificationLabel(item.verificationStatus)}</div>
        <div className="mt-0.5 font-mono text-[11px] text-[#8C948F]">{item.findingCount} {item.findingCount === 1 ? 'finding' : 'findings'}</div>
      </div>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete report ${item.jobTitle || item.id}`}
          onClick={() => onDelete(item.id)}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs font-semibold text-[#8C948F] transition hover:border-[#F8D0CB] hover:bg-[#FDF0EE] hover:text-[#C94F45]"
          data-testid={`button-delete-${item.id}`}
        >
          <Trash2 size={13} />
          <span>Delete</span>
        </button>
      )}
    </div>
  );
}

function HistoryPage() {
  const queryClient = useQueryClient();
  const list = useListAnalyses(undefined, { query: { queryKey: getListAnalysesQueryKey() } });
  const dashboard = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const remove = useDeleteAnalysis();
  const clear = useClearAnalyses();
  const [error, setError] = useState('');
  const deleteOne = (id: string) => {
    if (!window.confirm('Delete this report from your current browser session? This cannot be undone.')) return;
    remove.mutate({ id }, { onSuccess: () => { setError(''); queryClient.invalidateQueries({ queryKey: getListAnalysesQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.removeQueries({ queryKey: getGetAnalysisQueryKey(id) }); }, onError: () => setError('Could not delete this report. Please try again.') });
  };
  const clearAll = () => {
    if (!window.confirm('Delete all saved reports from this browser session? This cannot be undone.')) return;
    clear.mutate(undefined, { onSuccess: () => { setError(''); queryClient.invalidateQueries({ queryKey: getListAnalysesQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); }, onError: () => setError('Could not clear your history. Please try again.') });
  };
  const total = dashboard.data?.totalAnalyses ?? list.data?.length;
  return (
    <div className="page-enter mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Eyebrow><LockKeyhole size={13} /> Private Browser Session</Eyebrow>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#171A19]" data-testid="text-history-title">
            Analysis History
          </h1>
          <p className="mt-2.5 max-w-[560px] text-sm leading-relaxed text-[#616965]">
            Saved reports are associated with this anonymous browser session. Clearing your browser cookies will remove session access.
          </p>
        </div>
        <Link
          href="/analyze"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#C7F36B] px-5 font-bold text-[#171A19] shadow-xs transition hover:bg-[#BCEE57] active:bg-[#B1E549]"
          data-testid="button-history-analyze"
        >
          Analyze an offer <ArrowRight size={15} />
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E2E6DF] bg-white p-5 shadow-2xs">
          <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#8C948F]">Reports in this session</div>
          {dashboard.isLoading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-[#E6EBE4]" />
          ) : dashboard.isError ? (
            <div className="mt-2 text-sm text-[#616965]">Summary unavailable</div>
          ) : (
            <div className="mt-1 font-display text-3xl font-extrabold text-[#171A19]" data-testid="text-total-analyses">
              {total ?? 0}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[#E2E6DF] bg-white p-5 shadow-2xs">
          <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#8C948F]">Opportunities of concern</div>
          {dashboard.isLoading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-[#E6EBE4]" />
          ) : dashboard.isError ? (
            <div className="mt-2 text-sm text-[#616965]">Summary unavailable</div>
          ) : (
            <div className="mt-1 font-display text-3xl font-extrabold text-[#C94F45]" data-testid="text-concern-count">
              {dashboard.data?.concernCount ?? 0}
            </div>
          )}
          <p className="mt-1 text-xs text-[#616965]">Elevated signals requiring careful independent corroboration.</p>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-[#D8DFD5] bg-white shadow-xs">
        <div className="flex flex-col justify-between gap-3 border-b border-[#D8DFD5] bg-[#E6EBE4] px-6 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold text-[#171A19]">Saved analyses</h2>
            <p className="mt-0.5 text-xs text-[#616965]">Only accessible within your current anonymous session.</p>
          </div>
          {list.data?.length ? (
            <Button
              variant="outline"
              size="sm"
              disabled={clear.isPending}
              onClick={clearAll}
              className="gap-1.5 rounded-lg border-[#D8DFD5] bg-white text-xs font-semibold text-[#616965] hover:border-[#F8D0CB] hover:bg-[#FDF0EE] hover:text-[#C94F45]"
              data-testid="button-clear-history"
            >
              <Trash2 size={13} />
              {clear.isPending ? 'Clearing…' : 'Clear history'}
            </Button>
          ) : null}
        </div>
        {list.isLoading ? (
          <div className="space-y-3 p-5" data-testid="loading-history">
            {[1, 2, 3].map((x) => (
              <div key={x} className="h-16 animate-pulse rounded-lg bg-[#E6EBE4]" />
            ))}
          </div>
        ) : list.isError ? (
          <div className="p-8 text-center" data-testid="error-history">
            <ShieldAlert className="mx-auto text-[#B5740D]" />
            <h3 className="mt-3 text-sm font-bold text-[#171A19]">History could not be loaded</h3>
            <p className="mt-1 text-xs text-[#616965]">Your session may be unavailable right now.</p>
            <Button variant="outline" onClick={() => { void list.refetch(); void dashboard.refetch(); }} className="mt-4 border-[#D8DFD5] text-[#171A19]" data-testid="button-retry-history">
              Try again
            </Button>
          </div>
        ) : list.data?.length ? (
          <div>
            {list.data.map((item) => (
              <SummaryRow key={item.id} item={item} onDelete={deleteOne} />
            ))}
          </div>
        ) : (
          <div className="px-6 py-14 text-center" data-testid="empty-history">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#E6EBE4] text-[#171A19] border border-[#D8DFD5]">
              <FileCheck2 size={22} />
            </span>
            <h3 className="mt-4 font-display text-lg font-extrabold text-[#171A19]">No saved analyses yet</h3>
            <p className="mx-auto mt-2 max-w-[380px] text-xs leading-relaxed text-[#616965]">
              When you review a job opportunity, its evidence report will be securely indexed here for this session.
            </p>
            <Link
              href="/analyze"
              className="mt-5 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#171A19] hover:underline"
              data-testid="link-empty-history-analyze"
            >
              Start your first review <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </div>
      {(error || remove.isPending || clear.isPending) && (
        <p className="mt-3 text-xs text-[#C94F45]" role="status" data-testid="status-history-action">
          {error || 'Updating your history…'}
        </p>
      )}
    </div>
  );
}

function CompaniesPage() {
  const form = useForm<{ query: string }>({ defaultValues: { query: '' } });
  const [submitted, setSubmitted] = useState('');
  const params: SearchCompanySourcesParams = useMemo(() => ({ query: submitted || '  ' }), [submitted]);
  const search = useSearchCompanySources(params, { query: { enabled: submitted.trim().length >= 2, queryKey: getSearchCompanySourcesQueryKey(params) } });
  const submit = form.handleSubmit((values) => {
    const query = values.query.trim();
    if (query.length < 2) { form.setError('query', { message: 'Enter at least 2 characters.' }); return; }
    if (query.length > 160) { form.setError('query', { message: 'Keep your search under 160 characters.' }); return; }
    form.clearErrors('query'); setSubmitted(query);
  });
  return (
    <div className="page-enter mx-auto max-w-[1050px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="max-w-[720px]">
        <Eyebrow><Globe2 size={13} /> Public-Source Search</Eyebrow>
        <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-[#171A19]" data-testid="text-companies-title">
          Look beyond the listing.
        </h1>
        <p className="mt-3 text-sm sm:text-base leading-relaxed text-[#616965]">
          Search authoritative public records related to a company or opportunity. Results provide research context—not endorsements, verifications, or complete histories.
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="company-search" className="sr-only">Company or opportunity search</label>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8C948F]" />
            <Input
              id="company-search"
              {...form.register('query')}
              maxLength={160}
              placeholder="Company name, domain, or opportunity keywords"
              className="h-11 rounded-xl border-[#D8DFD5] bg-white pl-11 text-sm text-[#171A19] placeholder:text-[#8C948F] transition focus-visible:border-[#171A19] focus-visible:ring-2 focus-visible:ring-[#C7F36B] shadow-2xs"
              data-testid="input-company-search"
            />
          </div>
          <Button
            type="submit"
            disabled={search.isFetching}
            className="h-11 gap-2 rounded-xl bg-[#C7F36B] px-6 font-bold text-[#171A19] shadow-xs transition hover:bg-[#BCEE57] active:bg-[#B1E549]"
            data-testid="button-search-company"
          >
            {search.isFetching ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />}
            Search sources
          </Button>
        </form>
      </Form>
      {form.formState.errors.query && (
        <p className="mt-2 text-xs text-[#C94F45]" data-testid="error-company-search">
          {form.formState.errors.query.message}
        </p>
      )}
      <div className="mt-8">
        {!submitted && (
          <div className="rounded-2xl border border-dashed border-[#D8DFD5] bg-[#E6EBE4]/40 px-6 py-12 text-center" data-testid="empty-company-search">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-[#171A19] border border-[#D8DFD5] shadow-2xs">
              <Search size={20} />
            </span>
            <h2 className="mt-4 font-display text-base font-bold text-[#171A19]">Search public intelligence</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#616965]">
              Enter a company or opportunity domain to inspect public records gathered through live web search.
            </p>
          </div>
        )}
        {submitted && search.isLoading && (
          <div className="space-y-3" data-testid="loading-company-search">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-28 animate-pulse rounded-2xl bg-[#E6EBE4]" />
            ))}
          </div>
        )}
        {submitted && search.isError && (
          <div className="rounded-2xl border border-[#E2E6DF] bg-white p-7 text-center shadow-xs" data-testid="error-company-search-results">
            <h2 className="font-display font-bold text-[#171A19]">Search is unavailable</h2>
            <p className="mt-2 text-xs text-[#616965]">Public results could not be retrieved. This implies nothing about the company.</p>
            <Button variant="outline" onClick={() => search.refetch()} className="mt-4 border-[#D8DFD5] text-[#171A19]" data-testid="button-retry-company-search">
              Try again
            </Button>
          </div>
        )}
        {submitted && search.data && (
          <section data-testid="company-search-results">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-base font-bold text-[#171A19]">Results for “{search.data.query}”</h2>
              <span className="font-mono text-xs text-[#8C948F]">
                {search.data.retrievedAt ? `Retrieved ${dateLabel(search.data.retrievedAt)}` : ''}
              </span>
            </div>
            {search.data.status !== 'completed' && (
              <div className="mb-4 rounded-xl border border-[#F9E4B7] bg-[#FDF8EE] px-4 py-3 text-xs text-[#B5740D]" data-testid="status-company-search">
                {search.data.note || `Search status: ${search.data.status.replaceAll('_', ' ')}.`}
              </div>
            )}
            {search.data.status === 'completed' && search.data.note && (
              <p className="mb-4 text-xs text-[#616965]" data-testid="text-company-search-note">
                {search.data.note}
              </p>
            )}
            {search.data.results.length ? (
              <div className="space-y-3">
                {search.data.results.map((result, i) => (
                  <article key={`${result.url}-${i}`} className="rounded-2xl border border-[#E2E6DF] bg-white p-5 shadow-2xs transition hover:border-[#CBD3C8]" data-testid={`company-result-${i}`}>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#8C948F]">
                      <span className="rounded bg-[#E6EBE4] px-2 py-0.5 text-[#38403C]">{result.domain}</span>
                      {result.publishedAt && <span>{dateLabel(result.publishedAt)}</span>}
                    </div>
                    <a href={result.url} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 font-display text-sm font-bold text-[#171A19] hover:underline" data-testid={`link-company-result-${i}`}>
                      {result.title}
                      <ArrowUpRight size={14} className="text-[#8C948F]" />
                    </a>
                    <p className="mt-2 text-xs leading-relaxed text-[#616965]">{result.snippet}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#D8DFD5] p-8 text-center text-xs leading-relaxed text-[#616965]" data-testid="empty-company-results">
                No public sources were returned. Search coverage can be incomplete; lack of results does not imply misconduct.
              </div>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-[#8C948F]">
              Public results may be incomplete, stale, or unrelated. Always verify key details through an official domain before relying on them.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function SafetyPage() {
  const checklist = [
    ['Verify the sender', 'Look closely at the full email address and domain, not only the display name. Contact the organization using contact details you find independently.'],
    ['Check the job on an official site', 'Search the organization’s own careers page for the same title and location. A familiar company name in a message is not proof of origin.'],
    ['Pause before paying', 'Legitimate employers generally do not require applicants to pay for equipment, training, background checks, or a job offer through gift cards, cryptocurrency, or wire transfer.'],
    ['Protect identity and banking details', 'Do not share government ID, bank credentials, or tax details until you have independently confirmed the employer and understand why the information is needed.'],
    ['Treat urgency as a reason to slow down', 'Pressure to act immediately, communicate only through chat, or keep the process secret makes independent verification especially important.'],
    ['Inspect links without signing in', 'Read the full destination domain before opening a link. Do not enter passwords or one-time codes through links in an unexpected message.'],
  ];
  return (
    <div className="page-enter mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="grid gap-10 lg:grid-cols-[.78fr_1.22fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Eyebrow><BookOpen size={13} /> Practical Safety Guide</Eyebrow>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold leading-[1.08] tracking-tight text-[#171A19]" data-testid="text-safety-title">
            Slow down.<br />Check the details.
          </h1>
          <p className="mt-4 max-w-[400px] text-sm leading-relaxed text-[#616965]">
            A few independent checks can help you make a more informed choice. Automated heuristics can surface warning signals, but cannot confirm authenticity.
          </p>
          <Link
            href="/analyze"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#C7F36B] px-5 py-3 font-bold text-[#171A19] shadow-xs transition hover:bg-[#BCEE57] active:bg-[#B1E549]"
            data-testid="button-safety-analyze"
          >
            Review an offer <ArrowRight size={15} />
          </Link>
        </div>
        <div className="space-y-0">
          {checklist.map(([title, detail], index) => (
            <article key={title} className="grid gap-4 border-t border-[#D8DFD5] py-6 sm:grid-cols-[48px_1fr]" data-testid={`safety-tip-${index}`}>
              <span className="grid size-8 place-items-center rounded-lg bg-[#E6EBE4] font-mono text-xs font-bold text-[#171A19] border border-[#D8DFD5]">
                0{index + 1}
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-[#171A19]">{title}</h2>
                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#616965]">{detail}</p>
              </div>
            </article>
          ))}
          <section className="mt-6 rounded-2xl border border-[#F8D0CB] bg-[#FDF0EE]/60 p-5 sm:p-6" data-testid="safety-reporting-resources">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#C94F45]">
              <ShieldAlert size={18} /> If something feels wrong
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#38403C]">
              Stop sharing information or sending money. Save relevant messages, verify the organization using independently sourced contact details, and report suspected impersonation to the real organization and the appropriate consumer protection agency in your area.
            </p>
            <p className="mt-2.5 text-[11px] leading-relaxed text-[#616965]">
              If you have already shared financial or identity credentials, contact your financial institution or local identity protection agency immediately.
            </p>
          </section>
        </div>
      </div>
      <div className="mt-10 rounded-2xl border-l-4 border-[#171A19] border border-[#E2E6DF] bg-white p-5 text-xs leading-relaxed text-[#38403C] shadow-2xs">
        <strong className="text-[#171A19]">Important Integrity Principle:</strong> JobShield AI's findings are heuristic indicators based on submitted text and available public data. Absence of detected warning signs is not a guarantee of legitimacy.
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return <RoutedErrorBoundary resetKey={location}><AppShell><Switch>
    <Route path="/" component={HomePage} />
    <Route path="/analyze" component={AnalyzePage} />
    <Route path="/report/:id">{(params) => <ReportPage id={params.id} />}</Route>
    <Route path="/history" component={HistoryPage} />
    <Route path="/companies" component={CompaniesPage} />
    <Route path="/safety" component={SafetyPage} />
    <Route component={NotFound} />
  </Switch></AppShell></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
