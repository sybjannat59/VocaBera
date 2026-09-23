import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("sheen relative grid size-10 place-items-center rounded-[14px] brand-gradient shadow-lg shadow-brand-500/30", className)}>
      <svg viewBox="0 0 24 24" className="size-[22px] text-white" fill="none" aria-hidden>
        <path d="M5 5.5l7 13 7-13" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.2 5.5h5.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
      </svg>
      <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-amber-300 ring-2 ring-[var(--bg)]" />
    </span>
  );
}
