import { assertPublicUrl, parsePublicHttpUrl } from "./url-safety";

const SEARCH_ENDPOINT = "https://api.search.tinyfish.ai";
const FETCH_ENDPOINT = "https://api.fetch.tinyfish.ai";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 1_500_000;

export type TinyFishStatus = "completed" | "unavailable" | "not_configured";

export type PublicSearchResult = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt: string | null;
};

export type FetchedPage = {
  url: string;
  title: string;
  text: string;
};

export type SearchOutcome = {
  status: TinyFishStatus;
  results: PublicSearchResult[];
  note: string;
};

export type FetchOutcome = {
  status: TinyFishStatus;
  pages: FetchedPage[];
  note: string;
};

function apiKey(): string | undefined {
  const value = process.env.TINYFISH_API_KEY?.trim();
  return value || undefined;
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The research service returned an empty response.");

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("The research response exceeded the supported size.");
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(combined)) as unknown;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringField(
  record: Record<string, unknown>,
  keys: string[],
  maxLength: number,
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, maxLength);
    }
  }
  return "";
}

function safeSearchUrl(value: string): URL | null {
  try {
    return parsePublicHttpUrl(value);
  } catch {
    return null;
  }
}

function parseSearchResults(payload: unknown): PublicSearchResult[] {
  const record = objectValue(payload);
  const rawResults = record?.results;
  if (!Array.isArray(rawResults)) return [];

  const unique = new Set<string>();
  const results: PublicSearchResult[] = [];
  for (const raw of rawResults) {
    const item = objectValue(raw);
    if (!item) continue;
    const url = stringField(item, ["url"], 2048);
    const safeUrl = safeSearchUrl(url);
    if (!safeUrl) continue;
    const normalized = safeUrl.toString();
    if (unique.has(normalized)) continue;
    unique.add(normalized);

    const publishedValue = stringField(
      item,
      ["published_at", "publishedAt", "date"],
      80,
    );
    results.push({
      title:
        stringField(item, ["title"], 240) || safeUrl.hostname,
      url: normalized,
      domain:
        stringField(item, ["domain"], 253) ||
        safeUrl.hostname.replace(/^www\./, ""),
      snippet: stringField(item, ["snippet", "description"], 1200),
      publishedAt: publishedValue || null,
    });
  }
  return results.slice(0, 8);
}

export async function searchPublicSources(query: string): Promise<SearchOutcome> {
  const key = apiKey();
  if (!key) {
    return {
      status: "not_configured",
      results: [],
      note: "Live web research is not configured. Rule-based checks still ran.",
    };
  }

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("query", query.slice(0, 500));
  url.searchParams.set(
    "intent",
    "Find public company and job-career sources to compare with a submitted job opportunity.",
  );
  url.searchParams.set("language", "en");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return {
      status: "unavailable",
      results: [],
      note: "TinyFish search could not be reached. Rule-based checks still ran.",
    };
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      results: [],
      note:
        response.status === 402
          ? "TinyFish search has reached its available usage allowance."
          : response.status === 429
            ? "TinyFish search is rate-limited. Try again later."
            : "TinyFish search is temporarily unavailable.",
    };
  }

  try {
    const payload = await readLimitedJson(response);
    return {
      status: "completed",
      results: parseSearchResults(payload),
      note: "Search results are public-source leads, not proof of company identity.",
    };
  } catch {
    return {
      status: "unavailable",
      results: [],
      note: "TinyFish returned an unreadable search response.",
    };
  }
}

function parseFetchedPages(payload: unknown): FetchedPage[] {
  const record = objectValue(payload);
  const rawPages = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.results)
      ? record.results
      : Array.isArray(record?.data)
        ? record.data
        : [];
  const pages: FetchedPage[] = [];

  for (const raw of rawPages) {
    const item = objectValue(raw);
    if (!item) continue;
    const urlValue = stringField(item, ["url", "final_url", "finalUrl"], 2048);
    const safeUrl = safeSearchUrl(urlValue);
    const text = stringField(
      item,
      ["text", "markdown", "content", "extracted_text"],
      12_000,
    );
    if (!safeUrl || !text) continue;
    pages.push({
      url: safeUrl.toString(),
      title:
        stringField(item, ["title", "page_title"], 240) ||
        safeUrl.hostname,
      text,
    });
  }
  return pages.slice(0, 5);
}

export async function fetchPublicPages(
  urls: string[],
  intent: string,
): Promise<FetchOutcome> {
  const key = apiKey();
  if (!key) {
    return {
      status: "not_configured",
      pages: [],
      note: "Live page retrieval is not configured.",
    };
  }

  const safeUrls: string[] = [];
  for (const rawUrl of urls.slice(0, 5)) {
    try {
      safeUrls.push((await assertPublicUrl(rawUrl)).toString());
    } catch {
      // Unsafe or unresolved URLs are never sent to the research provider.
    }
  }
  const urlsToFetch = safeUrls;
  if (urlsToFetch.length === 0) {
    return {
      status: "completed",
      pages: [],
      note: "No safe public source URLs were available to fetch.",
    };
  }

  let response: Response;
  try {
    response = await fetch(FETCH_ENDPOINT, {
      method: "POST",
      headers: {
        "X-API-Key": key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        urls: urlsToFetch,
        format: "markdown",
        links: false,
        image_links: false,
        per_url_timeout_ms: REQUEST_TIMEOUT_MS,
        intent: intent.slice(0, 500),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2),
    });
  } catch {
    return {
      status: "unavailable",
      pages: [],
      note: "TinyFish could not retrieve the selected public pages.",
    };
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      pages: [],
      note:
        response.status === 429
          ? "TinyFish page retrieval is rate-limited. Try again later."
          : "TinyFish page retrieval is temporarily unavailable.",
    };
  }

  try {
    const payload = await readLimitedJson(response);
    return {
      status: "completed",
      pages: parseFetchedPages(payload),
      note: "Retrieved pages are public-source observations, not identity verification.",
    };
  } catch {
    return {
      status: "unavailable",
      pages: [],
      note: "TinyFish returned an unreadable page response.",
    };
  }
}
