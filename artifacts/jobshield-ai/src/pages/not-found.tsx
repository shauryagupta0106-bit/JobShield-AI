import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-[#D8DFD5] bg-white p-8 text-center shadow-xs">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#D8DFD5] bg-[#E6EBE4] text-[#171A19]">
          <AlertTriangle size={24} className="text-[#B5740D]" />
        </div>
        <span className="mt-4 block font-mono text-xs font-bold uppercase tracking-wider text-[#8C948F]">
          404 · Page Not Found
        </span>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-[#171A19]">
          Resource unavailable
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-[#616965]">
          The address you requested does not exist or may have been relocated.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#C7F36B] px-5 font-bold text-[#171A19] shadow-xs transition hover:bg-[#BCEE57]"
        >
          <ArrowLeft size={14} />
          Return to overview
        </Link>
      </div>
    </div>
  );
}
