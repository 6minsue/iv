// 토스증권 거래비용 모델 (2025~2026 정책 반영)
// 출처: 토스증권 미국주식 표준 위탁수수료 0.1% (2025.12.1), 환전 정규시간 95% 우대 → 0.05%
//       국내주식 0.015%(KRX), 증권거래세 매도 시 0.18%(2024~) / 이벤트 수수료 무료 별도

export interface FeeProfile {
  /** 편도 수수료율 (수수료 + 환전 등 거래마다 발생) */
  commission: number;
  /** 슬리피지 기본값 */
  slippage: number;
  /** 매도세 (매도 체결에만) */
  sellTax: number;
  label: string;
}

const isUSSymbol = (symbol: string) => !/^\d{6}$/.test(symbol);

/**
 * 종목에 맞는 토스 수수료 프로파일.
 * @param freeEvent 국내주식 수수료 무료 이벤트 적용 여부 (2025.12.15~2026.6)
 */
export function tossFeeProfile(symbol: string, freeEvent = false): FeeProfile {
  if (isUSSymbol(symbol)) {
    return {
      // 위탁 0.1% + 환전 0.05% (편도)
      commission: 0.001 + 0.0005,
      slippage: 0.0005,
      sellTax: 0, // 미국주식 거래세 없음
      label: "미국주식 (위탁 0.1% + 환전 0.05%)",
    };
  }
  return {
    commission: freeEvent ? 0 : 0.00015, // KRX 0.015% (이벤트 시 무료)
    slippage: 0.0005,
    sellTax: 0.0018, // 증권거래세 0.18% (매도)
    label: freeEvent ? "국내주식 (수수료 무료 이벤트 + 거래세 0.18%)" : "국내주식 (0.015% + 거래세 0.18%)",
  };
}
