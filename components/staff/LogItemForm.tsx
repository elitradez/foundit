"use client";

import { useState } from "react";

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

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
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Identification failed");
        return;
      }
      if (data.name) setName(data.name);
      if (data.description) setDescription(data.description);
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
      const fd = new FormData();
      fd.set("photo", photoFile);
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[95vh] w-full overflow-y-auto rounded-none border border-white/10 bg-[#141414] p-6 shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F0]">Log new item</h2>
            <p className="mt-1 text-sm text-[#F5F5F0]/55">
              Photo is sent to Claude to suggest a name and description. Edit before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1 text-sm text-[#F5F5F0]/70 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Photo</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-sm text-[#F5F5F0]/80 hover:bg-white/5">
                <span className="font-medium">Upload photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={onPhotoChange}
                  className="hidden"
                />
              </label>

              <label className="cursor-pointer rounded-xl bg-[#CC0000]/15 px-4 py-3 text-center text-sm font-medium text-[#F5F5F0] hover:bg-[#CC0000]/25">
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
              <p className="text-xs text-[#F5F5F0]/50">Identifying with AI…</p>
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
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveBusy}
              className="rounded-xl bg-[#CC0000] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#a80000] disabled:opacity-50"
            >
              {saveBusy ? "Saving…" : "Save item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
