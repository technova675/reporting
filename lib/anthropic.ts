import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper around the Messages API.
 *
 * Everything the console asks Claude for is a research task that must come back
 * as a fixed JSON shape, so this module exposes exactly one entry point:
 * `researchJson`, which pairs the web search server tool with a JSON schema and
 * hands back a typed object.
 */

let client: Anthropic | null = null;

export function hasApiKey(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );
}

function getClient(): Anthropic {
  if (!client) {
    // Zero-arg constructor: resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
    // or an `ant auth login` profile, in that order.
    client = new Anthropic({ maxRetries: 3 });
  }
  return client;
}

export interface ResearchResult<T> {
  data: T;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  /** Every URL the web search tool actually surfaced, de-duplicated. */
  sources: string[];
}

export class AnthropicCallError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AnthropicCallError";
    this.status = status;
  }
}

interface ResearchOptions {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  model: string;
  maxSearches?: number;
  /** `low` keeps bulk lead research cheap; audits run higher. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export async function researchJson<T>({
  system,
  prompt,
  schema,
  model,
  maxSearches = 6,
  effort = "medium",
}: ResearchOptions): Promise<ResearchResult<T>> {
  const started = Date.now();
  const anthropic = getClient();

  let message;
  try {
    // Streaming: research turns with several web searches run long enough to
    // risk an HTTP timeout on a plain create().
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 8000,
      system,
      thinking: { type: "adaptive" },
      output_config: {
        effort,
        format: { type: "json_schema", schema },
      },
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: maxSearches,
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });
    message = await stream.finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AnthropicCallError(
        "Anthropic rejected the credentials. Check ANTHROPIC_API_KEY.",
        err.status,
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AnthropicCallError(
        "Rate limited by the Anthropic API — this job will be retried.",
        err.status,
      );
    }
    if (err instanceof Anthropic.APIError) {
      throw new AnthropicCallError(
        `Anthropic API error ${err.status}: ${err.message}`,
        err.status,
      );
    }
    throw new AnthropicCallError(
      err instanceof Error ? err.message : "Unknown error calling Anthropic",
    );
  }

  if (message.stop_reason === "refusal") {
    throw new AnthropicCallError(
      `Claude declined this research request (${message.stop_details?.category ?? "unspecified"}).`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new AnthropicCallError(
      "Response hit the token ceiling before the JSON was complete.",
    );
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return {
    data: parseJson<T>(text),
    tokensIn: message.usage.input_tokens,
    tokensOut: message.usage.output_tokens,
    durationMs: Date.now() - started,
    sources: collectSources(message.content),
  };
}

/**
 * With `output_config.format` set the body is already strict JSON, but a model
 * that runs server tools can still prefix a sentence, so fall back to the first
 * balanced object in the text rather than failing the whole job.
 */
function parseJson<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        /* fall through to the error below */
      }
    }
    throw new AnthropicCallError(
      "Claude returned a response that was not valid JSON.",
    );
  }
}

function collectSources(content: Anthropic.ContentBlock[]): string[] {
  const urls = new Set<string>();
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    // On an error the content is a single object rather than a list.
    if (!Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (result.type === "web_search_result" && result.url) {
        urls.add(result.url);
      }
    }
  }
  return [...urls];
}
