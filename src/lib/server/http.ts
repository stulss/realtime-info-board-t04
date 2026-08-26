export class ProviderHttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

type FetchJsonOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - Date.now());
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 8_000, retries = 2, ...requestInit } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...requestInit, signal: controller.signal });
      if (!response.ok) {
        const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        const error = new ProviderHttpError(`공급자 API가 HTTP ${response.status}을 반환했습니다.`, response.status, retryAfterMs);
        const shouldRetry = response.status >= 500 && response.status !== 503 && attempt < retries;
        if (!shouldRetry) throw error;
        await wait(250 * 2 ** attempt);
        continue;
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ProviderHttpError) throw error;
      if (attempt >= retries) {
        const message = error instanceof Error && error.name === "AbortError"
          ? "공급자 API 응답 시간이 초과되었습니다."
          : "공급자 API에 연결할 수 없습니다.";
        throw new ProviderHttpError(message);
      }
      await wait(250 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ProviderHttpError("공급자 API 요청을 완료하지 못했습니다.");
}
