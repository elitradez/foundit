"use client";

import { useRef } from "react";

type Props = {
  itemId: string;
  kind: "returned" | "claimed";
  claimId?: string;
  action: (formData: FormData) => Promise<void>;
};

export function RelistModalButton({ itemId, kind, claimId, action }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function closeModal() {
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details className="relative" ref={detailsRef}>
      <summary className="cursor-pointer list-none inline-flex min-h-11 items-center rounded-xl bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600">
        Relist
      </summary>
      <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`relist-title-${itemId}`}
          className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl"
        >
          <h3 id={`relist-title-${itemId}`} className="text-lg font-semibold text-[#F5F5F0]">
            Are you sure? This will put the item back in the active list.
          </h3>
          <form action={action} className="mt-5">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="itemId" value={itemId} />
            {kind === "claimed" && claimId ? (
              <input type="hidden" name="claimId" value={claimId} />
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                Confirm
              </button>
            </div>
          </form>
        </div>
      </div>
    </details>
  );
}
