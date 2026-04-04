import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractTextContent,
  getAnthropicClient,
  getAnthropicModel,
  parseJsonFromModel,
} from "@/lib/anthropic";
import { hasTwilioConfig, sendSms } from "@/lib/twilio";
import { getUniversityConfig } from "@/lib/university-config";

type UnnotifiedAlert = {
  id: string;
  phone: string;
  description: string;
};

function parseScorePayload(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const score = (raw as { score?: unknown }).score;
  const n = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function scoreLostItemMatch(
  newItemDescription: string,
  alertDescription: string,
): Promise<number> {
  const client = getAnthropicClient();
  const model = getAnthropicModel();
  const userText = `Compare these two lost item descriptions. Return JSON with one field: score (0-100) for how likely they are the same item. Be generous — matching category scores 50, matching color or brand scores 70, matching multiple details scores 90.

Newly logged item description:
${newItemDescription}

Student alert description:
${alertDescription}`;

  const message = await client.messages.create({
    model,
    max_tokens: 256,
    messages: [{ role: "user", content: userText }],
  });
  const text = extractTextContent(message);
  let parsed: unknown;
  try {
    parsed = parseJsonFromModel(text);
  } catch {
    return 0;
  }
  return parseScorePayload(parsed) ?? 0;
}

const SMS_BODY = (location: string) =>
  `Foundit: An item matching your description was just logged at ${location}. Visit ${getUniversityConfig().siteUrl} to search and claim it.`;

/**
 * After a new item is saved, notify matching unnotified SMS alerts within the same university.
 * Errors are logged; does not throw (safe to fire-and-forget).
 */
export async function processNewItemAlerts(
  supabase: SupabaseClient,
  itemDescription: string,
  location: string,
  universityId: string,
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return;
  }
  if (!hasTwilioConfig()) {
    return;
  }

  const { data: rows, error } = await supabase
    .from("alerts")
    .select("id, phone, description")
    .eq("notified", false)
    .eq("university_id", universityId);

  if (error) {
    console.error("[alerts] fetch unnotified:", error.message);
    return;
  }

  const alerts = (rows ?? []) as UnnotifiedAlert[];
  for (const alert of alerts) {
    let score: number;
    try {
      score = await scoreLostItemMatch(itemDescription, alert.description);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[alerts] anthropic match failed:", msg);
      continue;
    }
    if (score < 60) continue;

    try {
      await sendSms(alert.phone, SMS_BODY(location));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[alerts] twilio send failed:", msg);
      continue;
    }

    const { error: upErr } = await supabase.from("alerts").update({ notified: true }).eq("id", alert.id);
    if (upErr) {
      console.error("[alerts] mark notified:", upErr.message);
    }
  }
}
