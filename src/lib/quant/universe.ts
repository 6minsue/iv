// 스크리너 유니버스 (대형주 큐레이션)
export interface UniverseItem {
  symbol: string;
  name: string;
  sector: string;
}

export const KR_UNIVERSE: UniverseItem[] = [
  { symbol: "005930", name: "삼성전자", sector: "반도체" },
  { symbol: "000660", name: "SK하이닉스", sector: "반도체" },
  { symbol: "373220", name: "LG에너지솔루션", sector: "2차전지" },
  { symbol: "207940", name: "삼성바이오로직스", sector: "바이오" },
  { symbol: "005380", name: "현대차", sector: "자동차" },
  { symbol: "000270", name: "기아", sector: "자동차" },
  { symbol: "005490", name: "POSCO홀딩스", sector: "철강" },
  { symbol: "035420", name: "NAVER", sector: "인터넷" },
  { symbol: "035720", name: "카카오", sector: "인터넷" },
  { symbol: "051910", name: "LG화학", sector: "화학" },
  { symbol: "006400", name: "삼성SDI", sector: "2차전지" },
  { symbol: "068270", name: "셀트리온", sector: "바이오" },
  { symbol: "105560", name: "KB금융", sector: "금융" },
  { symbol: "055550", name: "신한지주", sector: "금융" },
  { symbol: "012330", name: "현대모비스", sector: "자동차" },
  { symbol: "028260", name: "삼성물산", sector: "지주" },
];

export const US_UNIVERSE: UniverseItem[] = [
  { symbol: "AAPL", name: "Apple", sector: "Tech" },
  { symbol: "MSFT", name: "Microsoft", sector: "Tech" },
  { symbol: "NVDA", name: "Nvidia", sector: "반도체" },
  { symbol: "AMD", name: "AMD", sector: "반도체" },
  { symbol: "GOOGL", name: "Alphabet", sector: "인터넷" },
  { symbol: "META", name: "Meta", sector: "인터넷" },
  { symbol: "AMZN", name: "Amazon", sector: "소비재" },
  { symbol: "TSLA", name: "Tesla", sector: "자동차" },
  { symbol: "NFLX", name: "Netflix", sector: "미디어" },
  { symbol: "AVGO", name: "Broadcom", sector: "반도체" },
  { symbol: "ORCL", name: "Oracle", sector: "Tech" },
  { symbol: "PLTR", name: "Palantir", sector: "Tech" },
  { symbol: "COIN", name: "Coinbase", sector: "금융" },
  { symbol: "UBER", name: "Uber", sector: "소비재" },
];
