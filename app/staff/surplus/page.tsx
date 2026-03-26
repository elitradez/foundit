import Image from "next/image";
import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function StaffSurplusPage() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("surplus_and_salvage")
    .select("id, item_id, item_name, location_found, date_found, date_logged, date_sent_to_surplus")
    .order("date_sent_to_surplus", { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] p-6 text-[#F5F5F0]">
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
          {error.message}
        </p>
      </div>
    );
  }

  const items = (data ?? []) as Array<{
    id: string;
    item_id: string;
    item_name: string;
    location_found: string;
    date_found: string;
    date_logged: string;
    date_sent_to_surplus: string;
  }>;
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const past30 = items.filter((i) => {
    if (!i.date_sent_to_surplus) return false;
    const days = Math.floor((now - new Date(i.date_sent_to_surplus).getTime()) / (1000 * 60 * 60 * 24));
    return days >= 30;
  }).length;

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">
      <header className="border-b border-white/10 bg-[#0c0c0c]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#CC0000]">Staff</p>
            <h1 className="text-xl font-semibold">Surplus log</h1>
          </div>
          <Link href="/staff" className="rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F5F0]/85 hover:bg-white/5">
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            Total in surplus: <span className="font-semibold">{items.length}</span>
          </div>
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Past 30 days: <span className="font-semibold">{past30}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-[#F5F5F0]/70">
              <tr>
                <th className="px-4 py-3 font-medium">Photo</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Location found</th>
                <th className="px-4 py-3 font-medium">Date found</th>
                <th className="px-4 py-3 font-medium">Date sent to surplus</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[#F5F5F0]/50">
                    No items in surplus.
                  </td>
                </tr>
              ) : null}
              {items.map((item) => {
                const days = item.date_sent_to_surplus
                  ? Math.floor((now - new Date(item.date_sent_to_surplus).getTime()) / (1000 * 60 * 60 * 24))
                  : 0;
                const ready = days >= 30;
                return (
                  <tr key={item.id} className={ready ? "bg-red-500/5" : "bg-black/20"}>
                    <td className="px-4 py-3">
                      <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/10">
                        <Image
                          src={`/api/staff/items/${item.item_id}/photo`}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="56px"
                          unoptimized
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{item.item_name}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{item.location_found}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{item.date_found}</td>
                    <td className="px-4 py-3 text-[#F5F5F0]/80">{item.date_sent_to_surplus?.slice(0, 10) ?? "-"}</td>
                    <td className="px-4 py-3">
                      {ready ? (
                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">Ready for disposal</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">In surplus</span>
                      )}
                    </td>
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
