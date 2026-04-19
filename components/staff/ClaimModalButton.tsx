"use client";

import { useRef } from "react";

type Props = {
  claimId: string;
  studentName: string | null;
  studentIdNumber: string | null;
  studentEmail: string | null;
  action: (formData: FormData) => Promise<void>;
};

function isPendingStaffEntry(value: string | null): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  if (!v) return true;
  return v === "pending" || v === "pending staff entry" || v === "pending@staff-entry.edu";
}

export function ClaimModalButton({ claimId, studentName, studentIdNumber, studentEmail, action }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function closeModal() {
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details className="claim-modal" ref={detailsRef}>
      <summary className="cursor-pointer list-none inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
        Mark as Claimed
      </summary>

      <div className="claim-modal__overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`claim-modal-title-${claimId}`}
          className="anim-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-2xl"
        >
          <form action={action}>
            <input type="hidden" name="claimId" value={claimId} />

            <h2 id={`claim-modal-title-${claimId}`} className="text-lg font-semibold">
              Mark as Claimed
            </h2>
            <p className="mt-2 text-sm text-[#F5F5F0]/75">Update student info and confirm.</p>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">Student name</span>
                <input
                  name="studentName"
                  defaultValue={isPendingStaffEntry(studentName) ? "" : (studentName ?? "")}
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-brand/45 focus:ring-2 focus:ring-brand/25"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">Student ID</span>
                <input
                  name="studentIdNumber"
                  defaultValue={isPendingStaffEntry(studentIdNumber) ? "" : (studentIdNumber ?? "")}
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-brand/45 focus:ring-2 focus:ring-brand/25"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">
                  Student email <span className="text-[#F5F5F0]/60">(optional)</span>
                </span>
                <input
                  type="email"
                  name="studentEmail"
                  defaultValue={studentEmail ?? ""}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-brand/45 focus:ring-2 focus:ring-brand/25"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-[#F5F5F0]/70">
                  Notes <span className="text-[#F5F5F0]/60">(optional)</span>
                </span>
                <textarea
                  name="notes"
                  defaultValue=""
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-brand/45 focus:ring-2 focus:ring-brand/25"
                />
              </label>
            </div>

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
