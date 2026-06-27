"use client";

import { useEffect, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { extractArray } from "@/lib/parse";

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // 실시간 시계: 외부 시스템(시간) 동기화 목적의 정당한 effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 panel-2 px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="text-sm font-mono tabular-nums text-slate-200 min-w-[68px] text-center">
        {now ? now.toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
      </span>
    </div>
  );
}

export default function Header({ title }: { title: string }) {
  const { accounts, selectedAccount, setAccounts, setSelectedAccount } = useAppStore();

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const list = extractArray<typeof accounts[number]>(d, "accounts", "data");
        setAccounts(list);
        if (list.length > 0 && !selectedAccount) setSelectedAccount(list[0]);
      })
      .catch(() => {});
    // 계좌 1회 로드 (마운트 시) — 의도적으로 deps 비움
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="flex items-center justify-between px-6 py-4 glass sticky top-0 z-10">
      <h1 className="text-base font-semibold text-white">{title}</h1>
      <div className="flex items-center gap-3">
        <LiveClock />
        {accounts.length > 0 && (
          <div className="relative">
            <select
              className="appearance-none panel-2 text-[var(--text-dim)] text-sm px-3 py-1.5 pr-8 focus:outline-none focus:border-violet-400 cursor-pointer"
              value={selectedAccount?.accountSeq ?? ""}
              onChange={(e) => {
                const a = accounts.find((x) => x.accountSeq === e.target.value);
                if (a) setSelectedAccount(a);
              }}
            >
              {accounts.map((a) => (
                <option key={a.accountSeq} value={a.accountSeq} className="bg-[var(--surface)]">
                  {a.accountName}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-mute)] pointer-events-none" />
          </div>
        )}
        <button
          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[var(--text-mute)] hover:text-white transition-colors"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
