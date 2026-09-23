"use client";

import { AnimatePresence, motion, useDragControls, useIsPresent } from "motion/react";
import { LoaderCircle, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { lockScroll } from "@/lib/scroll-lock";
import { capitalizeFirst } from "@/lib/text-format";
import { clamp, cn, uniqueCI } from "@/lib/utils";

export type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export const TONES = {
  brand: { grad: "from-brand-500 to-glow-500", soft: "bg-brand-500/10 text-brand-600 dark:bg-brand-400/15 dark:text-brand-300", shadow: "shadow-brand-500/30" },
  indigo: { grad: "from-indigo-500 to-violet-500", soft: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300", shadow: "shadow-indigo-500/30" },
  sky: { grad: "from-sky-400 to-blue-500", soft: "bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300", shadow: "shadow-sky-500/30" },
  emerald: { grad: "from-emerald-400 to-teal-500", soft: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300", shadow: "shadow-emerald-500/30" },
  amber: { grad: "from-amber-400 to-orange-500", soft: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300", shadow: "shadow-amber-500/30" },
  pink: { grad: "from-pink-500 to-rose-500", soft: "bg-pink-500/10 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300", shadow: "shadow-pink-500/30" },
  violet: { grad: "from-violet-500 to-fuchsia-500", soft: "bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300", shadow: "shadow-violet-500/30" },
  teal: { grad: "from-teal-400 to-cyan-500", soft: "bg-teal-500/10 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300", shadow: "shadow-teal-500/30" },
  rose: { grad: "from-rose-500 to-red-500", soft: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300", shadow: "shadow-rose-500/30" },
  slate: { grad: "from-slate-500 to-slate-700", soft: "bg-slate-500/10 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300", shadow: "shadow-slate-500/30" },
} as const;
export type Tone = keyof typeof TONES;

/* --------------------------------- Button --------------------------------- */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "success";
type BtnSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: IconType;
  iconRight?: IconType;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary: "brand-gradient sheen text-white shadow-lg shadow-brand-500/25 hover:brightness-110",
  secondary: "surface text-fg hover:brightness-[1.03] dark:hover:bg-white/10",
  ghost: "text-fg/80 hover:bg-black/5 hover:text-fg dark:hover:bg-white/10",
  danger: "bg-linear-to-br from-rose-500 to-red-500 sheen text-white shadow-lg shadow-rose-500/25 hover:brightness-110",
  soft: "bg-brand-500/10 text-brand-700 hover:bg-brand-500/15 dark:bg-brand-400/15 dark:text-brand-200",
  success: "bg-linear-to-br from-emerald-500 to-teal-500 sheen text-white shadow-lg shadow-emerald-500/25 hover:brightness-110",
};
const BTN_SIZES: Record<BtnSize, string> = {
  sm: "h-9 gap-1.5 rounded-xl px-3.5 text-[13px]",
  md: "h-11 gap-2 rounded-2xl px-5 text-sm",
  lg: "h-14 gap-2.5 rounded-[20px] px-7 text-[15px]",
};

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className,
      )}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : Icon ? (
        <Icon className={size === "lg" ? "size-5" : "size-4"} />
      ) : null}
      {children}
      {IconRight && <IconRight className="size-4" />}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  active,
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconType; label: string; active?: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        "grid shrink-0 place-items-center rounded-full transition active:scale-90 disabled:opacity-40",
        size === "sm" ? "size-8" : "size-10",
        active ? "bg-brand-500/15 text-brand-600 dark:text-brand-300" : "surface text-fg/75 hover:text-fg",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-4" : "size-[18px]"} />
    </button>
  );
}

/* ------------------------------ Layout pieces ----------------------------- */

export function Card({ className, children, glass, ...rest }: HTMLAttributes<HTMLDivElement> & { glass?: boolean }) {
  return (
    <div {...rest} className={cn(glass ? "glass" : "surface", "rounded-[26px]", className)}>
      {children}
    </div>
  );
}

export function IconTile({
  icon: Icon,
  tone = "brand",
  size = "md",
  className,
}: {
  icon: IconType;
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const box = { sm: "size-8 rounded-[10px]", md: "size-10 rounded-[13px]", lg: "size-12 rounded-[16px]", xl: "size-16 rounded-[22px]" }[size];
  const icon = { sm: "size-4", md: "size-5", lg: "size-6", xl: "size-8" }[size];
  return (
    <span className={cn("sheen grid shrink-0 place-items-center bg-linear-to-br text-white shadow-lg", TONES[tone].grad, TONES[tone].shadow, box, className)}>
      <Icon className={icon} strokeWidth={2.2} />
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  tone = "brand",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: IconType;
  tone?: Tone;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex animate-fade-up items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <IconTile icon={icon} tone={tone} size="lg" />}
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-muted sm:text-sm">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-2 px-1", className)}>
      <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  tone = "brand",
  children,
}: {
  icon: IconType;
  title: string;
  text?: string;
  tone?: Tone;
  children?: ReactNode;
}) {
  return (
    <Card className="flex animate-fade-up flex-col items-center px-6 py-12 text-center">
      <div className="relative mb-5">
        <div className={cn("absolute inset-0 rounded-full bg-linear-to-br opacity-40 blur-2xl", TONES[tone].grad)} />
        <IconTile icon={icon} tone={tone} size="xl" className="relative animate-float" />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-sm text-muted">{text}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </Card>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton", className)} />;

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <Skeleton className="h-44 w-full rounded-[28px]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-[28px]" />
    </div>
  );
}

/* --------------------------------- Inputs --------------------------------- */

export function Chip({
  active,
  onClick,
  children,
  icon: Icon,
  count,
  className,
  disabled,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: IconType;
  count?: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition active:scale-95 disabled:opacity-40",
        active ? "brand-gradient text-white shadow-md shadow-brand-500/25" : "surface text-fg/75 hover:text-fg",
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
      {count !== undefined && (
        <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/25" : "bg-black/5 dark:bg-white/10")}>
          {count}
        </span>
      )}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: IconType }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex rounded-2xl bg-black/[0.05] p-1 dark:bg-white/[0.06]", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex h-9 flex-1 items-center justify-center rounded-xl px-2.5 text-[13px] font-semibold transition-colors",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-white/15"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon && <o.icon className="size-4" />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-brand-500" : "bg-black/15 dark:bg-white/15",
      )}
    >
      <span
        className={cn(
          "absolute left-[2px] top-[2px] size-[27px] rounded-full bg-white shadow-md transition-transform duration-200",
          checked && "translate-x-[20px]",
        )}
      />
    </button>
  );
}

export function Field({
  label,
  hint,
  icon: Icon,
  required,
  action,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  icon?: IconType;
  required?: boolean;
  action?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex min-h-6 items-center gap-1.5 px-1">
        <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[13px] font-semibold text-fg/80">
          {Icon && <Icon className="size-3.5 text-muted" />}
          {label}
          {required && <span className="text-rose-500">*</span>}
        </label>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
      {hint && <p className="mt-1.5 px-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const inputCls = "field w-full px-4 py-3 outline-none placeholder:text-muted/70";

export function TagInput({
  value,
  onChange,
  placeholder,
  tone = "emerald",
  suggestions = [],
  id,
  capitalizeItems = false,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  tone?: "emerald" | "rose" | "brand";
  suggestions?: string[];
  id?: string;
  capitalizeItems?: boolean;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const chip = {
    emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    rose: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    brand: "bg-brand-500/12 text-brand-700 dark:text-brand-200",
  }[tone];
  const add = (raw: string) => {
    const parts = raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (capitalizeItems ? capitalizeFirst(s) : s));
    if (parts.length) onChange(uniqueCI([...value, ...parts]));
    setText("");
  };
  const lower = new Set(value.map((v) => v.toLowerCase()));
  const sugg = suggestions.filter((s) => !lower.has(s.toLowerCase()) && s.toLowerCase().includes(text.toLowerCase())).slice(0, 8);
  return (
    <div>
      <div className="field flex min-h-[50px] flex-wrap items-center gap-1.5 p-2" onClick={() => inputRef.current?.focus()}>
        {value.map((t) => (
          <span key={t} className={cn("inline-flex h-8 items-center gap-1 rounded-full pl-3 pr-1.5 text-[13px] font-semibold", chip)}>
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== t));
              }}
              className="grid size-5 place-items-center rounded-full hover:bg-black/10 dark:hover:bg-white/15"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]$/.test(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
          placeholder={value.length ? "Add more…" : placeholder}
          className="h-8 min-w-[7rem] flex-1 bg-transparent px-2 outline-none placeholder:text-muted/70"
        />
      </div>
      {sugg.length > 0 && (
        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto px-0.5">
          {sugg.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(uniqueCI([...value, capitalizeItems ? capitalizeFirst(s) : s]))}
              className="h-7 shrink-0 rounded-full border border-dashed border-[var(--field-border)] px-2.5 text-xs font-medium text-muted hover:text-fg"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Indicators ------------------------------- */

export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = "ring" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--b-500)" />
            <stop offset="100%" stopColor="var(--g-500)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-black/[0.07] dark:text-white/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamp(value, 0, 1))}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10", className)}>
      <div
        className={cn("h-full rounded-full brand-gradient transition-[width] duration-500 ease-out", barClassName)}
        style={{ width: `${clamp(value, 0, 1) * 100}%` }}
      />
    </div>
  );
}

export function MasteryDots({ level, className }: { level: number; className?: string }) {
  const color = level >= 5 ? "bg-emerald-500" : level >= 3 ? "bg-violet-500" : "bg-amber-500";
  return (
    <div className={cn("flex gap-[3px]", className)} aria-label={`Mastery ${level} of 5`} title={`Mastery ${level}/5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("h-1.5 w-3 rounded-full", i < level ? color : "bg-black/10 dark:bg-white/12")} />
      ))}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", className)}>
      {children}
    </span>
  );
}

const POS_TONE: Record<string, string> = {
  noun: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  verb: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  adjective: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  adverb: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  phrase: "bg-pink-500/12 text-pink-700 dark:text-pink-300",
  idiom: "bg-pink-500/12 text-pink-700 dark:text-pink-300",
};

export function PosBadge({ pos, className }: { pos: string; className?: string }) {
  if (!pos) return null;
  return <Badge className={cn(POS_TONE[pos] ?? "bg-slate-500/12 text-slate-600 dark:text-slate-300", className)}>{pos}</Badge>;
}

const DIFF_TONE: Record<string, string> = {
  easy: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  hard: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

export function DifficultyBadge({ level }: { level: string }) {
  return <Badge className={DIFF_TONE[level] ?? DIFF_TONE.medium}>{level}</Badge>;
}

/* ---------------------------------- Sheet --------------------------------- */

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Full-screen layer for AnimatePresence children. While it is animating out it stops
 * receiving taps, so a stalled exit animation can never block the app underneath.
 */
export function PresenceLayer({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const isPresent = useIsPresent();
  return (
    <div {...rest} className={className} style={{ ...rest.style, pointerEvents: isPresent ? undefined : "none" }} aria-hidden={isPresent ? rest["aria-hidden"] : true}>
      {children}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  label,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <SheetFrame key="sheet" onClose={onClose} label={label} className={className}>
          {children}
        </SheetFrame>
      )}
    </AnimatePresence>
  );
}

function SheetFrame({ onClose, label, className, children }: { onClose: () => void; label: string; className?: string; children: ReactNode }) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const controls = useDragControls();
  const isPresent = useIsPresent();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Lock page scrolling only while the sheet is really open (released as soon as it starts closing).
  useEffect(() => {
    if (!isPresent) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [isPresent]);

  return (
    <PresenceLayer className="fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={label}>
      <motion.div
        className="absolute inset-0 bg-slate-950/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => closeRef.current()}
      />
      <motion.div
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[30px] border border-white/70 bg-[rgba(248,250,255,0.97)] shadow-2xl md:max-w-xl md:rounded-[30px] dark:border-white/10 dark:bg-[rgba(16,21,37,0.97)]",
          className,
        )}
        initial={desktop ? { opacity: 0, y: 24, scale: 0.98 } : { y: "100%" }}
        animate={desktop ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
        exit={desktop ? { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.16 } } : { y: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        drag={desktop ? false : "y"}
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 700) closeRef.current();
        }}
      >
        <div className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 md:hidden" onPointerDown={(e) => controls.start(e)}>
          <span className="h-1.5 w-11 rounded-full bg-slate-400/50" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </motion.div>
    </PresenceLayer>
  );
}
