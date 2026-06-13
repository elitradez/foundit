"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useFocusTrap } from "@/lib/useFocusTrap";

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image"));
    el.src = dataUrl;
  });

  const maxSide = 800;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) return file;

  const stem = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${stem || "photo"}.jpg`, { type: "image/jpeg" });
}

async function compressForIdentify(file: File): Promise<File> {
  const maxBytes = 1 * 1024 * 1024;
  if (!file.type.startsWith("image/") || file.size <= maxBytes) return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image"));
    el.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  const stem = file.name.replace(/\.[^.]+$/, "");

  // Try progressively lower quality at 1600px max, then fall back to 800px
  for (const [maxSide, quality] of [[1600, 0.85], [1600, 0.7], [1600, 0.55], [800, 0.75]] as [number, number][]) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) {
      return new File([blob], `${stem || "photo"}.jpg`, { type: "image/jpeg" });
    }
  }

  return file;
}

export function LogItemForm({ onClose, onSaved }: Props) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [dateFound, setDateFound] = useState(() => new Date().toISOString().slice(0, 10));
  const [optionalPin, setOptionalPin] = useState("");
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runIdentify(file: File) {
    setError(null);
    setAiStatus("loading");
    try {
      const compressed = await compressForIdentify(file);
      const fd = new FormData();
      fd.set("photo", compressed);
      const res = await fetch("/api/staff/identify", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        name?: string;
        description?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Identification failed");
        setAiStatus("failed");
        return;
      }
      if (data.name) setName(data.name);
      if (data.description) {
        setDescription(data.description);
        setAiStatus("done");
      } else {
        setAiStatus("failed");
      }
    } catch {
      setAiStatus("failed");
    }
  }

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPhotoFile(f ?? null);
    if (f) void runIdentify(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photoFile) {
      setError("Please add a photo");
      return;
    }
    setError(null);
    setSaveBusy(true);
    try {
      const optimizedPhoto = await compressImageForUpload(photoFile);
      const fd = new FormData();
      fd.set("photo", optimizedPhoto);
      fd.set("name", name);
      fd.set("description", description);
      fd.set("location", location);
      fd.set("date_found", dateFound);
      if (optionalPin.trim()) fd.set("optional_pin", optionalPin.trim());
      const res = await fetch("/api/staff/items", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-item-title"
        className="anim-pop-in max-h-[95vh] w-full overflow-y-auto rounded-none border border-white/10 bg-[#141414] p-6 shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="log-item-title" className="text-lg font-semibold text-[#F5F5F0]">Log new item</h2>
            <p className="mt-1 text-sm text-[#F5F5F0]/55">
              Photo is sent to Claude to suggest a name, description, and value tier. Edit before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#F5F5F0]/70 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Photo</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {/* Inputs are sr-only (not display:none) so they stay keyboard-
                  focusable; the label shows the ring via focus-within. */}
              <label className="cursor-pointer rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-sm text-[#F5F5F0]/80 transition duration-200 hover:bg-white/5 focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 focus-within:ring-offset-[#141414]">
                <span className="font-medium">Upload photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onPhotoChange}
                  className="sr-only"
                />
              </label>

              <label className="cursor-pointer rounded-xl bg-brand/15 px-4 py-3 text-center text-sm font-medium text-[#F5F5F0] transition duration-200 hover:bg-brand/25 focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 focus-within:ring-offset-[#141414]">
                <span>Take photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onPhotoChange}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/30"
              required
            />
            <p className="text-xs text-[#F5F5F0]/60">
              Use simple terms students would search — &quot;laptop&quot; not &quot;MacBook Pro&quot;
            </p>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/30"
              required
            />
            {aiStatus === "loading" ? (
              <p role="status" className="inline-flex items-center gap-2 text-xs text-[#F5F5F0]/55">
                <Spinner className="h-3.5 w-3.5 text-brand" />
                Generating description…
              </p>
            ) : aiStatus === "failed" ? (
              <p role="status" className="text-xs text-amber-400/80">AI unavailable — please describe the item manually</p>
            ) : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Location found</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Union — 2nd floor lounge"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] placeholder:text-[#9CA3AF] outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/30"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Date found</span>
            <input
              type="date"
              value={dateFound}
              onChange={(e) => setDateFound(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/30"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Optional PIN (high-value items)</span>
            <input
              type="password"
              value={optionalPin}
              onChange={(e) => setOptionalPin(e.target.value)}
              placeholder="Leave blank if not needed"
              autoComplete="new-password"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] placeholder:text-[#9CA3AF] outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/30"
            />
            <p className="text-xs text-[#F5F5F0]/60">Students must enter this PIN to submit a claim.</p>
          </label>

          {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2.5 text-sm text-[#F5F5F0]/85 transition duration-200 hover:bg-white/5 active:scale-[0.99]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-hover active:scale-[0.99] disabled:opacity-50"
            >
              {saveBusy ? (
                <>
                  <Spinner className="h-4 w-4 text-white" />
                  Saving…
                </>
              ) : (
                "Save item"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
