export const ANTHROPIC_MODELS = {
  OPUS_4_7: "claude-opus-4-7",
  OPUS_4_6: "claude-opus-4-6",
  SONNET_4_6: "claude-sonnet-4-6",
  HAIKU_4_5: "claude-haiku-4-5-20251001",
} as const;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[keyof typeof ANTHROPIC_MODELS];

export const DEFAULT_MODELS = {
  PHOTO_ANALYSIS: ANTHROPIC_MODELS.SONNET_4_6,
  SEMANTIC_SEARCH: ANTHROPIC_MODELS.HAIKU_4_5,
} as const;
