/**
 * Anthropic AI Client — Singleton wrapper for the Anthropic SDK.
 *
 * Provides structured completion, streaming, and JSON extraction.
 * Gracefully degrades when no API key is set — Memoire works
 * as a Claude Code tool without it, but gets stronger with it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "../engine/logger.js";
import { TokenTracker } from "./token-tracker.js";
import { getModelId, getMaxOutput } from "./model-config.js";
import type { AIResponse, AICompletionOptions, ModelTier, TokenUsage } from "./types.js";

const log = createLogger("ai");

let instance: AnthropicClient | null = null;

export class AnthropicClient {
  private sdk: Anthropic;
  readonly tracker: TokenTracker;

  constructor(apiKey: string) {
    this.sdk = new Anthropic({ apiKey });
    this.tracker = new TokenTracker();
    log.info("Anthropic AI client initialized");
  }

  async complete(opts: AICompletionOptions): Promise<AIResponse> {
    const tier: ModelTier = opts.model || "fast";
    const modelId = getModelId(tier);
    const maxTokens = opts.maxTokens || getMaxOutput(tier);

    const response = await this.sdk.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      temperature: opts.temperature ?? 0.3,
      system: opts.system,
      messages: opts.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    const content = response.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("");

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    this.tracker.record(usage, tier, modelId);

    return {
      content,
      model: modelId,
      usage,
      stopReason: response.stop_reason || "end_turn",
    };
  }

  async *stream(opts: AICompletionOptions): AsyncGenerator<string, AIResponse> {
    const tier: ModelTier = opts.model || "fast";
    const modelId = getModelId(tier);
    const maxTokens = opts.maxTokens || getMaxOutput(tier);

    const stream = this.sdk.messages.stream({
      model: modelId,
      max_tokens: maxTokens,
      temperature: opts.temperature ?? 0.3,
      system: opts.system,
      messages: opts.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    let fullContent = "";

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullContent += event.delta.text;
        yield event.delta.text;
      }
    }

    const finalMessage = await stream.finalMessage();
    const usage: TokenUsage = {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };

    this.tracker.record(usage, tier, modelId);

    return {
      content: fullContent,
      model: modelId,
      usage,
      stopReason: finalMessage.stop_reason || "end_turn",
    };
  }

  async completeJSON<T = unknown>(
    opts: AICompletionOptions & { schema?: import("zod").ZodSchema<T> }
  ): Promise<T> {
    const systemWithJSON = (opts.system || "") + "\n\nIMPORTANT: Return your response as valid JSON. No markdown fencing, no explanation — just the JSON object.";

    const response = await this.complete({
      ...opts,
      system: systemWithJSON,
    });

    let parsed: unknown;
    try {
      parsed = parseJSONFromResponse(response.content);
    } catch {
      log.warn("JSON parse failed, retrying with error context");
      const retry = await this.complete({
        ...opts,
        system: systemWithJSON,
        messages: [
          ...opts.messages,
          { role: "assistant", content: response.content },
          { role: "user", content: "That was not valid JSON. Please return ONLY valid JSON with no markdown fencing." },
        ],
      });
      parsed = parseJSONFromResponse(retry.content);
    }

    if (opts.schema) {
      return opts.schema.parse(parsed) as T;
    }
    return parsed as T;
  }
}

function parseJSONFromResponse(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch?.[1]) {
      return JSON.parse(fenceMatch[1].trim());
    }
    const objMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch?.[1]) {
      return JSON.parse(objMatch[1]);
    }
    throw new Error(`Could not extract JSON from response: ${trimmed.slice(0, 200)}...`);
  }
}

export function getAI(): AnthropicClient | null {
  if (instance) return instance;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  instance = new AnthropicClient(key);
  return instance;
}

export function hasAI(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getTracker(): TokenTracker | null {
  return instance?.tracker || null;
}
