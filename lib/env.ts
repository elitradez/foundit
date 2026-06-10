import { ANTHROPIC_MODELS } from "@/lib/models";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_MODELS = new Set<string>(Object.values(ANTHROPIC_MODELS));

type ValidationResult = { ok: boolean; errors: string[] };

function validateEnv(): ValidationResult {
  const errors: string[] = [];

  // ANTHROPIC_API_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (!apiKey) {
    errors.push("ANTHROPIC_API_KEY is missing");
  } else if (!apiKey.startsWith("sk-ant-")) {
    errors.push(`ANTHROPIC_API_KEY does not look like an Anthropic key (expected prefix "sk-ant-")`);
  }

  // ANTHROPIC_MODEL — optional, but if set must be a known model ID
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (model !== undefined && model !== "") {
    if (!VALID_MODELS.has(model)) {
      errors.push(
        `ANTHROPIC_MODEL "${model}" is not a recognised model ID. ` +
        `Valid values: ${[...VALID_MODELS].join(", ")}. ` +
        `Tip: check for trailing whitespace or newlines (use printf '%s', not echo, when setting via CLI).`
      );
    }
  }

  // NEXT_PUBLIC_UNIVERSITY_ID
  const universityId = process.env.NEXT_PUBLIC_UNIVERSITY_ID?.trim() ?? "";
  if (!UUID_RE.test(universityId)) {
    errors.push("NEXT_PUBLIC_UNIVERSITY_ID is missing or not a valid UUID");
  }

  // SUPABASE
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  try {
    if (!supabaseUrl) throw new Error("empty");
    new URL(supabaseUrl);
  } catch {
    errors.push("NEXT_PUBLIC_SUPABASE_URL is missing or not a valid URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  // STAFF_SESSION_SECRET — signs staff session cookies; must be 32+ chars or
  // token minting/verification throws at request time.
  const staffSecret = process.env.STAFF_SESSION_SECRET?.trim() ?? "";
  if (!staffSecret) {
    errors.push("STAFF_SESSION_SECRET is missing (required to sign staff sessions)");
  } else if (staffSecret.length < 32) {
    errors.push("STAFF_SESSION_SECRET must be at least 32 characters");
  }

  // OPENAI_API_KEY — used for item embeddings and semantic search. Without it
  // search silently degrades and newly logged items never become searchable.
  if (!process.env.OPENAI_API_KEY?.trim()) {
    errors.push("OPENAI_API_KEY is missing (required for item embeddings / search)");
  }

  // TWILIO — TWILIO_AUTH_TOKEN is required for webhook signature verification
  if (!process.env.TWILIO_ACCOUNT_SID?.trim()) {
    errors.push("TWILIO_ACCOUNT_SID is missing");
  }
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) {
    errors.push("TWILIO_AUTH_TOKEN is missing (required for Twilio webhook signature verification)");
  }

  // ADMIN_API_SECRET — required in prod, warn in dev
  const adminSecret = process.env.ADMIN_API_SECRET?.trim() ?? "";
  if (!adminSecret) {
    errors.push("ADMIN_API_SECRET is missing");
  } else if (adminSecret.length < 32) {
    errors.push("ADMIN_API_SECRET must be at least 32 characters");
  }

  return { ok: errors.length === 0, errors };
}

export function checkEnv(): void {
  const isProd = process.env.NODE_ENV === "production";
  const { ok, errors } = validateEnv();
  if (ok) return;

  if (isProd) {
    throw new Error(
      `[env] Production startup failed — invalid environment:\n${errors.map((e) => `  • ${e}`).join("\n")}`
    );
  } else {
    for (const e of errors) {
      console.warn(`[env] WARNING: ${e}`);
    }
  }
}
