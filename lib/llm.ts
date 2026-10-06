import { fetchPage, webSearch, searchProviderName } from "./research/web";

/**
 * The model layer.
 *
 * Talks to any OpenAI-compatible chat endpoint — by default NVIDIA's hosted
 * Nemotron models (free API key from build.nvidia.com), but OpenRouter, Groq,
 * a local Ollama or a self-hosted NIM work by changing two env vars.
 *
 * Open models have no server-side web search, so research happens in two
 * phases:
 *
 *   1. Research — a tool loop where the model calls `web_search` and
 *      `fetch_page`, which this app executes itself (lib/research/web.ts).
 *   2. Format — a separate call that turns the notes and raw evidence into the
 *      fixed JSON shape, validated against the schema and repaired once.
 *
 * Splitting them matters: small open models are noticeably worse at tool use
 * and strict JSON in the same turn than at either one alone.
 */

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_MODEL =
  process.env.LLM_MODEL?.trim() || "nvidia/nemotron-3-super-120b-a12b";

function baseUrl(): string {
  return (process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function apiKey(): string | undefined {
  return (
    process.env.LLM_API_KEY?.trim() || process.env.NVIDIA_API_KEY?.trim() || undefined
  );
}

function isLocalEndpoint(): boolean {
  return /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/)/.test(baseUrl());
}

/** A local server (Ollama, LM Studio, a NIM container) needs no key. */
export function isLlmConfigured(): boolean {
  return Boolean(apiKey()) || isLocalEndpoint();
}

export function providerInfo(): { endpoint: string; search: string } {
  let endpoint = baseUrl();
  try {
    endpoint = new URL(baseUrl()).host;
  } catch {
    /* keep the raw value */
  }
  return { endpoint, search: searchProviderName() };
}

export class LlmCallError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmCallError";
    this.status = status;
  }
}

/** The caller's time budget ran out before the model answered. */
export class LlmDeadlineError extends LlmCallError {
  constructor() {
    super(
      `Ran out of time waiting on the model endpoint (${providerInfo().endpoint}).`,
    );
    this.name = "LlmDeadlineError";
  }
}

/* ------------------------------------------------------------------ */
/* Chat completions                                                    */
/* ------------------------------------------------------------------ */

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: ToolCall[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface Usage {
  tokensIn: number;
  tokensOut: number;
}

const REQUEST_TIMEOUT_MS = 180_000;
/** Time a single-pass researchJson holds back so the report still gets to run. */
const REPORT_RESERVE_MS = 120_000;

/**
 * One chat call, retried on transient failures. Never runs past `deadline`
 * (epoch ms): each request is cut off there and no retry starts after it.
 */
async function chat(
  body: Record<string, unknown>,
  usage: Usage,
  deadline: number,
): Promise<NonNullable<ChatResponse["choices"]>[number]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = apiKey();
  if (key) headers.Authorization = `Bearer ${key}`;

  // Free tiers rate-limit hard. Two short in-call retries save a whole job
  // attempt (and every search already done in it) on a single 429.
  for (let attempt = 0; ; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) throw new LlmDeadlineError();

    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, left)),
      });
    } catch (err) {
      if (Date.now() >= deadline) throw new LlmDeadlineError();
      if (attempt < 2) {
        await sleep(3000 * (attempt + 1), deadline);
        continue;
      }
      throw new LlmCallError(
        `Could not reach the model endpoint (${providerInfo().endpoint}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (res.ok) {
      // The timeout signal also covers the body, so a stalled stream lands here.
      const data = (await res.json().catch((err: unknown) => {
        if (Date.now() >= deadline) throw new LlmDeadlineError();
        throw err;
      })) as ChatResponse;
      usage.tokensIn += data.usage?.prompt_tokens ?? 0;
      usage.tokensOut += data.usage?.completion_tokens ?? 0;
      const choice = data.choices?.[0];
      if (!choice?.message) {
        throw new LlmCallError("The model returned an empty response.");
      }
      return choice;
    }

    const detail = (await res.text().catch(() => "")).slice(0, 300);
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < 2) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 30) * 1000
          : 4000 * (attempt + 1),
        deadline,
      );
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new LlmCallError(
        "The model endpoint rejected the credentials. Check LLM_API_KEY.",
        res.status,
      );
    }
    if (res.status === 429) {
      throw new LlmCallError(
        "Rate limited by the model provider — this job will be retried.",
        429,
      );
    }
    throw new LlmCallError(`Model API error ${res.status}: ${detail}`, res.status);
  }
}

/** Waits `ms`, but never past `deadline`. */
function sleep(ms: number, deadline: number): Promise<void> {
  const wait = Math.max(0, Math.min(ms, deadline - Date.now()));
  return new Promise((resolve) => setTimeout(resolve, wait));
}

/** Reasoning models inline their thinking; none of it belongs in the output. */
function visibleText(content: string | null | undefined): string {
  return (content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Research: tool loop                                                 */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the public web. Returns up to 6 results with title, URL and snippet.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_page",
      description:
        "Load one public web page and return its title, meta tags, headings, calls to action, detected tracking tags and a text excerpt.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
];

interface EvidenceEntry {
  label: string;
  text: string;
}

export interface Evidence {
  /** Pre-gathered observations, already rendered as text. */
  entries: EvidenceEntry[];
  sources: string[];
}

/** Models that errored on `tools` once are not offered them again. */
const noToolSupport = new Set<string>();

async function runToolLoop(
  model: string,
  system: string,
  prompt: string,
  seed: Evidence,
  maxToolCalls: number,
  usage: Usage,
  deadline: number,
  onProgress?: (message: string) => void,
): Promise<{ notes: string; gathered: Evidence }> {
  const gathered: Evidence = { entries: [], sources: [] };
  if (maxToolCalls <= 0 || noToolSupport.has(model)) {
    return { notes: "", gathered };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${system}

You are in the RESEARCH phase. Use the web_search and fetch_page tools to check what the evidence below does not already cover. You have a budget of ${maxToolCalls} tool calls — spend them on the gaps, not on re-fetching pages already provided. When you have enough, stop calling tools and write plain-text research notes: every observation, with the URL it came from. Record what you checked and found nothing for, too. Do not write the final JSON yet.`,
    },
    {
      role: "user",
      content: `${prompt}\n\n${renderEvidence(seed, 30_000)}`,
    },
  ];

  let used = 0;
  for (let round = 0; round < maxToolCalls + 2; round++) {
    const budgetLeft = maxToolCalls - used;
    let choice;
    try {
      choice = await chat(
        {
          model,
          messages,
          temperature: 0.2,
          max_tokens: 6000,
          ...(budgetLeft > 0 ? { tools: TOOLS, tool_choice: "auto" } : {}),
        },
        usage,
        deadline,
      );
    } catch (err) {
      // Out of research time: write the report from what was gathered so far.
      if (err instanceof LlmDeadlineError) return { notes: "", gathered };
      // Some models or providers reject `tools` outright. Fall back to the
      // pre-gathered evidence rather than failing the job.
      if (err instanceof LlmCallError && (err.status === 400 || err.status === 422)) {
        if (round === 0) noToolSupport.add(model);
        return { notes: "", gathered };
      }
      throw err;
    }

    const calls = choice.message?.tool_calls ?? [];
    if (calls.length === 0 || budgetLeft <= 0) {
      return { notes: visibleText(choice.message?.content), gathered };
    }

    messages.push({
      role: "assistant",
      content: choice.message?.content ?? null,
      tool_calls: calls,
    });

    for (const call of calls) {
      let output: string;
      if (used >= maxToolCalls) {
        output = "Tool budget exhausted. Write your research notes now.";
      } else if (Date.now() >= deadline) {
        // Each tool can take up to a minute; none may start once time is up.
        output = "Out of research time. Write your research notes now.";
      } else {
        used += 1;
        output = await executeTool(call, gathered, onProgress);
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: output });
    }

    if (used >= maxToolCalls) {
      messages.push({
        role: "user",
        content:
          "Tool budget used. Write your research notes now, with the URL for each observation.",
      });
    }
  }

  return { notes: "", gathered };
}

async function executeTool(
  call: ToolCall,
  gathered: Evidence,
  onProgress?: (message: string) => void,
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    return "Error: tool arguments were not valid JSON.";
  }

  if (call.function.name === "web_search") {
    const query = String(args.query ?? "").trim();
    if (!query) return "Error: query is required.";
    onProgress?.(`Searching: ${query}`);
    const result = await webSearch(query);
    gathered.entries.push({ label: `Search: ${query}`, text: result.text });
    gathered.sources.push(...result.urls);
    return result.text;
  }

  if (call.function.name === "fetch_page") {
    const url = String(args.url ?? "").trim();
    if (!url) return "Error: url is required.";
    onProgress?.(`Reading ${url}`);
    const page = await fetchPage(url);
    gathered.entries.push({ label: `Page: ${url}`, text: page.text });
    if (page.ok) gathered.sources.push(page.url);
    return page.text;
  }

  return `Error: unknown tool ${call.function.name}.`;
}

function renderEvidence(evidence: Evidence, budgetChars: number): string {
  if (evidence.entries.length === 0) return "EVIDENCE: none gathered.";
  const perEntry = Math.max(
    1200,
    Math.floor(budgetChars / Math.max(1, evidence.entries.length)),
  );
  const blocks = evidence.entries.map(
    (e) => `### ${e.label}\n${truncate(e.text, perEntry)}`,
  );
  return `EVIDENCE ALREADY GATHERED (observed by this system today):\n\n${blocks.join("\n\n")}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;
}

/* ------------------------------------------------------------------ */
/* Format: evidence → schema-valid JSON                                */
/* ------------------------------------------------------------------ */

type JsonMode = "json_schema" | "json_object" | "none";
/** The first JSON mode a model accepted, so later jobs skip the failed ones. */
const jsonModeFor = new Map<string, JsonMode>();

function jsonModeParams(mode: JsonMode, schema: Record<string, unknown>) {
  if (mode === "json_schema") {
    return {
      response_format: {
        type: "json_schema",
        json_schema: { name: "result", schema, strict: false },
      },
    };
  }
  if (mode === "json_object") return { response_format: { type: "json_object" } };
  return {};
}

async function formatJson<T>(
  model: string,
  system: string,
  userContent: string,
  schema: Record<string, unknown>,
  usage: Usage,
  deadline: number,
): Promise<T> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${system}

You are in the REPORT phase. Output a single JSON object and nothing else — no markdown fences, no commentary before or after. It must validate against this JSON Schema:
${JSON.stringify(schema)}`,
    },
    { role: "user", content: userContent },
  ];

  const modes: JsonMode[] = jsonModeFor.has(model)
    ? [jsonModeFor.get(model)!]
    : ["json_schema", "json_object", "none"];

  let raw = "";
  let lastError: unknown = null;
  for (const mode of modes) {
    try {
      const choice = await chat(
        {
          model,
          messages,
          temperature: 0.1,
          max_tokens: 12_000,
          ...jsonModeParams(mode, schema),
        },
        usage,
        deadline,
      );
      if (choice.finish_reason === "length") {
        throw new LlmCallError(
          "Response hit the token ceiling before the JSON was complete.",
        );
      }
      raw = visibleText(choice.message?.content);
      jsonModeFor.set(model, mode);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      // Only an unsupported parameter is worth trying the next mode for.
      const status = err instanceof LlmCallError ? err.status : undefined;
      if (status !== 400 && status !== 422) throw err;
    }
  }
  if (lastError) throw lastError;

  let parsed = parseJson(raw);
  let problems = parsed === undefined ? ["not valid JSON"] : validate(parsed, schema);

  // One repair turn. Open models usually get it right once told exactly what
  // is wrong; a second failure is a real problem worth a job retry.
  if (problems.length > 0) {
    messages.push(
      { role: "assistant", content: raw || "(empty)" },
      {
        role: "user",
        content: `That output does not match the schema: ${problems
          .slice(0, 12)
          .join("; ")}. Return the complete corrected JSON object only.`,
      },
    );
    const choice = await chat(
      {
        model,
        messages,
        temperature: 0,
        max_tokens: 12_000,
        ...jsonModeParams(jsonModeFor.get(model) ?? "none", schema),
      },
      usage,
      deadline,
    );
    const repaired = parseJson(visibleText(choice.message?.content));
    if (repaired !== undefined) {
      parsed = repaired;
      problems = validate(parsed, schema);
    }
  }

  if (parsed === undefined || typeof parsed !== "object" || parsed === null) {
    throw new LlmCallError("The model returned a response that was not valid JSON.");
  }
  // Minor schema drift (a missing optional-ish field, an extra key) is left to
  // each service's normalizer rather than failing a whole research pass.
  return parsed as T;
}

function parseJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return undefined;
  }
}

/** Just enough JSON Schema to catch what open models get wrong. */
function validate(value: unknown, schema: Record<string, unknown>, path = "$"): string[] {
  const problems: string[] = [];
  const type = schema.type as string | string[] | undefined;
  const types = Array.isArray(type) ? type : type ? [type] : [];

  const actual =
    value === null
      ? "null"
      : Array.isArray(value)
        ? "array"
        : Number.isInteger(value)
          ? "integer"
          : typeof value;
  const typeOk =
    types.length === 0 ||
    types.includes(actual) ||
    (actual === "integer" && types.includes("number"));
  if (!typeOk) return [`${path} should be ${types.join(" or ")}, got ${actual}`];

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    problems.push(`${path} must be one of ${schema.enum.join(", ")}`);
  }

  if (actual === "object" && value && schema.properties) {
    const obj = value as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in obj)) problems.push(`${path}.${key} is missing`);
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) problems.push(...validate(obj[key], sub, `${path}.${key}`));
    }
  }

  if (actual === "array") {
    const arr = value as unknown[];
    if (typeof schema.minItems === "number" && arr.length < schema.minItems) {
      problems.push(`${path} needs at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && arr.length > schema.maxItems) {
      problems.push(`${path} allows at most ${schema.maxItems} items`);
    }
    if (schema.items) {
      arr.forEach((item, i) =>
        problems.push(
          ...validate(item, schema.items as Record<string, unknown>, `${path}[${i}]`),
        ),
      );
    }
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export interface ResearchResult<T> {
  data: T;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  /** Every URL actually fetched or returned by a search, de-duplicated. */
  sources: string[];
}

/**
 * What the research phase hands the report phase. Plain JSON, so a job can
 * carry it from one function invocation to the next.
 */
export interface ResearchNotes {
  /** The evidence, already rendered and trimmed to fit the report prompt. */
  evidenceText: string;
  notes: string;
  sources: string[];
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

interface ResearchOptions {
  system: string;
  prompt: string;
  model: string;
  /** Tool calls the model may make on top of the pre-gathered evidence. */
  maxSearches?: number;
  /** Observations collected in code before the model is involved. */
  evidence?: Evidence;
  onProgress?: (message: string) => void;
  /**
   * Epoch ms the phase must finish by. Research stops calling the model and
   * starting tools there, and keeps what it gathered.
   */
  deadline?: number;
}

/** Phase one: the tool loop, ending in notes plus everything it observed. */
export async function research({
  system,
  prompt,
  model,
  maxSearches = 6,
  evidence = { entries: [], sources: [] },
  onProgress,
  deadline = Infinity,
}: ResearchOptions): Promise<ResearchNotes> {
  const started = Date.now();
  const usage: Usage = { tokensIn: 0, tokensOut: 0 };

  const { notes, gathered } = await runToolLoop(
    model,
    system,
    prompt,
    evidence,
    maxSearches,
    usage,
    deadline,
    onProgress,
  );

  const all: Evidence = {
    entries: [...evidence.entries, ...gathered.entries],
    sources: [...evidence.sources, ...gathered.sources],
  };
  return {
    evidenceText: renderEvidence(all, 45_000),
    notes: truncate(notes, 12_000),
    sources: [...new Set(all.sources)],
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    durationMs: Date.now() - started,
  };
}

interface ReportOptions {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  model: string;
  research: ResearchNotes;
  /** Epoch ms the report must be written by, or LlmDeadlineError is thrown. */
  deadline?: number;
}

/** Phase two: turns research notes into schema-valid JSON. */
export async function writeReport<T>({
  system,
  prompt,
  schema,
  model,
  research: done,
  deadline = Infinity,
}: ReportOptions): Promise<ResearchResult<T>> {
  const started = Date.now();
  const usage: Usage = { tokensIn: done.tokensIn, tokensOut: done.tokensOut };

  const data = await formatJson<T>(
    model,
    system,
    `${prompt}

${done.evidenceText}

${done.notes ? `RESEARCH NOTES:\n${done.notes}` : "RESEARCH NOTES: none beyond the evidence above."}

Base every claim on the evidence and notes above. Where they do not cover something, say it could not be verified — do not fill the gap from memory.`,
    schema,
    usage,
    deadline,
  );

  return {
    data,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    durationMs: done.durationMs + (Date.now() - started),
    sources: done.sources,
  };
}

/**
 * What a single-invocation pass may spend: under Vercel Hobby's 300s function
 * limit, with room left for the store writes around it.
 */
const SINGLE_PASS_BUDGET_MS = 250_000;

/** Both phases in one go, for jobs small enough to fit one invocation. */
export async function researchJson<T>({
  schema,
  deadline = Date.now() + SINGLE_PASS_BUDGET_MS,
  ...options
}: ResearchOptions & { schema: Record<string, unknown> }): Promise<ResearchResult<T>> {
  const done = await research({ ...options, deadline: deadline - REPORT_RESERVE_MS });
  options.onProgress?.("Writing the report");
  return writeReport<T>({ ...options, schema, research: done, deadline });
}
