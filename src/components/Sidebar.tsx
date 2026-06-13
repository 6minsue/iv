"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, BookOpen, Briefcase, Home, TrendingUp, Settings, FlaskConical, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", icon: Home, label: "대시보드" },
  { href: "/market", icon: TrendingUp, label: "시장" },
  { href: "/signals", icon: Gauge, label: "시그널" },
  { href: "/strategy", icon: FlaskConical, label: "전략 연구소" },
  { href: "/watchlist", icon: BookOpen, label: "관심종목" },
  { href: "/portfolio", icon: Briefcase, label: "포트폴리오" },
  { href: "/analytics", icon: BarChart2, label: "분석" },
  { href: "/settings", icon: Settings, label: "설정" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-16 lg:w-56 bg-white border-r border-slate-200 shrink-0 h-screen sticky top-0 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0 shadow-md">
          <TrendingUp className="w-4 h-4 text-white" />
        </div>
        <div className="hidden lg:block">
          <p className="text-slate-900 font-bold text-sm tracking-tight leading-none">Quant</p>
          <p className="text-slate-400 text-xs mt-0.5">Investment</p>
        </div>
      </div>

      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-100">
        <div className="hidden lg:block text-xs text-slate-400 text-center">
          토스증권 Open API
        </div>
      </div>
    </aside>
  );
}
