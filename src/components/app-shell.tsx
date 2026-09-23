"use client";

import { motion } from "motion/react";
import { BookOpen, Brain, ChartColumn, CirclePlus, Flame, House, Layers, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useVocabStats } from "@/lib/store";
import { cn } from "@/lib/utils";
import { WordSheet } from "./word-bits";
import { Logo } from "./logo";
import { ConnectivityPill } from "./install-app";

export { Logo };
import { DailyRecap } from "./daily-recap";
import { ExcelImport } from "./excel-import";
import { AchievementWatcher } from "./achievement-toast";

const NAV = [
  { href: "/words", label: "Words", icon: BookOpen, match: ["/words", "/edit"] },
  { href: "/add", label: "Add", icon: CirclePlus, match: ["/add"] },
  { href: "/", label: "Home", icon: House, match: [] as string[], center: true },
  { href: "/quiz", label: "Quiz", icon: Brain, match: ["/quiz"] },
  { href: "/flashcards", label: "Cards", icon: Layers, match: ["/flashcards"] },
];

function Header() {
  const pathname = usePathname();
  const stats = useVocabStats();
  const manageActive = pathname.startsWith("/manage");
  return (
    <header className="sticky top-0 z-40">
      <div className="glass !rounded-none !border-x-0 !border-t-0 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="VocaBera home">
            <Logo />
            <div className="leading-tight">
              <div className="text-[18px] font-extrabold tracking-tight">
                Voca<span className="text-gradient">Bera</span>
              </div>
              <div className="-mt-0.5 text-[10.5px] font-semibold tracking-wide text-muted">Learn · Recall · Master</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/progress"
              aria-label={`Progress · ${stats.streak.current}-day streak`}
              title="Progress & insights"
              className={cn(
                "flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums transition active:scale-95",
                pathname.startsWith("/progress") ? "bg-orange-500/15 ring-1 ring-orange-500/30" : "surface",
                stats.streak.activeToday ? "text-orange-600 dark:text-orange-300" : "text-muted",
              )}
            >
              <Flame className={cn("size-[18px]", stats.streak.activeToday && "fill-orange-400/60 text-orange-500")} />
              {stats.streak.current}
              <ChartColumn className="ml-0.5 hidden size-4 opacity-70 sm:block" />
            </Link>
            <Link
              href="/manage"
              aria-label="Manage"
              title="Manage"
              className={cn(
                "grid size-10 place-items-center rounded-full transition active:scale-90",
                manageActive ? "brand-gradient text-white shadow-lg shadow-brand-500/30" : "surface text-fg/80 hover:text-fg",
              )}
            >
              <Settings2 className="size-[19px]" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const isActive = (item: (typeof NAV)[number]) =>
    item.center ? pathname === "/" : item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto max-w-[460px] md:max-w-[540px]">
        <div className="glass flex h-[70px] items-center justify-around rounded-[28px] px-1.5">
          {NAV.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            if (item.center) {
              return (
                <Link key={item.href} href={item.href} aria-label="Home" aria-current={active ? "page" : undefined} className="relative -mt-9 flex flex-col items-center px-1">
                  <span
                    className={cn(
                      "sheen grid size-[62px] place-items-center rounded-[22px] brand-gradient text-white shadow-xl shadow-brand-500/40 ring-[5px] ring-[var(--bg)] transition-transform duration-200 active:scale-90",
                      active && "scale-[1.04]",
                    )}
                  >
                    <Icon className="size-7" strokeWidth={2.3} />
                  </span>
                  <span className={cn("mt-1 text-[11px] font-bold", active ? "text-brand-700 dark:text-brand-200" : "text-muted")}>Home</span>
                </Link>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="relative flex h-[58px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px]"
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-x-0.5 inset-y-0 rounded-[22px] bg-brand-500/12 dark:bg-brand-400/15"
                    transition={{ type: "spring", stiffness: 520, damping: 40 }}
                  />
                )}
                <Icon
                  className={cn("relative size-[22px] transition-colors", active ? "text-brand-600 dark:text-brand-300" : "text-muted")}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span className={cn("relative text-[11px] font-semibold", active ? "text-brand-700 dark:text-brand-200" : "text-muted")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="app-bg" aria-hidden />
      <Header />
      <ConnectivityPill />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-36 pt-4 sm:px-6 sm:pt-6 lg:px-8">{children}</main>
      <BottomNav />
      <WordSheet />
      <DailyRecap />
      <ExcelImport />
      <AchievementWatcher />
    </>
  );
}
