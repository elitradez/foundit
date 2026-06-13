import { useEffect, useRef } from "react";

// Exclude hidden inputs: they match input:not([disabled]) but cannot hold
// focus, so treating one as the "first focusable" silently breaks Tab.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: () => void
) {
  const ref = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    // Cleanup runs both when `active` flips false AND when the dialog
    // component unmounts while still active (the common pattern
    // `{open ? <Modal /> : null}` with useFocusTrap(true, …)) — focus must
    // return to the trigger element in both cases.
    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !ref.current) return;

    const container = ref.current;
    const getFocusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));

    getFocusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeRef.current?.();
        return;
      }

      if (e.key === "Tab") {
        const els = getFocusables();
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        const current = document.activeElement;

        // If focus is outside the dialog (e.g. the focused element was
        // unmounted by a step change and focus fell back to <body>), the
        // browser's default Tab would move focus to content BEHIND the modal.
        // Pull it back inside instead.
        if (!(current instanceof HTMLElement) || !container.contains(current)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }

        // At the edges, wrap. Anywhere else, do NOT preventDefault — the
        // browser performs standard focus advancement between fields.
        if (e.shiftKey) {
          if (current === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (current === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);

  return ref;
}
