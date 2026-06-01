"use client";

import { useState } from "react";
import { T } from "@/lib/retrieve/tokens";

/**
 * Gym-only UI primitives. Forked for the "Retrieve" tenant — NOT shared with the
 * campus UI. Inline-style based (matching the repo's existing style approach).
 */

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  fullWidth?: boolean;
  ariaLabel?: string;
};

/**
 * Primary buttons: full-width, tall (h-14 / 56px), rounded-2xl, display font.
 * White-on-orange uses --primary-strong (#CB4B0B) → 4.60:1 AA pass.
 */
export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  fullWidth = true,
  ariaLabel,
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: fullWidth ? "100%" : "auto",
    height: 56,
    padding: fullWidth ? "0 20px" : "0 28px",
    borderRadius: 16,
    fontFamily: T.fontDisplay,
    fontWeight: 600,
    fontSize: 17,
    letterSpacing: "-0.01em",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "background-color .15s, box-shadow .15s, transform .1s, border-color .15s",
    border: "1px solid transparent",
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: hover && !disabled ? "#B23F08" : T.primaryStrong,
      color: T.primaryForeground,
      boxShadow: hover && !disabled ? "0 8px 20px rgba(203,75,11,0.28)" : "0 2px 8px rgba(203,75,11,0.18)",
    },
    secondary: {
      backgroundColor: hover && !disabled ? T.muted : T.background,
      color: T.foreground,
      borderColor: T.border,
    },
    ghost: {
      backgroundColor: "transparent",
      color: T.mutedForeground,
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant] }}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  style,
  as = "div",
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  as?: "div" | "li";
}) {
  const Tag = as;
  return (
    <Tag
      style={{
        backgroundColor: T.background,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        boxShadow: T.cardShadow,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function Field({
  label,
  hint,
  required,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 14, fontWeight: 600, color: T.foreground }}>
        {label}
        {required ? <span style={{ color: T.primaryStrong }}> *</span> : null}
      </label>
      {hint ? <span style={{ fontSize: 13, color: T.mutedForeground, marginTop: -2 }}>{hint}</span> : null}
      {children}
      {error ? (
        <span role="alert" style={{ fontSize: 13, color: T.primaryStrong, fontWeight: 500 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

const fieldFocus = (e: React.FocusEvent<HTMLElement>) => {
  e.currentTarget.style.borderColor = T.primaryStrong;
  e.currentTarget.style.boxShadow = `0 0 0 4px ${T.primarySoft}`;
};
const fieldBlur = (e: React.FocusEvent<HTMLElement>) => {
  e.currentTarget.style.borderColor = T.border;
  e.currentTarget.style.boxShadow = "none";
};

export const inputBaseStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  backgroundColor: T.background,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: "13px 15px",
  fontSize: 16, // ≥16px avoids iOS zoom-on-focus
  fontFamily: T.fontBody,
  color: T.foreground,
  outline: "none",
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputBaseStyle, ...props.style }} onFocus={(e) => { fieldFocus(e); props.onFocus?.(e); }} onBlur={(e) => { fieldBlur(e); props.onBlur?.(e); }} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{ ...inputBaseStyle, resize: "vertical", minHeight: 96, ...props.style }}
      onFocus={(e) => { fieldFocus(e); props.onFocus?.(e); }}
      onBlur={(e) => { fieldBlur(e); props.onBlur?.(e); }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{ ...inputBaseStyle, appearance: "none", backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: 40, cursor: "pointer", ...props.style }}
      onFocus={(e) => { fieldFocus(e); props.onFocus?.(e); }}
      onBlur={(e) => { fieldBlur(e); props.onBlur?.(e); }}
    />
  );
}

/** Small status pill used on item cards / dashboard rows. */
export function StatusPill({ status }: { status: "active" | "recovered" | "disposed" }) {
  const map = {
    active: { bg: "#FFF1E8", fg: "#B23F08", label: "Active" },
    recovered: { bg: "#E8F6EC", fg: "#1B7A3D", label: "Recovered" },
    disposed: { bg: T.muted, fg: T.mutedForeground, label: "Disposed" },
  } as const;
  const s = map[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: s.bg, color: s.fg, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: s.fg }} />
      {s.label}
    </span>
  );
}
