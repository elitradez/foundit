"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

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
            <h2 className="text-xl font-semibold text-[#F5F5F0]">Log item</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-lg border border-white/10 px-4 py-2 text-base text-[#F5F5F0]/70 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-base font-semibold text-[#F5F5F0]">Step 1: Take or upload photo</p>
            <p className="mt-1 text-sm text-[#F5F5F0]/60">AI identifies item details automatically.</p>
          </div>
          <label className="block space-y-2">
            <span className="text-base text-[#F5F5F0]/85">Photo</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-white/10 bg-black/30 px-4 py-4 text-center text-base text-[#F5F5F0]/80 transition duration-200 hover:bg-white/5">
                <span className="font-medium">Upload photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={onPhotoChange}
                  className="hidden"
                />
              </label>

              <label className="cursor-pointer rounded-xl bg-[#CC0000]/15 px-4 py-4 text-center text-base font-medium text-[#F5F5F0] transition duration-200 hover:bg-[#CC0000]/25">
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
              <p className="inline-flex items-center gap-2 text-sm text-[#F5F5F0]/60">
                <Spinner className="h-3.5 w-3.5 text-[#CC0000]" />
                AI is analyzing the photo...
              </p>
            ) : null}
          </label>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-base font-semibold text-[#F5F5F0]">Step 2: Confirm name and add location</p>
          </div>
          <label className="block space-y-2">
            <span className="text-base text-[#F5F5F0]/85">Item name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-base text-[#F5F5F0]/85">Location found</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Union - 2nd floor lounge"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
              required
            />
          </label>

          <label className="hidden">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-base text-[#F5F5F0]/85">Date found</span>
            <input
              type="date"
              value={dateFound}
              onChange={(e) => setDateFound(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-[#F5F5F0] outline-none focus:border-[#CC0000]/50 focus:ring-2 focus:ring-[#CC0000]/30"
              required
            />
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-base font-semibold text-[#F5F5F0]">Step 3: Save</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 items-center rounded-xl border border-white/15 px-5 py-2.5 text-base transition duration-200 hover:bg-white/5 active:scale-[0.99]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveBusy}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#CC0000] px-6 py-3 text-base font-semibold text-white transition duration-200 hover:bg-[#a80000] active:scale-[0.99] disabled:opacity-50"
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
