"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StaffLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.push("/staff");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#0c0c0c]">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <p className="text-brand text-sm font-semibold tracking-wide uppercase">Staff</p>
          <h1 className="text-2xl font-semibold text-[#F5F5F0]">Foundit</h1>
          <p className="text-sm text-[#F5F5F0]/60">Sign in to log and manage items</p>
          <p className="text-xs text-[#F5F5F0]/60">
            <Link href="/" className="text-brand/90 hover:text-brand">
              Back to student view
            </Link>
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
          <label className="block space-y-2">
            <span className="text-sm text-[#F5F5F0]/80">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[#F5F5F0] outline-none ring-brand/40 focus:border-brand/50 focus:ring-2"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand py-3 text-sm font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
