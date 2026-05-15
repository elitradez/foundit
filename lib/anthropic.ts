import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { ANTHROPIC_MODELS, DEFAULT_MODELS, type AnthropicModel } from "@/lib/models";

const VALID_MODELS = new Set<string>(Object.values(ANTHROPIC_MODELS));

export function getAnthropicModel(purpose: keyof typeof DEFAULT_MODELS = "PHOTO_ANALYSIS"): AnthropicModel {
  const raw = process.env.ANTHROPIC_MODEL?.trim();
  if (raw) {
    if (!VALID_MODELS.has(raw)) {
      throw new Error(
        `ANTHROPIC_MODEL "${raw}" is not a recognised model ID. Valid values: ${[...VALID_MODELS].join(", ")}`
      );
    }
    return raw as AnthropicModel;
  }
  return DEFAULT_MODELS[purpose];
}

export function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey: key });
}

export function extractTextContent(message: Message): string {
  const parts = message.content;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
    .join("\n");
}

export function parseJsonFromModel(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw) as unknown;
}
