"use client";

import { useEffect } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { extractArray } from "@/lib/parse";

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
  }, []);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-3">
        {accounts.length > 0 && (
          <div className="relative">
            <select
              className="appearance-none bg-white text-slate-700 text-sm px-3 py-1.5 pr-8 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 cursor-pointer shadow-sm"
              value={selectedAccount?.accountSeq ?? ""}
              onChange={(e) => {
                const a = accounts.find((x) => x.accountSeq === e.target.value);
                if (a) setSelectedAccount(a);
              }}
            >
              {accounts.map((a) => (
                <option key={a.accountSeq} value={a.accountSeq}>
                  {a.accountName}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>
        )}
        <button
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
