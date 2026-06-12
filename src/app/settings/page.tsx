"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { CheckCircle, AlertCircle, ExternalLink, ShieldCheck } from "lucide-react";

const MAX_ORDER = Number(process.env.NEXT_PUBLIC_MAX_ORDER_AMOUNT ?? 50000);

export default function SettingsPage() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (res.ok && !data.error) {
        const count = Array.isArray(data) ? data.length : (data.accounts?.length ?? 0);
        setTestResult({ ok: true, message: `연결 성공! 계좌 ${count}개를 확인했습니다.` });
      } else {
        setTestResult({ ok: false, message: data.error ?? "API 오류가 발생했습니다." });
      }
    } catch {
      setTestResult({ ok: false, message: "서버 연결에 실패했습니다." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header title="설정" />
      <div className="p-6 max-w-2xl space-y-5">

        {/* API 키 안내 */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">API 키 설정</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            API 키는 프로젝트 루트의{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 text-xs font-mono">.env.local</code>{" "}
            파일에 저장됩니다. 이 파일은{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 text-xs font-mono">.gitignore</code>에 포함되어 있어 Git에 커밋되지 않습니다.
          </p>

          <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs space-y-1">
            <p><span className="text-slate-500"># .env.local</span></p>
            <p><span className="text-violet-400">TOSS_CLIENT_ID</span>=<span className="text-green-400">tsck_live_...</span></p>
            <p><span className="text-violet-400">TOSS_CLIENT_SECRET</span>=<span className="text-green-400">tssk_live_...</span></p>
            <p><span className="text-violet-400">NEXT_PUBLIC_MAX_ORDER_AMOUNT</span>=<span className="text-yellow-400">50000</span></p>
          </div>

          <a
            href="https://developers.tossinvest.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition-colors font-medium"
          >
            토스증권 개발자 포털 <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* 거래 안전장치 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">거래 안전장치</h2>
          </div>
          <p className="text-sm text-amber-700">
            매수 주문 1건 최대 금액이{" "}
            <span className="font-bold">₩{MAX_ORDER.toLocaleString()}</span>으로 제한되어 있습니다.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            변경하려면 <code className="bg-amber-100 px-1 rounded font-mono">NEXT_PUBLIC_MAX_ORDER_AMOUNT</code> 값을 수정 후 서버를 재시작하세요.
          </p>
        </div>

        {/* 연결 테스트 */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">연결 테스트</h2>
          <p className="text-sm text-slate-500">설정한 API 키가 정상적으로 작동하는지 확인합니다.</p>
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            {testing ? "테스트 중..." : "연결 테스트"}
          </button>

          {testResult && (
            <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${testResult.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              {testResult.ok
                ? <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                : <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
              <p className={`text-sm font-medium ${testResult.ok ? "text-green-700" : "text-red-600"}`}>{testResult.message}</p>
            </div>
          )}
        </div>

        {/* 지원 기능 */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">지원 기능</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              "실시간 시세 조회 (US/KR)",
              "캔들 차트 (일봉/1분)",
              "호가창",
              "계좌 정보 조회",
              "보유 종목 조회",
              "주문 내역 조회",
              "매수/매도 주문",
              "이동평균선 (MA5/20/60)",
              "RSI(14) 지표",
              "거래량 분석",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-slate-600">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
