"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RetrieveHeader } from "@/components/retrieve/RetrieveHeader";
import { Button, Card, Field, TextInput } from "@/components/retrieve/ui";
import { T } from "@/lib/retrieve/tokens";

/**
 * Gym staff login. Members never see this — search/claim stay login-free.
 * Posts to /retrieve/api/staff/login, which sets the httpOnly session cookie.
 */
export default function RetrieveStaffLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/retrieve/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/retrieve/staff");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Login failed");
    } catch {
      setError("Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RetrieveHeader links={[{ href: "/retrieve/search", label: "Member view" }]} />
      <main id="main-content" style={{ maxWidth: 420, margin: "0 auto", padding: "48px 20px 64px" }}>
        <Card style={{ padding: 28 }}>
          <h1 style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, margin: "0 0 6px", color: T.foreground }}>
            Staff sign in
          </h1>
          <p style={{ fontSize: 14, color: T.mutedForeground, margin: "0 0 22px" }}>
            Front-desk access for logging and releasing items.
          </p>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Field label="Password" htmlFor="staff-password" required error={error}>
              <TextInput
                id="staff-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </Field>
            <Button type="submit" disabled={busy || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </main>
    </>
  );
}
