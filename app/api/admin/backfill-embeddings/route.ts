import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const secret = req.headers.get("x-admin-secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized", got: secret, expected: process.env.ADMIN_SECRET ? "set" : "not set" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: items, error: fetchErr } = await supabase
    .from("items")
    .select("id, name, description, embedding")
    .limit(100);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message });

  const unembedded = (items ?? []).filter((item) => !item.embedding);

  if (unembedded.length === 0) {
    return NextResponse.json({ message: "no items to process", total_fetched: items?.length ?? 0 });
  }

  const results = { processed: 0, errors: [] as string[], total_fetched: items?.length ?? 0, to_process: unembedded.length };

  for (const item of unembedded) {
    try {
      const input = `${item.name}. ${item.description}`.trim();
      const embRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input }),
      });
      const embData = await embRes.json();
      if (!embRes.ok) {
        results.errors.push(`OpenAI error: ${JSON.stringify(embData)}`);
        continue;
      }
      const embedding = embData?.data?.[0]?.embedding;
      if (Array.isArray(embedding)) {
        const { error: updateErr } = await supabase.from("items").update({ embedding }).eq("id", item.id);
        if (updateErr) {
          results.errors.push(`Supabase update error for ${item.id}: ${updateErr.message}`);
        } else {
          results.processed++;
        }
      } else {
        results.errors.push(`No embedding returned for ${item.id}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      results.errors.push(`${item.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json(results);
}
