import { randomUUID } from "crypto";
import { after, NextResponse } from "next/server";
import { processNewItemAlerts } from "@/lib/alert-matching";
import { getStaffSession } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { hashPin } from "@/lib/pin";
import { parseValueTier } from "@/lib/value-tier";

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "photo";
}

export async function GET() {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, name, description, location, date_found, photo_path, returned_at, claim_description, pin_hash, pin_salt, created_at, value_tier",
    )
    .eq("department_id", session.department_id)
    .is("returned_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("photo");
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  const dateFound = String(form.get("date_found") ?? "").trim();
  const optionalPin = String(form.get("optional_pin") ?? "").trim();
  const valueTierRaw = String(form.get("value_tier") ?? "").trim();
  const value_tier = parseValueTier(valueTierRaw) ?? "low_value";

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing photo" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Photo must be under 10MB" }, { status: 400 });
  }
  if (!name || !description || !location || !dateFound) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFound)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const id = randomUUID();
  const photoPath = `${id}/${safeFilename(file.name)}`;
  const bytes = await file.arrayBuffer();
  const supabase = createAdminSupabaseClient();

  const { error: upErr } = await supabase.storage.from("items").upload(photoPath, bytes, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  let pin_hash: string | null = null;
  let pin_salt: string | null = null;
  if (optionalPin.length > 0) {
    if (optionalPin.length < 4 || optionalPin.length > 32) {
      return NextResponse.json({ error: "PIN must be 4–32 characters" }, { status: 400 });
    }
    const h = hashPin(optionalPin);
    pin_hash = h.pin_hash;
    pin_salt = h.pin_salt;
  }

  const { data, error } = await supabase
    .from("items")
    .insert({
      id,
      name,
      description,
      location,
      date_found: dateFound,
      photo_path: photoPath,
      pin_hash,
      pin_salt,
      value_tier,
      department_id: session.department_id,
      university_id: session.university_id,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from("items").remove([photoPath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  after(async () => {
    try {
      await processNewItemAlerts(supabase, description, location, session.university_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[processNewItemAlerts]", msg);
    }
  });

  after(async () => {
    const input = `${name}. ${description}`.trim();
    const itemId = data.id;

    async function fetchEmbedding(): Promise<number[] | null> {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input }),
      });
      const json = await res.json();
      const embedding = json?.data?.[0]?.embedding;
      return Array.isArray(embedding) ? embedding : null;
    }

    try {
      let embedding = await fetchEmbedding();
      if (!embedding) {
        await new Promise((r) => setTimeout(r, 2000));
        embedding = await fetchEmbedding();
      }
      if (embedding) {
        await supabase.from("items").update({ embedding }).eq("id", itemId);
      } else {
        console.error("[embedding] both attempts returned no vector for item:", itemId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[embedding] failed for item:", itemId, msg);
      // Retry once after 2s
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const embedding = await fetchEmbedding();
        if (embedding) {
          await supabase.from("items").update({ embedding }).eq("id", itemId);
        } else {
          console.error("[embedding] retry also returned no vector for item:", itemId);
        }
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.error("[embedding] retry failed for item:", itemId, retryMsg);
      }
    }
  });

  return NextResponse.json({ id: data.id });
}
