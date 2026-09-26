import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * The research tools the model can call, executed by this app.
 *
 * `fetchPage` reads a public page and reduces it to the signals a marketing
 * audit cares about (meta tags, headings, CTAs, tracking tags). `webSearch`
 * uses a keyed provider when one is configured and falls back to DuckDuckGo's
 * HTML endpoint, which needs no key.
 *
 * Both take URLs that ultimately come from the public audit form, so every
 * fetch is resolved and checked against private address ranges first.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;

/* ------------------------------------------------------------------ */
/* Safe fetch                                                          */
/* ------------------------------------------------------------------ */

export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80")
  );
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$/i.test(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("refusing to fetch a local address");
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("refusing to fetch a private network address");
  }
}

interface FetchedText {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

/** GET with redirects followed by hand, so every hop is address-checked. */
export async function safeGet(rawUrl: string, init: RequestInit = {}): Promise<FetchedText> {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("only http and https URLs can be fetched");
    }
    await assertPublicHost(parsed.hostname);

    const res = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      continue;
    }

    return {
      url,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body: await readCapped(res),
    };
  }
  throw new Error("too many redirects");
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

/* ------------------------------------------------------------------ */
/* Page reading                                                        */
/* ------------------------------------------------------------------ */

const TRACKERS: [string, RegExp][] = [
  ["Google Analytics 4 / gtag", /gtag\(|googletagmanager\.com\/gtag\/js|G-[A-Z0-9]{6,}/],
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
  ["Google Ads conversion tag", /AW-\d{6,}|googleadservices\.com/],
  ["Meta Pixel", /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(/],
  ["TikTok Pixel", /analytics\.tiktok\.com|ttq\.load/],
  ["LinkedIn Insight Tag", /snap\.licdn\.com|_linkedin_partner_id/],
  ["Snap Pixel", /sc-static\.net\/scevent|snaptr\(/],
  ["Pinterest Tag", /pintrk\(|s\.pinimg\.com\/ct/],
  ["Microsoft Clarity", /clarity\.ms/],
  ["Hotjar", /static\.hotjar\.com|hj\(/],
  ["Microsoft / Bing UET", /bat\.bing\.com/],
  ["Klaviyo", /klaviyo\.com/],
  ["HubSpot", /js\.hs-scripts\.com|hs-analytics/],
  ["Shopify", /cdn\.shopify\.com|Shopify\.theme/],
  ["WordPress", /wp-content\//],
  ["Wix", /static\.wixstatic\.com/],
  ["Webflow", /webflow\.js|assets\.website-files\.com/],
  ["WhatsApp chat link", /wa\.me\/|api\.whatsapp\.com/],
];

const SOCIAL_HOSTS =
  /(instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|twitter\.com|x\.com|pinterest\.com|threads\.net)/i;

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " "));
}

function meta(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]*>|<meta[^>]+content=["'][^"']*["'][^>]+${attr}=["']${key}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : null;
}

function all(html: string, re: RegExp, limit: number): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const text = stripTags(m[1] ?? "");
    if (text && !out.includes(text)) out.push(text.slice(0, 140));
    if (out.length >= limit) break;
  }
  return out;
}

export interface PageSummary {
  ok: boolean;
  url: string;
  /** Rendered for the model. */
  text: string;
  internalLinks: string[];
  socialLinks: string[];
}

export async function fetchPage(rawUrl: string): Promise<PageSummary> {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return { ok: false, url: rawUrl, text: `Not a valid URL: ${rawUrl}`, internalLinks: [], socialLinks: [] };
  }

  let page: FetchedText;
  try {
    page = await safeGet(url);
  } catch (err) {
    return {
      ok: false,
      url,
      text: `Could not load ${url}: ${err instanceof Error ? err.message : String(err)}`,
      internalLinks: [],
      socialLinks: [],
    };
  }

  if (page.status >= 400) {
    return {
      ok: false,
      url: page.url,
      text: `${page.url} returned HTTP ${page.status}. It may block automated visitors; treat the page as unverified rather than broken.`,
      internalLinks: [],
      socialLinks: [],
    };
  }

  const html = page.body;
  if (!/html|xml/i.test(page.contentType) && !/<html|<body/i.test(html)) {
    return {
      ok: true,
      url: page.url,
      text: `${page.url} (${page.contentType || "unknown type"}):\n${html.slice(0, 3000)}`,
      internalLinks: [],
      socialLinks: [],
    };
  }

  const origin = new URL(page.url);
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = meta(html, "name", "description");
  const ogTitle = meta(html, "property", "og:title");
  const ogImage = meta(html, "property", "og:image");
  const robots = meta(html, "name", "robots");
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];
  const lang = html.match(/<html[^>]*\slang=["']([^"']+)["']/i)?.[1];

  const h1 = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi, 6);
  const h2 = all(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi, 10);
  const buttons = all(html, /<button[^>]*>([\s\S]*?)<\/button>/gi, 12);
  const ctaLinks = all(
    html,
    /<a[^>]+class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    12,
  );

  const forms = (html.match(/<form\b/gi) ?? []).length;
  const emailInputs = (html.match(/<input[^>]+type=["']email["']/gi) ?? []).length;
  const telInputs = (html.match(/<input[^>]+type=["']tel["']/gi) ?? []).length;
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = images.filter((img) => !/\salt=["'][^"']+["']/i.test(img)).length;
  const schemaTypes = [
    ...new Set(
      [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]).slice(0, 20),
    ),
  ];
  const trackers = TRACKERS.filter(([, re]) => re.test(html)).map(([name]) => name);

  const internal = new Set<string>();
  const social = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const link = new URL(m[1], origin);
      if (link.protocol !== "http:" && link.protocol !== "https:") continue;
      if (SOCIAL_HOSTS.test(link.hostname)) {
        social.add(link.toString().replace(/\?.*$/, ""));
      } else if (link.hostname === origin.hostname) {
        link.hash = "";
        internal.add(link.toString());
      }
    } catch {
      /* ignore malformed hrefs */
    }
  }

  const bodyText = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " "),
  );
  const words = bodyText ? bodyText.split(" ").length : 0;

  const lines = [
    `URL: ${page.url} (HTTP ${page.status})`,
    `Title: ${title || "(none)"}`,
    `Meta description: ${description ?? "(none)"}`,
    `Canonical: ${canonical ?? "(none)"} · lang: ${lang ?? "(none)"} · viewport meta: ${hasViewport ? "yes" : "no"}${robots ? ` · robots: ${robots}` : ""}`,
    `Open Graph: title ${ogTitle ? `"${ogTitle}"` : "missing"}, image ${ogImage ? "present" : "missing"}`,
    `H1 (${h1.length}): ${h1.join(" | ") || "(none)"}`,
    `H2: ${h2.join(" | ") || "(none)"}`,
    `Buttons / CTAs: ${[...buttons, ...ctaLinks].slice(0, 14).join(" | ") || "(none found in HTML)"}`,
    `Forms: ${forms} · email inputs: ${emailInputs} · phone inputs: ${telInputs}`,
    `Images: ${images.length}, ${missingAlt} without alt text`,
    `Structured data types: ${schemaTypes.join(", ") || "(none)"}`,
    `Tracking / platform tags detected in HTML: ${trackers.join(", ") || "none detected"}`,
    `Social links on page: ${[...social].slice(0, 10).join(", ") || "(none)"}`,
    `Internal links: ${internal.size}`,
    `Visible text: ${words} words`,
    words < 80
      ? "Note: very little server-rendered text — the page may render client-side, so headings and CTAs above can be incomplete."
      : "",
    `Text excerpt: ${bodyText.slice(0, 2200)}`,
  ].filter(Boolean);

  return {
    ok: true,
    url: page.url,
    text: lines.join("\n"),
    internalLinks: [...internal],
    socialLinks: [...social],
  };
}

/** robots.txt + sitemap.xml presence, for the SEO category. */
export async function crawlBasics(rawUrl: string): Promise<string> {
  const url = normalizeUrl(rawUrl);
  if (!url) return "Could not check robots.txt or sitemap: invalid URL.";
  const origin = new URL(url).origin;
  const out: string[] = [];

  let sitemapUrl = `${origin}/sitemap.xml`;
  try {
    const robots = await safeGet(`${origin}/robots.txt`);
    if (robots.status < 400 && /user-agent|disallow|sitemap/i.test(robots.body)) {
      const declared = robots.body.match(/^sitemap:\s*(\S+)/im)?.[1];
      if (declared) sitemapUrl = declared;
      out.push(
        `robots.txt: present${declared ? `, declares sitemap ${declared}` : ", no sitemap declared"}${
          /disallow:\s*\/\s*$/im.test(robots.body) ? " — WARNING: contains 'Disallow: /'" : ""
        }`,
      );
    } else {
      out.push(`robots.txt: not found (HTTP ${robots.status})`);
    }
  } catch (err) {
    out.push(`robots.txt: could not check (${err instanceof Error ? err.message : err})`);
  }

  try {
    const sitemap = await safeGet(sitemapUrl);
    if (sitemap.status < 400 && /<urlset|<sitemapindex/i.test(sitemap.body)) {
      const urls = (sitemap.body.match(/<loc>/gi) ?? []).length;
      const isIndex = /<sitemapindex/i.test(sitemap.body);
      out.push(
        `Sitemap: present at ${sitemap.url} (${isIndex ? `index of ${urls} sitemaps` : `${urls} URLs`})`,
      );
    } else {
      out.push(`Sitemap: not found at ${sitemapUrl} (HTTP ${sitemap.status})`);
    }
  } catch (err) {
    out.push(`Sitemap: could not check (${err instanceof Error ? err.message : err})`);
  }

  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function apifyToken(): string | undefined {
  return process.env.APIFY_API_TOKEN?.trim() || process.env.APIFY_TOKEN?.trim() || undefined;
}

export function searchProviderName(): string {
  if (apifyToken()) return "Apify Google Search";
  if (process.env.TAVILY_API_KEY) return "Tavily";
  if (process.env.SEARXNG_URL) return "SearXNG";
  return "DuckDuckGo (no key)";
}

export async function webSearch(
  query: string,
): Promise<{ text: string; urls: string[] }> {
  let hits: SearchHit[];
  try {
    hits = await search(query);
  } catch (err) {
    return {
      text: `Search for "${query}" failed (${err instanceof Error ? err.message : err}). Treat this as unverified, not as "nothing exists".`,
      urls: [],
    };
  }
  if (hits.length === 0) {
    return { text: `Search for "${query}" returned no results.`, urls: [] };
  }
  return {
    text: hits
      .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)
      .join("\n"),
    urls: hits.map((h) => h.url),
  };
}

async function search(query: string): Promise<SearchHit[]> {
  const token = apifyToken();
  if (token) return apifyGoogleSearch(query, token);

  // Generous enough to cover waiting behind other DuckDuckGo queries.
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS * 3);

  if (process.env.TAVILY_API_KEY) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results: 6 }),
      signal,
    });
    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
    const data = (await res.json()) as {
      results?: { title: string; url: string; content: string }[];
    };
    return (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 300) ?? "",
    }));
  }

  if (process.env.SEARXNG_URL) {
    const base = process.env.SEARXNG_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/search?format=json&q=${encodeURIComponent(query)}`, {
      signal,
    });
    if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
    const data = (await res.json()) as {
      results?: { title: string; url: string; content?: string }[];
    };
    return (data.results ?? []).slice(0, 6).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content ?? "",
    }));
  }

  return duckDuckGo(query, signal);
}

/**
 * Apify's Google Search Results Scraper, run synchronously. Each call starts
 * an actor run, so it is slower than a plain search API (typically 5-20s)
 * but returns real Google results. Billed per results page from Apify's
 * monthly credit — about half a cent per search on the free plan.
 */
const APIFY_ACTOR = process.env.APIFY_SEARCH_ACTOR?.trim() || "apify~google-search-scraper";
const APIFY_TIMEOUT_MS = 120_000;

async function apifyGoogleSearch(query: string, token: string): Promise<SearchHit[]> {
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?timeout=100`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      queries: query,
      maxPagesPerQuery: 1,
      ...(process.env.APIFY_SEARCH_COUNTRY
        ? { countryCode: process.env.APIFY_SEARCH_COUNTRY.trim().toLowerCase() }
        : {}),
      mobileResults: false,
      saveHtml: false,
      includeIcons: false,
    }),
    signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = detail.slice(0, 200);
    try {
      message = (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      /* not JSON */
    }
    if (res.status === 401) throw new Error("Apify rejected APIFY_API_TOKEN");
    if (res.status === 402) throw new Error("Apify credit is used up for this month");
    throw new Error(`Apify HTTP ${res.status}: ${message}`);
  }

  const items = (await res.json()) as {
    organicResults?: { title?: string; url?: string; description?: string }[];
  }[];
  return (Array.isArray(items) ? items : [])
    .flatMap((item) => item.organicResults ?? [])
    .filter((r) => r.url)
    .slice(0, 6)
    .map((r) => ({
      title: r.title ?? r.url!,
      url: r.url!,
      snippet: r.description ?? "",
    }));
}

/**
 * DuckDuckGo starts refusing a server after a handful of back-to-back queries,
 * so queries go out one at a time with a gap, and a refusal gets one slower
 * retry before it is reported.
 */
const DDG_GAP_MS = 1800;
let ddgChain: Promise<unknown> = Promise.resolve();
let ddgLast = 0;

function duckDuckGo(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const run = ddgChain.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = ddgLast + DDG_GAP_MS * (attempt + 1) - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      ddgLast = Date.now();
      try {
        return await duckDuckGoOnce(query, signal);
      } catch (err) {
        if (attempt >= 1 || signal.aborted) throw err;
      }
    }
  });
  ddgChain = run.catch(() => undefined);
  return run;
}

async function duckDuckGoOnce(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ q: query }).toString(),
    signal,
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();
  if (/anomaly|captcha/i.test(html) && !/result__a/.test(html)) {
    throw new Error("DuckDuckGo is rate limiting this server — configure a search API key");
  }

  const hits: SearchHit[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*result results_links/).slice(1);
  for (const block of blocks) {
    const link = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    let url = decode(link[1]);
    const redirect = url.match(/[?&]uddg=([^&]+)/);
    if (redirect) url = decodeURIComponent(redirect[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    if (/duckduckgo\.com\/y\.js/.test(url)) continue; // sponsored result
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    hits.push({ title: stripTags(link[2]), url, snippet: stripTags(snippet) });
    if (hits.length >= 6) break;
  }
  return hits;
}
