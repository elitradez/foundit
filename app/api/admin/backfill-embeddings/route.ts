import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const secret = req.headers.get("x-admin-secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: items } = await supabase
    .from("items")
    .select("id, name, description, embedding")
    .limit(100);

  const unembedded = (items ?? []).filter((item) => !item.embedding);

  const results = { processed: 0, errors: [] as string[] };

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
      const embedding = embData?.data?.[0]?.embedding;
      if (Array.isArray(embedding)) {
        await supabase.from("items").update({ embedding }).eq("id", item.id);
        results.processed++;
      }
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      results.errors.push(`${item.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json(results);
}
