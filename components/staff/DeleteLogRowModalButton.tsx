"use client";

import { useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

type Props = {
  itemId: string;
  kind: "returned" | "claimed";
  claimId?: string;
  action: (formData: FormData) => Promise<void>;
};

export function DeleteLogRowModalButton({ itemId, kind, claimId, action }: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false));

  async function handleAction(fd: FormData) {
    await action(fd);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer inline-flex items-center rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[#F5F5F0]/70 hover:bg-white/5"
      >
        Delete
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-title-${itemId}`}
            className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl"
          >
            <h2 id={`delete-title-${itemId}`} className="text-lg font-semibold text-[#F5F5F0]">
              Delete this log entry?
            </h2>
            <p className="mt-2 text-sm text-[#F5F5F0]/75">
              {kind === "returned"
                ? "This permanently deletes the returned item and its photo."
                : "This removes the claim record from the log."}
            </p>
            <form action={handleAction} className="mt-5">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="itemId" value={itemId} />
              {kind === "claimed" && claimId ? (
                <input type="hidden" name="claimId" value={claimId} />
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Confirm delete
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
