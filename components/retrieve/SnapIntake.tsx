"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Field, Select, TextArea, TextInput } from "@/components/retrieve/ui";
import { ItemPhoto } from "@/components/retrieve/ItemPhoto";
import { RETRIEVE_CATEGORIES, RETRIEVE_LOCATIONS, type CategoryKey } from "@/lib/retrieve/config";
import { addItem } from "@/lib/retrieve/store";
import { T } from "@/lib/retrieve/tokens";

type Step = "capture" | "details" | "done";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SnapIntake() {
  const [step, setStep] = useState<Step>("capture");
  const [photo, setPhoto] = useState<string | null>(null);

  // details
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategoryKey>("other");
  const [location, setLocation] = useState(RETRIEVE_LOCATIONS[0]);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [savedName, setSavedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Photo auto-fill (AI vision). Never blocks the intake — on any failure the
  // staffer just fills the form by hand.
  const [analyzing, setAnalyzing] = useState(false);
  const [aiPrefilled, setAiPrefilled] = useState(false);

  // Prefill only fields the staffer hasn't already touched (functional updates
  // read the latest value), so a slow AI response can never clobber typing.
  const analyzePhoto = useCallback(async (dataUrl: string) => {
    setAnalyzing(true);
    setAiPrefilled(false);
    try {
      const res = await fetch("/retrieve/api/staff/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: dataUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        name?: string;
        category?: CategoryKey | "";
        notes?: string;
      };
      let applied = false;
      const suggestedName = data.name?.trim();
      const suggestedNotes = data.notes?.trim();
      const suggestedCategory = data.category;
      if (suggestedName) {
        setName((prev) => {
          if (prev.trim()) return prev;
          applied = true;
          return suggestedName;
        });
      }
      if (suggestedCategory) {
        setCategory((prev) => {
          if (prev !== "other") return prev;
          applied = true;
          return suggestedCategory as CategoryKey;
        });
      }
      if (suggestedNotes) {
        setNotes((prev) => {
          if (prev.trim()) return prev;
          applied = true;
          return suggestedNotes;
        });
      }
      setAiPrefilled(applied);
    } catch {
      // swallow — manual entry still works
    } finally {
      setAnalyzing(false);
    }
  }, []);

  function reset() {
    setPhoto(null);
    setName("");
    setCategory("other");
    setLocation(RETRIEVE_LOCATIONS[0]);
    setDate(todayISO());
    setNotes("");
    setError(null);
    setAnalyzing(false);
    setAiPrefilled(false);
    setStep("capture");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addItem({ name: name.trim(), category, location, dateFound: date, notes: notes.trim(), photo });
      setSavedName(name.trim());
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "20px 20px 64px" }}>
      <Stepper step={step} />

      {step === "capture" ? (
        <CaptureStep
          onCaptured={(p) => { setPhoto(p); setStep("details"); void analyzePhoto(p); }}
          onSkip={() => { setPhoto(null); setStep("details"); }}
        />
      ) : null}

      {step === "details" ? (
        <form onSubmit={handleSubmit} className="retrieve-fade-up" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Captured preview */}
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ width: 92, flexShrink: 0, borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}` }}>
              <ItemPhoto category={category} photo={photo} aspectRatio="1 / 1" reveal />
            </div>
            <div>
              <p style={{ margin: "0 0 4px", fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 16 }}>
                {photo ? "Photo captured" : "No photo"}
              </p>
              <button type="button" onClick={() => setStep("capture")} style={{ background: "none", border: "none", color: T.primaryStrong, fontWeight: 600, fontSize: 14, cursor: "pointer", padding: 0 }}>
                {photo ? "Retake" : "Add a photo"}
              </button>
              {analyzing ? (
                <p style={{ margin: "6px 0 0", fontSize: 13, color: T.mutedForeground }}>
                  <span aria-hidden>✨</span> Reading the photo…
                </p>
              ) : aiPrefilled ? (
                <p style={{ margin: "6px 0 0", fontSize: 13, color: T.primaryStrong, fontWeight: 500 }}>
                  <span aria-hidden>✨</span> Prefilled from photo — edit anything
                </p>
              ) : null}
            </div>
          </div>

          <Field label="What is it?" required htmlFor="snap-name">
            <TextInput id="snap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Black AirPods Pro case" autoFocus />
          </Field>

          <Field label="Category" htmlFor="snap-category" hint="ID, wallet and phone photos are blurred for members.">
            <Select id="snap-category" value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)}>
              {RETRIEVE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.icon}  {c.label}{c.sensitive ? "  (blurred)" : ""}</option>
              ))}
            </Select>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Where found" htmlFor="snap-location">
              <Select id="snap-location" value={location} onChange={(e) => setLocation(e.target.value)}>
                {RETRIEVE_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Date found" htmlFor="snap-date">
              <TextInput id="snap-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="snap-notes" hint="Anything that helps match it to an owner (optional).">
            <TextArea id="snap-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Color, brand, distinguishing marks, what's inside…" />
          </Field>

          <Button type="submit" disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save to lost & found"}
          </Button>
          {error ? <p role="alert" style={{ margin: 0, fontSize: 14, color: T.primaryStrong, fontWeight: 500 }}>{error}</p> : null}
        </form>
      ) : null}

      {step === "done" ? (
        <div className="retrieve-fade-up" style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ width: 72, height: 72, borderRadius: 999, backgroundColor: "#E8F6EC", color: "#1B7A3D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, margin: "0 auto 18px" }}>✓</div>
          <h2 style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Logged it</h2>
          <p style={{ color: T.mutedForeground, fontSize: 16, margin: "0 0 28px" }}>
            <strong style={{ color: T.foreground }}>{savedName}</strong> is now searchable by members.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Button onClick={reset}>Snap another item</Button>
            <Link href="/retrieve/staff" style={{ textDecoration: "none" }}>
              <Button variant="secondary">Go to dashboard</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Capture step (camera-first, with upload + skip fallback) ───────────────

function CaptureStep({ onCaptured, onSkip }: { onCaptured: (dataUrl: string) => void; onSkip: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"starting" | "live" | "unavailable">("starting");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setState("live");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    }
    void start();
    return () => { cancelled = true; stopStream(); };
  }, [stopStream]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // center-crop square
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    stopStream();
    onCaptured(dataUrl);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { stopStream(); onCaptured(String(reader.result)); };
    reader.readAsDataURL(file);
  }

  return (
    <div className="retrieve-fade-up" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 4px" }}>Snap a found item</h1>
        <p style={{ color: T.mutedForeground, fontSize: 15, margin: 0 }}>Point your camera at the item and capture.</p>
      </div>

      {/* Camera box — dark rounded square with dashed inset border */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", backgroundColor: T.hero, borderRadius: 24, overflow: "hidden" }}>
        <video
          ref={videoRef}
          playsInline
          muted
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: state === "live" ? "block" : "none" }}
        />
        {/* dashed inset frame */}
        <div aria-hidden style={{ position: "absolute", inset: 16, border: "2px dashed rgba(255,255,255,0.45)", borderRadius: 16, pointerEvents: "none" }} />

        {/* Label */}
        <div style={{ position: "absolute", top: 26, left: 0, right: 0, textAlign: "center", color: T.heroForeground, pointerEvents: "none" }}>
          <span style={{ fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 15, backgroundColor: "rgba(0,0,0,0.35)", padding: "6px 14px", borderRadius: 999 }}>
            {state === "live" ? "Point at found items" : state === "starting" ? "Starting camera…" : "Camera not available"}
          </span>
        </div>

        {state === "unavailable" ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(255,255,255,0.85)", padding: 24, textAlign: "center" }}>
            <span aria-hidden style={{ fontSize: 36 }}>📷</span>
            <p style={{ margin: 0, fontSize: 14, maxWidth: 260 }}>No camera here. Upload a photo or continue without one — both work fine.</p>
          </div>
        ) : null}

        {/* Record button */}
        {state === "live" ? (
          <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={capture}
              aria-label="Capture photo"
              style={{ position: "relative", width: 80, height: 80, borderRadius: 999, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
            >
              <span aria-hidden className="retrieve-pulse-ring" style={{ position: "absolute", inset: 0, borderRadius: 999, backgroundColor: T.primary }} />
              <span aria-hidden style={{ position: "absolute", inset: 0, borderRadius: 999, backgroundColor: T.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 64, height: 64, borderRadius: 999, border: "4px solid #fff" }} />
              </span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Fallbacks — always present (accessible, non-camera path) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          <span aria-hidden>⬆</span> Upload a photo instead
        </Button>
        <button type="button" onClick={onSkip} style={{ background: "none", border: "none", color: T.mutedForeground, fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "6px 0", textDecoration: "underline" }}>
          Continue without a photo
        </button>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const idx = step === "capture" ? 0 : step === "details" ? 1 : 2;
  const labels = ["Capture", "Details", "Done"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", margin: "4px 0 22px" }}>
      {labels.map((l, i) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: i <= idx ? T.foreground : T.mutedForeground }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, backgroundColor: i < idx ? T.primaryStrong : i === idx ? T.foreground : T.muted, color: i <= idx ? "#fff" : T.mutedForeground }}>
              {i < idx ? "✓" : i + 1}
            </span>
            {l}
          </span>
          {i < labels.length - 1 ? <span aria-hidden style={{ width: 18, height: 1, backgroundColor: T.border }} /> : null}
        </div>
      ))}
    </div>
  );
}
