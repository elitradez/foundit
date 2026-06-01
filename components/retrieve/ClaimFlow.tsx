"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Field, TextArea, TextInput } from "@/components/retrieve/ui";
import { ItemPhoto } from "@/components/retrieve/ItemPhoto";
import { addClaim, useRetrieveData } from "@/lib/retrieve/store";
import { categoryByKey } from "@/lib/retrieve/config";
import { RETRIEVE_CONFIG } from "@/lib/retrieve/config";
import { T } from "@/lib/retrieve/tokens";
import { RetrieveStateNote, RetrieveSpinner } from "@/components/retrieve/StateViews";

/** Ordered, one-question-per-screen flow (Boomerang style). */
const STEPS = ["when", "describe", "photos", "fulfillment", "contact", "review"] as const;
type StepKey = (typeof STEPS)[number];

const WHEN_OPTIONS = ["Today", "Yesterday", "Earlier this week", "More than a week ago"];

export function ClaimFlow({ itemId }: { itemId: string | null }) {
  const { items, loading, error } = useRetrieveData();
  const item = useMemo(() => (itemId ? items.find((i) => i.id === itemId) : undefined), [items, itemId]);

  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // answers
  const [when, setWhen] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [fulfillment, setFulfillment] = useState<"pickup" | "ship" | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (error === "not-configured") return <RetrieveStateNote kind="config" />;
  if (!item) {
    if (loading) return <RetrieveSpinner label="Loading…" />;
    return <NoItem />;
  }

  const step: StepKey = STEPS[stepIdx];
  const contactValid = name.trim().length > 0 && contact.trim().length > 0;

  const canContinue: Record<StepKey, boolean> = {
    when: when !== null,
    describe: description.trim().length >= 10,
    photos: true,
    fulfillment: fulfillment !== null,
    contact: contactValid,
    review: true,
  };

  function next() {
    if (stepIdx < STEPS.length - 1) setStepIdx((i) => i + 1);
  }
  function back() {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }

  async function submit() {
    if (!item || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await addClaim({
        itemId: item.id,
        description: description.trim(),
        photos,
        contactName: name.trim(),
        contactValue: contact.trim(),
        fulfillment: fulfillment ?? "pickup",
      });
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't send your claim. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((p) => [...p, String(reader.result)]);
      reader.readAsDataURL(file);
    });
  }

  if (done) return <Confirmation itemName={item.name} fulfillment={fulfillment ?? "pickup"} />;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 20px 48px", minHeight: "calc(100vh - 57px)", display: "flex", flexDirection: "column" }}>
      <Progress idx={stepIdx} total={STEPS.length} />

      {/* Item context strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, border: `1px solid ${T.border}`, borderRadius: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
          <ItemPhoto category={item.category} photo={item.photo} aspectRatio="1 / 1" />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 15 }}>{item.name}</p>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: T.mutedForeground }}>{categoryByKey(item.category).label} · {item.location}</p>
        </div>
      </div>

      <div key={step} className="retrieve-fade-up" style={{ flex: 1 }}>
        {step === "when" ? (
          <Screen title="When did you lose it?" subtitle="A rough guess is fine — it helps staff confirm it's yours.">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {WHEN_OPTIONS.map((opt) => (
                <ChoiceRow key={opt} label={opt} selected={when === opt} onClick={() => { setWhen(opt); }} />
              ))}
            </div>
          </Screen>
        ) : null}

        {step === "describe" ? (
          <Screen title="Describe it in your own words" subtitle="Color, brand, contents, any marks — details only the owner would know.">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Sage green Hydro Flask, small dent near the base, mountain sticker on the front." autoFocus style={{ minHeight: 140 }} />
            <p style={{ fontSize: 13, color: description.trim().length >= 10 ? T.mutedForeground : T.primaryStrong, margin: "8px 0 0" }}>
              {description.trim().length >= 10 ? "Looks good." : "A sentence or two helps us match it."}
            </p>
          </Screen>
        ) : null}

        {step === "photos" ? (
          <Screen title="Add photos (optional)" subtitle="Have a picture of your item, or proof of purchase? Great. If not, skip ahead.">
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
            {photos.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={`Attached photo ${i + 1}`} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }} />
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            ) : null}
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <span aria-hidden>⬆</span> {photos.length > 0 ? "Add more photos" : "Add photos"}
            </Button>
          </Screen>
        ) : null}

        {step === "fulfillment" ? (
          <Screen title="How do you want it back?" subtitle="Pick it up at the club, or have it shipped to you.">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ChoiceRow label={`Pick up at ${RETRIEVE_CONFIG.pickupLocation}`} sub="Free · bring a photo ID" selected={fulfillment === "pickup"} onClick={() => setFulfillment("pickup")} />
              <ChoiceRow
                label="Ship it to me"
                sub="Shipping & payment — coming in a later pass"
                selected={fulfillment === "ship"}
                onClick={() => setFulfillment("ship")}
                badge="Soon"
              />
            </div>
            {fulfillment === "ship" ? (
              <div role="note" style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, border: `1px dashed ${T.border}`, backgroundColor: T.muted, fontSize: 13, color: T.mutedForeground }}>
                <strong style={{ color: T.foreground }}>Placeholder:</strong> shipping address, carrier selection, and payment will be wired up in a later pass. For now we&apos;ll record your shipping preference and staff will follow up.
              </div>
            ) : null}
          </Screen>
        ) : null}

        {step === "contact" ? (
          <Screen title="How can we reach you?" subtitle="We'll let you know as soon as your claim is approved.">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Your name" required htmlFor="claim-name">
                <TextInput id="claim-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
              </Field>
              <Field
                label="Email or phone"
                required
                htmlFor="claim-contact"
                error={touched && !contact.trim() ? "Add a way to reach you" : null}
              >
                <TextInput id="claim-contact" value={contact} onChange={(e) => setContact(e.target.value)} onBlur={() => setTouched(true)} placeholder="you@email.com or (555) 123-4567" autoComplete="email" />
              </Field>
            </div>
          </Screen>
        ) : null}

        {step === "review" ? (
          <Screen title="Quick review" subtitle="Make sure this looks right before you send it.">
            <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
              <ReviewRow k="Item" v={item.name} />
              <ReviewRow k="Lost" v={when ?? "—"} />
              <ReviewRow k="Description" v={description.trim()} />
              <ReviewRow k="Photos" v={photos.length ? `${photos.length} attached` : "None"} />
              <ReviewRow k="Return" v={fulfillment === "ship" ? "Ship to me (pending setup)" : `Pickup at ${RETRIEVE_CONFIG.pickupLocation}`} />
              <ReviewRow k="Contact" v={`${name.trim()} · ${contact.trim()}`} last />
            </dl>
          </Screen>
        ) : null}
      </div>

      {/* Footer nav */}
      <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center" }}>
        {stepIdx > 0 ? (
          <button type="button" onClick={back} style={{ flexShrink: 0, height: 56, padding: "0 18px", borderRadius: 16, border: `1px solid ${T.border}`, background: T.background, color: T.foreground, fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 16, cursor: "pointer" }}>
            ← Back
          </button>
        ) : null}
        {step === "review" ? (
          <Button onClick={() => void submit()} disabled={submitting}>{submitting ? "Sending…" : "Send claim"}</Button>
        ) : (
          <Button onClick={() => { if (step === "contact") setTouched(true); if (canContinue[step]) next(); }} disabled={!canContinue[step]}>
            {step === "photos" && photos.length === 0 ? "Skip" : "Continue"}
          </Button>
        )}
      </div>
      {submitError ? <p role="alert" style={{ margin: "12px 0 0", fontSize: 14, color: T.primaryStrong, fontWeight: 500, textAlign: "center" }}>{submitError}</p> : null}
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 8px" }}>{title}</h1>
      {subtitle ? <p style={{ color: T.mutedForeground, fontSize: 15, margin: "0 0 22px", lineHeight: 1.5 }}>{subtitle}</p> : null}
      {children}
    </div>
  );
}

function ChoiceRow({ label, sub, selected, onClick, badge }: { label: string; sub?: string; selected: boolean; onClick: () => void; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "16px 16px",
        borderRadius: 14,
        border: `1.5px solid ${selected ? T.primaryStrong : T.border}`,
        backgroundColor: selected ? "#FFF1E8" : T.background,
        cursor: "pointer",
        transition: "border-color .12s, background-color .12s",
      }}
    >
      <span style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, border: `2px solid ${selected ? T.primaryStrong : T.border}`, backgroundColor: selected ? T.primaryStrong : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13 }}>
        {selected ? "✓" : ""}
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontFamily: T.fontBody, fontWeight: 600, fontSize: 16, color: T.foreground }}>{label}</span>
        {sub ? <span style={{ display: "block", fontSize: 13, color: T.mutedForeground, marginTop: 2 }}>{sub}</span> : null}
      </span>
      {badge ? <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: T.primaryStrong, backgroundColor: "#FFF1E8", padding: "3px 8px", borderRadius: 999 }}>{badge}</span> : null}
    </button>
  );
}

function ReviewRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 14px", borderBottom: last ? "none" : `1px solid ${T.border}` }}>
      <dt style={{ flexShrink: 0, width: 96, fontSize: 13, fontWeight: 600, color: T.mutedForeground }}>{k}</dt>
      <dd style={{ margin: 0, flex: 1, fontSize: 14, color: T.foreground, wordBreak: "break-word" }}>{v}</dd>
    </div>
  );
}

function Progress({ idx, total }: { idx: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6, margin: "4px 0 20px" }} aria-label={`Step ${idx + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: i <= idx ? T.primaryStrong : T.border, transition: "background-color .2s" }} />
      ))}
    </div>
  );
}

function Confirmation({ itemName, fulfillment }: { itemName: string; fulfillment: "pickup" | "ship" }) {
  return (
    <div className="retrieve-fade-up" style={{ maxWidth: 480, margin: "0 auto", padding: "56px 20px", textAlign: "center" }}>
      <div style={{ width: 76, height: 76, borderRadius: 999, backgroundColor: "#E8F6EC", color: "#1B7A3D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, margin: "0 auto 20px" }}>✓</div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 10px" }}>Claim sent</h1>
      <p style={{ color: T.mutedForeground, fontSize: 16, lineHeight: 1.55, margin: "0 0 8px" }}>
        We&apos;ve recorded your claim for <strong style={{ color: T.foreground }}>{itemName}</strong>. Staff will review it and reach out to confirm.
      </p>
      <p style={{ color: T.mutedForeground, fontSize: 15, lineHeight: 1.55, margin: "0 0 32px" }}>
        {fulfillment === "ship"
          ? "You chose shipping — we'll follow up to arrange address & payment (coming in a later pass)."
          : `Bring a photo ID to ${RETRIEVE_CONFIG.pickupLocation} to pick it up.`}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Link href="/retrieve/search" style={{ textDecoration: "none" }}><Button>Back to search</Button></Link>
      </div>
    </div>
  );
}

function NoItem() {
  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "72px 20px", textAlign: "center" }}>
      <p style={{ fontSize: 44, margin: "0 0 12px" }}>🔍</p>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Pick an item first</h1>
      <p style={{ color: T.mutedForeground, fontSize: 15, margin: "0 0 24px" }}>Find your item in search, then start a claim from there.</p>
      <Link href="/retrieve/search" style={{ textDecoration: "none" }}><Button>Search lost items</Button></Link>
    </div>
  );
}
