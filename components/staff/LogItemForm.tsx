"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { ValueTier } from "@/lib/value-tier";

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

export function LogItemForm({ onClose, onSaved }: Props) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [dateFound, setDateFound] = useState(() => new Date().toISOString().slice(0, 10));
  const [optionalPin, setOptionalPin] = useState("");
  const [identifyBusy, setIdentifyBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [valueTier, setValueTier] = useState<ValueTier>("low_value");

  async function runIdentify(file: File) {
    setError(null);
    setIdentifyBusy(true);
    try {
      const fd = new FormData();
      fd.set("photo", file);
      const res = await fetch("/api/staff/identify", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        name?: string;
        description?: string;
        value_tier?: ValueTier;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Identification failed");
        return;
      }
      if (data.name) setName(data.name);
      if (data.description) setDescription(data.description);
      if (data.value_tier === "low_value" || data.value_tier === "high_value") {
        setValueTier(data.value_tier);
      }
    } finally {
      setIdentifyBusy(false);
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
      fd.set("value_tier", valueTier);
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
      <div className="anim-pop-in max-h-[95vh] w-full overflow-y-auto rounded-none border border-white/10 bg-[#141414] p-6 shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F0]">Log new item</h2>
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
          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Photo</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-sm text-[#F5F5F0]/80 transition duration-200 hover:bg-white/5">
                <span className="font-medium">Upload photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={onPhotoChange}
                  className="hidden"
                />
              </label>

              <label className="cursor-pointer rounded-xl bg-[#CC0000]/15 px-4 py-3 text-center text-sm font-medium text-[#F5F5F0] transition duration-200 hover:bg-[#CC0000]/25">
                <span>Take photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  onChange={onPhotoChange}
                  className="hidden"
                />
              </label>
            </div>
            {identifyBusy ? (
              <p className="inline-flex items-center gap-2 text-xs text-[#F5F5F0]/60">
                <Spinner className="h-3.5 w-3.5 text-[#CC0000]" />
                AI is analyzing the photo...
              </p>
            ) : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
              required
            />
            <p className="text-xs text-[#F5F5F0]/45">
              Use simple terms students would search — &quot;laptop&quot; not &quot;MacBook Pro&quot;
            </p>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Value tier</span>
            <select
              value={valueTier}
              onChange={(e) => setValueTier(e.target.value as ValueTier)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
            >
              <option value="low_value">Low value — students see an unblurred photo</option>
              <option value="high_value">High value — photo blurred until description matches</option>
            </select>
            <p className="text-xs text-[#F5F5F0]/45">Set by AI; change here if the classification looks wrong.</p>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Location found</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Union — 2nd floor lounge"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Date found</span>
            <input
              type="date"
              value={dateFound}
              onChange={(e) => setDateFound(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
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
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
            />
            <p className="text-xs text-[#F5F5F0]/45">Students must enter this PIN to submit a claim.</p>
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2.5 text-sm transition duration-200 hover:bg-white/5 active:scale-[0.99]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#CC0000] px-4 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-[#a80000] active:scale-[0.99] disabled:opacity-50"
            >
              {saveBusy ? (
                <>
                  <Spinner className="h-4 w-4 text-white" />
                  Saving...
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
