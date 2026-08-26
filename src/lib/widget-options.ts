export const EXCHANGE_CURRENCIES = [
  { value: "USD", label: "미국 달러 (USD)" },
  { value: "JPY(100)", label: "일본 엔 100 (JPY)" },
  { value: "EUR", label: "유로 (EUR)" },
  { value: "CNH", label: "중국 위안 (CNH)" },
  { value: "GBP", label: "영국 파운드 (GBP)" },
  { value: "AUD", label: "호주 달러 (AUD)" },
  { value: "CAD", label: "캐나다 달러 (CAD)" },
  { value: "CHF", label: "스위스 프랑 (CHF)" },
  { value: "HKD", label: "홍콩 달러 (HKD)" },
  { value: "SGD", label: "싱가포르 달러 (SGD)" },
  { value: "NZD", label: "뉴질랜드 달러 (NZD)" },
  { value: "THB", label: "태국 바트 (THB)" },
  { value: "IDR(100)", label: "인도네시아 루피아 100 (IDR)" },
  { value: "MYR", label: "말레이시아 링깃 (MYR)" },
  { value: "AED", label: "아랍에미리트 디르함 (AED)" },
  { value: "BHD", label: "바레인 디나르 (BHD)" },
  { value: "KWD", label: "쿠웨이트 디나르 (KWD)" },
  { value: "SAR", label: "사우디 리얄 (SAR)" },
  { value: "DKK", label: "덴마크 크로네 (DKK)" },
  { value: "NOK", label: "노르웨이 크로네 (NOK)" },
  { value: "SEK", label: "스웨덴 크로나 (SEK)" },
] as const;

export type ExchangeCurrency = (typeof EXCHANGE_CURRENCIES)[number]["value"];

export const DEFAULT_EXCHANGE_CURRENCY: ExchangeCurrency = "USD";
export const DEFAULT_MARKET_ITEM_NAME = "명예의 파편 주머니(대)";

const EXCHANGE_CURRENCY_VALUES = new Set<string>(EXCHANGE_CURRENCIES.map(({ value }) => value));

export function isExchangeCurrency(value: string): value is ExchangeCurrency {
  return EXCHANGE_CURRENCY_VALUES.has(value);
}

export function normalizeMarketItemName(value: string | null | undefined): string {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized || DEFAULT_MARKET_ITEM_NAME;
}

export function isValidMarketItemName(value: string): boolean {
  return value.length <= 50 && /^[\p{L}\p{N}\s()[\]{}+\-·]+$/u.test(value);
}
