"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2, BookOpen, Briefcase, Home, TrendingUp, Settings,
  FlaskConical, Gauge, Atom,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", icon: Home, label: "대시보드" },
  { href: "/market", icon: TrendingUp, label: "시장" },
  { href: "/signals", icon: Gauge, label: "시그널" },
  { href: "/strategy", icon: FlaskConical, label: "전략 연구소" },
  { href: "/lab", icon: Atom, label: "리서치 랩" },
  { href: "/watchlist", icon: BookOpen, label: "관심종목" },
  { href: "/portfolio", icon: Briefcase, label: "포트폴리오" },
  { href: "/analytics", icon: BarChart2, label: "분석" },
  { href: "/settings", icon: Settings, label: "설정" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-16 lg:w-60 shrink-0 h-screen sticky top-0 glass border-r border-[var(--border)] z-20">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shrink-0 glow">
          <Atom className="w-5 h-5 text-white" />
        </div>
        <div className="hidden lg:block leading-none">
          <p className="font-bold text-sm tracking-tight grad-text">QUANT IV</p>
          <p className="text-[var(--text-mute)] text-[11px] mt-1">Terminal</p>
        </div>
      </div>

      <nav className="flex-1 py-3 space-y-0.5 px-2.5">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative",
                active
                  ? "text-white bg-white/[0.06]"
                  : "text-[var(--text-dim)] hover:text-white hover:bg-white/[0.03]"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-gradient-to-b from-violet-400 to-blue-400" />
              )}
              <Icon className={cn("w-[18px] h-[18px] shrink-0 transition-colors", active ? "text-violet-300" : "")} />
              <span className="hidden lg:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[var(--border)]">
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-[var(--text-mute)]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          토스증권 Open API
        </div>
      </div>
    </aside>
  );
}
