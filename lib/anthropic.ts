import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-5";
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
