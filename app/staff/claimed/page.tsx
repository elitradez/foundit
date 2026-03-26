import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isStaffAuthenticated } from "@/lib/staff-api";
import { redirect } from "next/navigation";
import Link from "next/link";

type ClaimedRow = {
  id: string;
  student_name: string | null;
  student_id_number: string | null;
  created_at: string;
  updated_at?: string | null;
  items?: { name: string | null } | Array<{ name: string | null }> | null;
};

export const dynamic = "force-dynamic";

export default async function StaffClaimedPage() {
  if (!(await isStaffAuthenticated())) redirect("/staff/login");

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("claims")
    .select("id, student_name, student_id_number, created_at, updated_at, items(name)")
    .eq("status", "claimed")
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0] p-6">
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">{error.message}</p>
      </div>
    );
  }

  const claims = (data ?? []) as ClaimedRow[];

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">
      <header className="border-b border-white/10 bg-[#0c0c0c]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#CC0000]">Staff</p>
            <h1 className="text-xl font-semibold">Student Log</h1>
          </div>
          <Link
            href="/staff"
            className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
              <tr>
                <th className="px-4 py-3 font-medium">Item name</th>
                <th className="px-4 py-3 font-medium">Student name</th>
                <th className="px-4 py-3 font-medium">Student ID</th>
                <th className="px-4 py-3 font-medium">Date claimed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#F5F5F0]/50">
                    No claimed items yet.
                  </td>
                </tr>
              ) : null}
              {claims.map((row) => {
                const itemJoin = row.items;
                const itemName = Array.isArray(itemJoin) ? itemJoin[0]?.name ?? "-" : itemJoin?.name ?? "-";
                const dateClaimed = row.updated_at ? row.updated_at.slice(0, 10) : row.created_at.slice(0, 10);
                return (
                  <tr key={row.id} className="bg-black/20">
                    <td className="px-4 py-4 text-[#F5F5F0]/85">{itemName}</td>
                    <td className="px-4 py-4">{row.student_name ?? "Not provided"}</td>
                    <td className="px-4 py-4">{row.student_id_number ?? "Not provided"}</td>
                    <td className="px-4 py-4 text-[#F5F5F0]/80">{dateClaimed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

