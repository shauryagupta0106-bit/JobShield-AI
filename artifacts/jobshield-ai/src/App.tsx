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
      <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-[#172B4D] text-white" aria-hidden="true">
        <Shield size={20} strokeWidth={1.8} />
        <span className="absolute bottom-[9px] left-[14px] h-[7px] w-[2px] rotate-45 rounded bg-[#0F9F91]" />
        <span className="absolute bottom-[9px] left-[17px] h-[4px] w-[2px] -rotate-45 rounded bg-[#0F9F91]" />
      </span>
      {!compact && <span className="font-display text-[17px] font-extrabold tracking-[-.04em] text-[#172B4D]">JobShield<span className="font-semibold text-[#667085]"> AI</span></span>}
    </span>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const health = useHealthCheck();
  const okay = health.data?.status === 'ok' || health.data?.status === 'healthy';
  return (
    <div className="min-h-[100dvh] bg-white text-[#172B4D]">
      <header className="sticky top-0 z-40 border-b border-[#E4E9F0] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="rounded-lg focus-ring" aria-label="JobShield AI home" data-testid="link-brand-home"><BrandMark /></Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {NAV.map(({ href, label }) => (
              <Link key={href} href={href} data-testid={`nav-${label.toLowerCase().replaceAll(' ', '-')}`}
                className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors focus-ring ${location === href ? 'bg-[#F7F9FC] text-[#172B4D]' : 'text-[#667085] hover:bg-[#F7F9FC] hover:text-[#172B4D]'}`}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-3 lg:flex">
            <span className="inline-flex items-center gap-2 text-[11px] text-[#667085]" data-testid="status-api-health">
              <span className={`size-1.5 rounded-full ${health.isLoading ? 'bg-[#B76E00]' : health.isError ? 'bg-[#C62828]' : okay ? 'bg-[#16803D]' : 'bg-[#B76E00]'}`} />
              {health.isLoading ? 'Checking service' : health.isError ? 'Service status unavailable' : okay ? 'Service available' : `Service: ${health.data?.status ?? 'status unknown'}`}
            </span>
            <Link href="/analyze" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2563EB] px-4 text-[13px] font-bold text-white transition hover:bg-[#1D4ED8] focus-ring" data-testid="button-header-analyze">Check an offer <ArrowRight size={15} /></Link>
          </div>
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}
            className="grid size-10 place-items-center rounded-lg border border-[#E4E9F0] lg:hidden" data-testid="button-mobile-menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        {menuOpen && <nav className="grid gap-1 border-t border-[#E4E9F0] bg-white px-5 py-3 lg:hidden" aria-label="Mobile navigation">
          {NAV.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold ${location === href ? 'bg-[#F7F9FC] text-[#172B4D]' : 'text-[#667085]'}`} data-testid={`mobile-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} />{label}</Link>)}
          <div className="px-3 py-2 text-xs text-[#667085]" data-testid="mobile-health-status">Service status: {health.isLoading ? 'checking' : health.isError ? 'unavailable' : health.data?.status ?? 'unknown'}</div>
        </nav>}
      </header>
      <main>{children}</main>
      <footer className="border-t border-[#E4E9F0] bg-[#F7F9FC]">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-3"><BrandMark compact /><div><div className="text-sm font-bold">JobShield AI</div><div className="text-xs text-[#667085]">Careful checks. Clear evidence.</div></div></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#667085]">
            <Link href="/safety" className="hover:text-[#2563EB]" data-testid="footer-safety">Safety guide</Link>
            <Link href="/history" className="hover:text-[#2563EB]" data-testid="footer-history">Private history</Link>
            <span>Reports are indicators, not verdicts.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#0F9F91]">{children}</div>;
}

function HomePage() {
  return (
    <div className="page-enter">
      <section className="relative overflow-hidden border-b border-[#E4E9F0] bg-[#F7F9FC]">
        <div className="absolute inset-y-0 right-0 hidden w-[48%] soft-grid lg:block" aria-hidden="true" />
        <div className="absolute right-[14%] top-[15%] hidden size-[430px] rounded-full border border-[#E4E9F0] lg:block" aria-hidden="true" />
        <div className="absolute right-[19%] top-[21%] hidden size-[320px] rounded-full border border-[#E4E9F0] lg:block" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.03fr_.97fr] lg:gap-8 lg:py-28">
          <div className="max-w-[660px]">
            <Eyebrow><ShieldCheck size={14} /> A clearer first step</Eyebrow>
            <h1 className="font-display max-w-[660px] text-[clamp(40px,5.3vw,66px)] font-extrabold leading-[1.04] tracking-[-.065em] text-[#172B4D]" data-testid="text-home-headline">Not Sure About That Job Offer? Investigate Before You Apply.</h1>
            <p className="mt-5 max-w-[540px] text-lg font-semibold leading-8 text-[#344054]" data-testid="text-home-tagline">Verify Before You Apply.</p>
            <p className="mt-3 max-w-[540px] text-[15px] leading-7 text-[#667085]">Check job listings against available evidence, uncover warning signs, and understand what to verify before sharing your money or personal information.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/analyze" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1D4ED8] focus-ring" data-testid="button-start-analysis">Analyze an offer <ArrowRight size={17} /></Link>
              <Link href="/safety" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#E4E9F0] bg-white px-5 text-sm font-bold text-[#172B4D] transition hover:border-[#2563EB] focus-ring" data-testid="button-read-safety">Read the safety guide <ArrowUpRight size={16} /></Link>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs text-[#667085]"><LockKeyhole size={14} className="text-[#0F9F91]" /> No account required. Your reports stay in this browser session.</div>
          </div>
          <div className="relative mx-auto w-full max-w-[470px] lg:ml-auto lg:mr-4">
            <div className="absolute -left-6 top-12 hidden h-20 w-20 rounded-2xl border border-[#E4E9F0] bg-white sm:block" />
            <div className="relative rounded-2xl border border-[#E4E9F0] bg-white p-5 shadow-[0_20px_70px_-34px_rgba(23,43,77,.25)] sm:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-[#E4E9F0] pb-5">
                <div><div className="text-[11px] font-bold uppercase tracking-[.12em] text-[#667085]">A careful review</div><div className="mt-2 font-display text-xl font-bold tracking-[-.03em]">Evidence before instinct</div></div>
                <span className="grid size-11 place-items-center rounded-xl bg-[#E8F5F3] text-[#0F9F91]"><FileCheck2 size={22} /></span>
              </div>
              <div className="space-y-4 py-5">
                {[
                  ['Listing details', 'Compared against the submitted offer', CheckCircle2, '#16803D'],
                  ['Public sources', 'Evidence shown with source links', Globe2, '#2563EB'],
                  ['What is unknown', 'Limits and gaps are made explicit', Info, '#B76E00'],
                ].map(([title, detail, Icon, color], i) => <div className="flex gap-3" key={title as string}><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#F7F9FC]" style={{ color: color as string }}><Icon size={16} /></span><div className="min-w-0 flex-1"><div className="text-sm font-bold">{title as string}</div><div className="mt-1 text-xs leading-5 text-[#667085]">{detail as string}</div></div><span className="pt-2 font-mono text-[10px] text-[#98A2B3]">0{i + 1}</span></div>)}
              </div>
              <div className="rounded-lg border border-[#E4E9F0] bg-[#F7F9FC] px-4 py-3 text-xs leading-5 text-[#344054]">A risk score is a heuristic signal—not a probability or a finding of fraud.</div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1280px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16 lg:py-20">
        <div><Eyebrow><Sparkles size={14} /> How to use JobShield</Eyebrow><h2 className="font-display max-w-[430px] text-3xl font-extrabold leading-tight tracking-[-.045em] sm:text-4xl">A second look, grounded in what can be checked.</h2><p className="mt-4 max-w-[420px] leading-7 text-[#667085]">Start with a public listing or the message you received. We organize available signals so you can ask better questions—not make a decision on a number alone.</p></div>
        <div className="grid gap-0 sm:grid-cols-3">
          {[['01', 'Bring the details', 'Paste the offer, add a public listing URL, or extract text from a PDF locally.'], ['02', 'Review evidence', 'See findings alongside sources, verification checks, and known limitations.'], ['03', 'Choose your next step', 'Use practical recommendations and verify directly through official channels.']].map(([n, title, body]) => <article className="border-t border-[#E4E9F0] py-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pr-4" key={n}><span className="font-mono text-xs font-bold text-[#0F9F91]">{n}</span><h3 className="mt-3 text-sm font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#667085]">{body}</p></article>)}
        </div>
      </section>
      <section className="border-y border-[#E4E9F0] bg-[#F7F9FC]">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-5 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-16">
          <div><Eyebrow><ShieldAlert size={14} /> Keep perspective</Eyebrow><h2 className="font-display text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">A signal is a starting point.<br className="hidden sm:block" /> Your judgment still matters.</h2><p className="mt-3 max-w-[640px] text-sm leading-6 text-[#667085]">Online information can be incomplete or out of date. A company may not appear in search results for ordinary reasons. JobShield does not label a company fraudulent based on a heuristic.</p></div>
          <Link href="/companies" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#D5DDE7] bg-white px-4 text-sm font-bold text-[#172B4D] hover:border-[#2563EB] focus-ring" data-testid="button-company-sources">Search public sources <ArrowRight size={16} /></Link>
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
    <div className="page-enter mx-auto max-w-[1120px] px-5 py-10 sm:px-8 sm:py-14">
      <div className="max-w-[700px]">
        <Eyebrow><ShieldCheck size={14} /> Review a job opportunity</Eyebrow>
        <h1 className="font-display text-4xl font-extrabold tracking-[-.055em] sm:text-5xl" data-testid="text-analyze-title">Start with the evidence.</h1>
        <p className="mt-4 max-w-[650px] text-base leading-7 text-[#667085]">Submit a public job URL or provide the offer details. Your information is checked for signals and compared with available sources; findings may be incomplete.</p>
      </div>
      <div className="mt-9 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-2xl border border-[#E4E9F0] bg-white p-5 shadow-[0_8px_30px_-24px_rgba(23,43,77,.3)] sm:p-7">
          <div className="flex border-b border-[#E4E9F0]" role="tablist" aria-label="Offer input type">
            <button type="button" onClick={() => { setTab('text'); setNotice(''); }} aria-selected={tab === 'text'} role="tab" className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${tab === 'text' ? 'border-[#2563EB] text-[#172B4D]' : 'border-transparent text-[#667085]'}`} data-testid="tab-paste-text"><FileText size={16} /> Paste or PDF</button>
            <button type="button" onClick={() => { setTab('url'); setNotice(''); }} aria-selected={tab === 'url'} role="tab" className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${tab === 'url' ? 'border-[#2563EB] text-[#172B4D]' : 'border-transparent text-[#667085]'}`} data-testid="tab-url"><Globe2 size={16} /> Public URL</button>
          </div>
          {tab === 'text' ? <Form {...textForm}><form onSubmit={onTextSubmit} className="pt-6">
            <label htmlFor="offer-text" className="mb-2 block text-sm font-bold">Offer or job description <span className="font-normal text-[#667085]">· required</span></label>
            <Textarea id="offer-text" maxLength={50000} {...textForm.register('content')} placeholder="Paste the job description or offer message here. Include the sender's email, requested next steps, and any links when relevant." className="min-h-[220px] resize-y border-[#D5DDE7] bg-white px-4 py-3 text-sm leading-6 placeholder:text-[#98A2B3] focus-visible:ring-[#2563EB]" aria-describedby="text-length" data-testid="input-offer-text" />
            <div id="text-length" className="mt-2 flex justify-between text-xs text-[#667085]"><span>20–50,000 characters</span><span data-testid="text-character-count">{textForm.watch('content').length.toLocaleString()} / 50,000</span></div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#D5DDE7] bg-white px-3 text-xs font-bold text-[#344054] hover:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]" data-testid="label-upload-pdf">
                <Upload size={15} /> {fileName ? 'Replace PDF' : 'Extract text from PDF'}
                <input type="file" accept="application/pdf,.pdf" onChange={onFile} className="sr-only" aria-label="Choose a PDF for local text extraction" data-testid="input-upload-pdf" />
              </label>
              {fileName && <span className="inline-flex max-w-full items-center gap-2 text-xs text-[#16803D]" data-testid="text-pdf-loaded"><Check size={14} />{fileName}<button type="button" onClick={() => { setFileName(''); textForm.setValue('sourceLabel', ''); textForm.setValue('content', ''); }} className="ml-1 text-[#667085] hover:text-[#C62828]" aria-label="Remove extracted PDF text" data-testid="button-remove-pdf"><X size={14} /></button></span>}
            </div>
            {pdfError && <p role="alert" className="mt-3 rounded-lg bg-[#FFF7E8] px-3 py-2 text-sm text-[#8A5100]" data-testid="error-pdf">{pdfError}</p>}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="company-hint" className="mb-2 block text-xs font-bold text-[#344054]">Company name <span className="font-normal text-[#667085]">· optional</span></label><Input id="company-hint" {...textForm.register('companyHint')} maxLength={120} placeholder="As shown in the offer" className="border-[#D5DDE7] bg-white" data-testid="input-company-hint" /></div>
              <div><label htmlFor="role-hint" className="mb-2 block text-xs font-bold text-[#344054]">Role title <span className="font-normal text-[#667085]">· optional</span></label><Input id="role-hint" {...textForm.register('roleHint')} maxLength={120} placeholder="e.g. Research assistant" className="border-[#D5DDE7] bg-white" data-testid="input-role-hint" /></div>
            </div>
            {notice && <p role="alert" className="mt-4 text-sm text-[#C62828]" data-testid="error-analyze-form">{notice}</p>}
            {analyzeText.isError && <p role="alert" className="mt-4 rounded-lg bg-[#FFF1F0] px-3 py-2 text-sm text-[#C62828]" data-testid="error-analyze-api">We could not analyze this submission. Check your connection and try again.</p>}
            <div className="mt-6 flex flex-col gap-3 border-t border-[#E4E9F0] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[370px] text-xs leading-5 text-[#667085]">PDF text is extracted in your browser. Only the extracted text—not the PDF file—is sent for analysis.</p>
              <Button type="submit" disabled={busy} className="h-11 shrink-0 gap-2 bg-[#2563EB] px-5 font-bold text-white hover:bg-[#1D4ED8]" data-testid="button-analyze-text">{busy ? <><LoaderCircle className="animate-spin" size={16} /> Reviewing…</> : <>Analyze offer <ArrowRight size={16} /></>}</Button>
            </div>
          </form></Form> : <Form {...urlForm}><form onSubmit={onUrlSubmit} className="pt-6">
            <label htmlFor="offer-url" className="mb-2 block text-sm font-bold">Public job listing URL</label>
            <div className="relative"><Globe2 size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#667085]" /><Input id="offer-url" type="url" {...urlForm.register('url')} placeholder="https://careers.example.com/jobs/…" className="h-12 border-[#D5DDE7] bg-white pl-10" data-testid="input-offer-url" /></div>
            <p className="mt-2 text-xs text-[#667085]">Use a public listing page. Do not submit private account links or sign-in URLs.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="url-company-hint" className="mb-2 block text-xs font-bold text-[#344054]">Company name <span className="font-normal text-[#667085]">· optional</span></label><Input id="url-company-hint" {...urlForm.register('companyHint')} maxLength={120} placeholder="Company as presented" className="border-[#D5DDE7] bg-white" data-testid="input-url-company-hint" /></div>
              <div><label htmlFor="url-role-hint" className="mb-2 block text-xs font-bold text-[#344054]">Role title <span className="font-normal text-[#667085]">· optional</span></label><Input id="url-role-hint" {...urlForm.register('roleHint')} maxLength={120} placeholder="Job title" className="border-[#D5DDE7] bg-white" data-testid="input-url-role-hint" /></div>
            </div>
            {notice && <p role="alert" className="mt-4 text-sm text-[#C62828]" data-testid="error-url-form">{notice}</p>}
            {analyzeUrl.isError && <p role="alert" className="mt-4 rounded-lg bg-[#FFF1F0] px-3 py-2 text-sm text-[#C62828]" data-testid="error-url-api">This listing could not be checked. It may be unavailable or block public access. Try pasting its text instead.</p>}
            <div className="mt-6 flex flex-col gap-3 border-t border-[#E4E9F0] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-[370px] text-xs leading-5 text-[#667085]">Only public pages can be reviewed. A failed retrieval is not evidence about the company.</p><Button type="submit" disabled={busy} className="h-11 gap-2 bg-[#2563EB] px-5 font-bold text-white hover:bg-[#1D4ED8]" data-testid="button-analyze-url">{busy ? <><LoaderCircle className="animate-spin" size={16} /> Reviewing…</> : <>Check public listing <ArrowRight size={16} /></>}</Button></div>
          </form></Form>}
        </section>
        <aside className="space-y-4">
          <div className="rounded-xl border border-[#CBE7E3] bg-[#F4FBFA] p-5"><div className="flex items-center gap-2 text-sm font-bold"><LockKeyhole size={16} className="text-[#0F9F91]" /> Your privacy</div><p className="mt-2 text-sm leading-6 text-[#344054]">Analysis history is linked to this anonymous browser session. Avoid including sensitive personal information.</p></div>
          <div className="rounded-xl border border-[#E4E9F0] bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold"><Info size={16} className="text-[#2563EB]" /> How results work</div><p className="mt-2 text-sm leading-6 text-[#667085]">A risk score is a heuristic indicator, never a probability. Results are not a verdict and should be considered with the evidence and limitations.</p><Link href="/safety" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB]" data-testid="link-understand-results">Read the safety guide <ArrowRight size={13} /></Link></div>
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
  const tones = { neutral: 'bg-[#F7F9FC] text-[#344054]', green: 'bg-[#EFF8F1] text-[#16803D]', amber: 'bg-[#FFF7E8] text-[#8A5100]', red: 'bg-[#FFF1F0] text-[#C62828]' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`} data-testid={`status-tag-${text.toLowerCase().replaceAll(' ', '-')}`}>{text}</span>;
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
          <div className="h-8 w-64 animate-pulse rounded bg-[#F7F9FC]" />
          <div className="h-44 animate-pulse rounded-2xl bg-[#F7F9FC]" />
          <div className="h-64 animate-pulse rounded-2xl bg-[#F7F9FC]" />
        </div>
      )}
      {isError && (
        <div className="rounded-xl border border-[#E4E9F0] bg-[#F7F9FC] p-8 text-center" data-testid="error-report">
          <ShieldAlert className="mx-auto text-[#B76E00]" size={36} />
          <h1 className="mt-4 font-display text-xl font-bold text-[#172B4D]">This report could not be loaded</h1>
          <p className="mt-2 text-sm text-[#667085]">It may have expired, been cleared, or belong to another browser session.</p>
          <Button onClick={() => refetch()} variant="outline" className="mt-5" data-testid="button-retry-report">Try again</Button>
        </div>
      )}
      {copyError && (
        <p role="status" className="mb-4 text-xs font-semibold text-[#C62828]" data-testid="error-copy-summary">
          Could not copy the report summary to clipboard. Please check browser permissions.
        </p>
      )}
      {report && <ReportView report={report} onCopy={copySummary} copied={copied} />}
    </div>
  );
}

function SummaryRow({ item, onDelete }: { item: AnalysisSummary; onDelete?: (id: string) => void }) {
  const assessment = assessmentPresentation(item.overallAssessment);
  return <div className="grid gap-4 border-b border-[#E4E9F0] p-4 last:border-b-0 sm:grid-cols-[1fr_150px_150px_auto] sm:items-center sm:px-5" data-testid={`analysis-row-${item.id}`}>
    <Link href={`/report/${encodeURIComponent(item.id)}`} className="group min-w-0" data-testid={`link-analysis-${item.id}`}><div className="truncate text-sm font-bold text-[#172B4D] group-hover:text-[#2563EB]">{item.jobTitle || item.sourceLabel || 'Offer review'}</div><div className="mt-1 truncate text-xs text-[#667085]">{item.companyName || 'Company not identified'} · {item.sourceType.toUpperCase()} · {dateLabel(item.createdAt)}</div></Link>
    <StatusTag text={assessment.label} tone={assessment.tone} />
    <div className="text-xs text-[#667085]">{verificationLabel(item.verificationStatus)}<div className="mt-1">{item.findingCount} {item.findingCount === 1 ? 'finding' : 'findings'}</div></div>
    {onDelete && <button type="button" aria-label={`Delete report ${item.jobTitle || item.id}`} onClick={() => onDelete(item.id)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold text-[#667085] hover:bg-[#FFF1F0] hover:text-[#C62828]" data-testid={`button-delete-${item.id}`}><Trash2 size={15} />Delete</button>}
  </div>;
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
  return <div className="page-enter mx-auto max-w-[1120px] px-5 py-10 sm:px-8 sm:py-14">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><Eyebrow><LockKeyhole size={14} /> Private browser session</Eyebrow><h1 className="font-display text-4xl font-extrabold tracking-[-.055em]" data-testid="text-history-title">Your history</h1><p className="mt-3 max-w-[600px] text-sm leading-6 text-[#667085]">Saved reports are associated with this anonymous browser session. Clearing browser data may remove access.</p></div><Link href="/analyze" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 text-sm font-bold text-white hover:bg-[#1D4ED8] focus-ring" data-testid="button-history-analyze">Analyze an offer <ArrowRight size={16} /></Link></div>
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[#E4E9F0] bg-[#F7F9FC] p-5"><div className="text-xs font-semibold text-[#667085]">Reports in this session</div>{dashboard.isLoading ? <div className="mt-2 h-8 w-16 animate-pulse rounded bg-white" /> : dashboard.isError ? <div className="mt-2 text-sm text-[#667085]">Summary unavailable</div> : <div className="mt-1 font-display text-3xl font-extrabold" data-testid="text-total-analyses">{total ?? 0}</div>}</div>
      <div className="rounded-xl border border-[#E4E9F0] bg-white p-5"><div className="text-xs font-semibold text-[#667085]">Opportunities of concern</div>{dashboard.isLoading ? <div className="mt-2 h-8 w-16 animate-pulse rounded bg-[#F7F9FC]" /> : dashboard.isError ? <div className="mt-2 text-sm text-[#667085]">Summary unavailable</div> : <div className="mt-1 font-display text-3xl font-extrabold text-[#C62828]" data-testid="text-concern-count">{dashboard.data?.concernCount ?? 0}</div>}<p className="mt-1 text-xs text-[#667085]">Elevated scam signals requiring careful independent verification.</p></div>
    </div>
    <div className="mt-8 overflow-hidden rounded-xl border border-[#E4E9F0]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E4E9F0] bg-[#F7F9FC] px-5 py-4 sm:flex-row sm:items-center"><div><h2 className="text-sm font-bold">Saved analyses</h2><p className="mt-1 text-xs text-[#667085]">Only visible in your current anonymous session.</p></div>{list.data?.length ? <Button variant="outline" size="sm" disabled={clear.isPending} onClick={clearAll} className="gap-2 border-[#D5DDE7] text-[#667085] hover:text-[#C62828]" data-testid="button-clear-history"><Trash2 size={14} />{clear.isPending ? 'Clearing…' : 'Clear history'}</Button> : null}</div>
      {list.isLoading ? <div className="space-y-3 p-5" data-testid="loading-history">{[1,2,3].map((x) => <div key={x} className="h-16 animate-pulse rounded-lg bg-[#F7F9FC]" />)}</div> : list.isError ? <div className="p-8 text-center" data-testid="error-history"><ShieldAlert className="mx-auto text-[#B76E00]" /><h3 className="mt-3 text-sm font-bold">History could not be loaded</h3><p className="mt-1 text-xs text-[#667085]">Your session may be unavailable right now.</p><Button variant="outline" onClick={() => { void list.refetch(); void dashboard.refetch(); }} className="mt-4" data-testid="button-retry-history">Try again</Button></div> : list.data?.length ? <div>{list.data.map((item) => <SummaryRow key={item.id} item={item} onDelete={deleteOne} />)}</div> : <div className="px-6 py-14 text-center" data-testid="empty-history"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#E8F5F3] text-[#0F9F91]"><FileCheck2 size={23} /></span><h3 className="mt-4 font-display text-lg font-extrabold">No saved analyses yet</h3><p className="mx-auto mt-2 max-w-[380px] text-sm leading-6 text-[#667085]">When you review a job opportunity, its report will appear here for this session.</p><Link href="/analyze" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#2563EB]" data-testid="link-empty-history-analyze">Start your first review <ArrowRight size={15} /></Link></div>}
    </div>
    {(error || remove.isPending || clear.isPending) && <p className="mt-3 text-sm text-[#C62828]" role="status" data-testid="status-history-action">{error || 'Updating your history…'}</p>}
  </div>;
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
  return <div className="page-enter mx-auto max-w-[1050px] px-5 py-10 sm:px-8 sm:py-14">
    <div className="max-w-[720px]"><Eyebrow><Globe2 size={14} /> Public-source search</Eyebrow><h1 className="font-display text-4xl font-extrabold tracking-[-.055em] sm:text-5xl" data-testid="text-companies-title">Look beyond the listing.</h1><p className="mt-4 text-base leading-7 text-[#667085]">Search public sources related to a company or opportunity. Results are context—not endorsements, verifications, or a complete record.</p></div>
    <Form {...form}><form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row"><label htmlFor="company-search" className="sr-only">Company or opportunity search</label><div className="relative flex-1"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#667085]" /><Input id="company-search" {...form.register('query')} maxLength={160} placeholder="Company name, domain, or role" className="h-12 border-[#D5DDE7] bg-white pl-11" data-testid="input-company-search" /></div><Button type="submit" disabled={search.isFetching} className="h-12 gap-2 bg-[#2563EB] px-6 font-bold text-white hover:bg-[#1D4ED8]" data-testid="button-search-company">{search.isFetching ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />}Search sources</Button></form></Form>
    {form.formState.errors.query && <p className="mt-2 text-xs text-[#C62828]" data-testid="error-company-search">{form.formState.errors.query.message}</p>}
    <div className="mt-8">
      {!submitted && <div className="rounded-xl border border-dashed border-[#D5DDE7] bg-[#F7F9FC] px-6 py-12 text-center" data-testid="empty-company-search"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-[#2563EB]"><Search size={22} /></span><h2 className="mt-4 text-base font-bold">Search published information</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">Enter a company or opportunity to see public-source results, if search is available.</p></div>}
      {submitted && search.isLoading && <div className="space-y-3" data-testid="loading-company-search">{[1,2,3].map((n) => <div key={n} className="h-28 animate-pulse rounded-xl bg-[#F7F9FC]" />)}</div>}
      {submitted && search.isError && <div className="rounded-xl border border-[#E4E9F0] bg-[#F7F9FC] p-7 text-center" data-testid="error-company-search-results"><h2 className="font-bold">Search is unavailable</h2><p className="mt-2 text-sm text-[#667085]">Public results could not be retrieved. This says nothing about the company.</p><Button variant="outline" onClick={() => search.refetch()} className="mt-4" data-testid="button-retry-company-search">Try again</Button></div>}
      {submitted && search.data && <section data-testid="company-search-results"><div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-base font-bold">Results for “{search.data.query}”</h2><span className="text-xs text-[#667085]">{search.data.retrievedAt ? `Retrieved ${dateLabel(search.data.retrievedAt)}` : ''}</span></div>
        {search.data.status !== 'completed' && <div className="mb-4 rounded-lg border border-[#F0DDB9] bg-[#FFFBF3] px-4 py-3 text-sm text-[#72551E]" data-testid="status-company-search">{search.data.note || `Search status: ${search.data.status.replaceAll('_', ' ')}.`}</div>}
        {search.data.status === 'completed' && search.data.note && <p className="mb-4 text-sm text-[#667085]" data-testid="text-company-search-note">{search.data.note}</p>}
        {search.data.results.length ? <div className="space-y-3">{search.data.results.map((result, i) => <article key={`${result.url}-${i}`} className="rounded-xl border border-[#E4E9F0] p-5 transition hover:border-[#C4D4EE]" data-testid={`company-result-${i}`}><div className="flex flex-wrap items-center gap-2 text-[11px] text-[#667085]"><span className="rounded bg-[#F7F9FC] px-2 py-1">{result.domain}</span>{result.publishedAt && <span>{dateLabel(result.publishedAt)}</span>}</div><a href={result.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-bold text-[#2563EB] hover:underline" data-testid={`link-company-result-${i}`}>{result.title}<ArrowUpRight size={15} /></a><p className="mt-2 text-sm leading-6 text-[#344054]">{result.snippet}</p></article>)}</div> : <div className="rounded-xl border border-dashed border-[#D5DDE7] p-8 text-center text-sm leading-6 text-[#667085]" data-testid="empty-company-results">No public sources were returned. Search coverage can be incomplete; no results do not imply misconduct.</div>}
        <p className="mt-4 text-xs leading-5 text-[#667085]">Public results may be incomplete, stale, or unrelated. Verify key details through an official channel before relying on them.</p>
      </section>}
    </div>
  </div>;
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
  return <div className="page-enter mx-auto max-w-[1120px] px-5 py-10 sm:px-8 sm:py-14">
    <div className="grid gap-10 lg:grid-cols-[.78fr_1.22fr]">
      <div className="lg:sticky lg:top-28 lg:self-start"><Eyebrow><BookOpen size={14} /> Practical safety guide</Eyebrow><h1 className="font-display text-4xl font-extrabold leading-[1.08] tracking-[-.055em] sm:text-5xl" data-testid="text-safety-title">Slow down.<br />Check the details.</h1><p className="mt-5 max-w-[400px] text-base leading-7 text-[#667085]">A few independent checks can help you make a more informed choice. No automated review can replace your judgment or confirm every offer.</p><Link href="/analyze" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-3 text-sm font-bold text-white hover:bg-[#1D4ED8] focus-ring" data-testid="button-safety-analyze">Review an offer <ArrowRight size={16} /></Link></div>
      <div className="space-y-0">{checklist.map(([title, detail], index) => <article key={title} className="grid gap-4 border-t border-[#E4E9F0] py-6 sm:grid-cols-[46px_1fr]" data-testid={`safety-tip-${index}`}><span className="font-mono text-sm font-bold text-[#0F9F91]">0{index + 1}</span><div><h2 className="font-display text-lg font-extrabold tracking-[-.02em]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#667085]">{detail}</p></div></article>)}
        <section className="mt-5 rounded-xl border border-[#E4E9F0] bg-[#F7F9FC] p-5 sm:p-6" data-testid="safety-reporting-resources"><h2 className="flex items-center gap-2 font-display text-lg font-extrabold"><ShieldAlert size={19} className="text-[#B76E00]" /> If something feels wrong</h2><p className="mt-2 text-sm leading-6 text-[#667085]">Stop sharing information or sending money. Save relevant messages, verify the organization using independently sourced contact details, and report suspected impersonation to the real organization and the appropriate consumer protection or law-enforcement agency in your area.</p><p className="mt-3 text-xs leading-5 text-[#667085]">If you have already shared financial or identity information, contact your bank or relevant identity-protection authority promptly.</p></section>
      </div>
    </div>
    <div className="mt-10 rounded-xl border-l-4 border-[#0F9F91] bg-[#F4FBFA] px-5 py-4 text-sm leading-6 text-[#344054]"><b>Remember:</b> JobShield’s score is a heuristic indicator, not a probability. A higher or lower score alone cannot prove that an organization or offer is legitimate or fraudulent.</div>
  </div>;
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
