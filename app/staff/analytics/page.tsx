import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffSession } from "@/lib/staff-api";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type ItemRow = {
  id: string;
  created_at: string;
  returned_at: string | null;
  sent_to_surplus_at: string | null;
  location: string;
};

// The status column is not reliably updated by return/surplus routes —
// derive the real status from the timestamp columns instead.
function deriveStatus(item: ItemRow): "active" | "returned" | "surplus" {
  if (item.sent_to_surplus_at) return "surplus";
  if (item.returned_at) return "returned";
  return "active";
}

function avgHoursToReturn(items: ItemRow[]): number | null {
  const returned = items.filter((i) => deriveStatus(i) === "returned" && i.returned_at);
  if (returned.length === 0) return null;
  const totalMs = returned.reduce(
    (sum, i) => sum + (new Date(i.returned_at!).getTime() - new Date(i.created_at).getTime()),
    0,
  );
  return totalMs / returned.length / (1000 * 60 * 60);
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function getWeeklyTrend(items: ItemRow[]): { label: string; count: number }[] {
  const weeks: { start: Date; end: Date; label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    weeks.push({
      start,
      end,
      label: `${start.toLocaleString("en-US", { month: "short" })} ${start.getDate()}`,
      count: 0,
    });
  }
  for (const item of items) {
    const created = new Date(item.created_at);
    for (const week of weeks) {
      if (created >= week.start && created < week.end) { week.count++; break; }
    }
  }
  return weeks.map(({ label, count }) => ({ label, count }));
}

function getTopLocations(items: ItemRow[], limit = 8): { location: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const loc = item.location.trim() || "Unknown";
    counts.set(loc, (counts.get(loc) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([location, count]) => ({ location, count }));
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function WeeklyBarChart({ weeks }: { weeks: { label: string; count: number }[] }) {
  const maxCount = Math.max(...weeks.map((w) => w.count), 1);
  const yMax = maxCount <= 2 ? 4 : maxCount <= 5 ? 6 : Math.ceil(maxCount / 5) * 5;

  const LP = 26; // left padding (y-axis labels)
  const RP = 4;
  const TP = 12;
  const BP = 22; // bottom padding (x-axis labels)
  const CW = 480; // chart inner width
  const CH = 110; // chart inner height
  const TW = LP + CW + RP;
  const TH = TP + CH + BP;

  const slotW = CW / weeks.length;
  const barW = Math.max(Math.floor(slotW * 0.52), 6);

  const yTicks = [0, 0.5, 1].map((f) => ({
    value: Math.round(f * yMax),
    y: TP + CH - f * CH,
  }));

  return (
    <svg viewBox={`0 0 ${TW} ${TH}`} className="w-full" role="img" aria-label="Weekly items logged">
      {yTicks.map(({ value, y }) => (
        <g key={value}>
          <line x1={LP} y1={y} x2={LP + CW} y2={y} stroke="#F1F5F9" strokeWidth={1} />
          <text x={LP - 5} y={y + 3.5} textAnchor="end" fontSize={8} fill="#94A3B8" fontFamily="system-ui,sans-serif">
            {value}
          </text>
        </g>
      ))}

      {weeks.map((week, i) => {
        const barH = Math.max((week.count / yMax) * CH, week.count > 0 ? 2 : 0);
        const x = LP + i * slotW + (slotW - barW) / 2;
        const y = TP + CH - barH;
        const isCurrent = i === weeks.length - 1;
        return (
          <g key={i}>
            {barH > 0 && (
              <rect
                x={x} y={y} width={barW} height={barH}
                fill={isCurrent ? "#CC0000" : "#CBD5E1"}
              />
            )}
            {week.count > 0 && (
              <text
                x={x + barW / 2} y={y - 4}
                textAnchor="middle" fontSize={7.5} fill={isCurrent ? "#CC0000" : "#64748B"}
                fontFamily="system-ui,sans-serif" fontWeight={isCurrent ? "600" : "400"}
              >
                {week.count}
              </text>
            )}
            <text
              x={x + barW / 2} y={TH - 2}
              textAnchor="middle" fontSize={7.5} fill={isCurrent ? "#374151" : "#94A3B8"}
              fontFamily="system-ui,sans-serif"
            >
              {week.label}
            </text>
          </g>
        );
      })}

      <line x1={LP} y1={TP + CH} x2={LP + CW} y2={TP + CH} stroke="#E2E8F0" strokeWidth={1} />
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function StaffAnalyticsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const supabase = createAdminSupabaseClient();

  const { data: itemsData, error: itemsErr } = await supabase
    .from("items")
    .select("id, created_at, returned_at, sent_to_surplus_at, location")
    .eq("department_id", session.department_id);

  if (itemsErr) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-red-600 text-sm">{itemsErr.message}</p>
      </div>
    );
  }

  const items = (itemsData ?? []) as ItemRow[];
  const itemIds = items.map((i) => i.id);

  const claimsRes = itemIds.length > 0
    ? await supabase.from("claims").select("id", { count: "exact", head: true }).in("item_id", itemIds)
    : { count: 0, error: null };

  const claimsTotal = claimsRes.count ?? 0;

  const totalItems  = items.length;
  const activeItems  = items.filter((i) => deriveStatus(i) === "active").length;
  const returnedItems = items.filter((i) => deriveStatus(i) === "returned").length;
  const surplusItems  = items.filter((i) => deriveStatus(i) === "surplus").length;
  const returnRate  = totalItems > 0 ? ((returnedItems / totalItems) * 100).toFixed(1) : "—";
  const avgHours    = avgHoursToReturn(items);
  const weeklyTrend  = getWeeklyTrend(items);
  const topLocations = getTopLocations(items);
  const topMax      = topLocations[0]?.count ?? 1;

  const generated = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-white text-[#111827]" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Header ── */}
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
              Analytics
            </span>
            <span className="text-[#D1D5DB]">|</span>
            <h1 className="text-sm font-semibold text-[#111827]">{session.department_name}</h1>
          </div>
          <nav className="flex items-center gap-5">
            <Link href="/staff" className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors">
              ← Dashboard
            </Link>
            <Link href="/" className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors">
              Student view
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-6 py-8">

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 divide-x divide-y divide-[#E5E7EB] border border-[#E5E7EB] sm:grid-cols-4 sm:divide-y-0">
          {[
            { label: "Items Logged",       value: String(totalItems),                         sub: "all time"                              },
            { label: "Claims Submitted",   value: String(claimsTotal),                        sub: "across all items"                      },
            { label: "Return Rate",        value: returnRate === "—" ? "—" : `${returnRate}%`, sub: `${returnedItems} of ${totalItems} returned` },
            { label: "Avg. Time to Return",value: avgHours !== null ? fmtHours(avgHours) : "—", sub: avgHours !== null ? "logged → returned" : "no returns yet" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="px-5 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
              <p className="mt-2 text-[2rem] font-semibold leading-none tracking-tight text-[#111827]">{value}</p>
              <p className="mt-1.5 text-[11px] text-[#9CA3AF]">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Two-column: chart + status ── */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">

          {/* Weekly chart */}
          <div className="border border-[#E5E7EB]">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
                Weekly Activity
              </p>
              <p className="text-[10px] text-[#9CA3AF]">Last 8 weeks · current week in red</p>
            </div>
            <div className="px-4 py-5">
              {weeklyTrend.every((w) => w.count === 0) ? (
                <p className="py-10 text-center text-sm text-[#9CA3AF]">No items logged in the last 8 weeks.</p>
              ) : (
                <WeeklyBarChart weeks={weeklyTrend} />
              )}
            </div>
          </div>

          {/* Status breakdown */}
          <div className="border border-[#E5E7EB]">
            <div className="border-b border-[#E5E7EB] px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
                Item Status
              </p>
            </div>
            <div className="divide-y divide-[#F3F4F6]">
              {[
                { label: "Active",           count: activeItems,  color: "#2563EB" },
                { label: "Returned to owner", count: returnedItems, color: "#059669" },
                { label: "Sent to surplus",  count: surplusItems, color: "#D97706" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="flex-1 text-sm text-[#374151]">{label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 overflow-hidden rounded-none bg-[#F3F4F6]" style={{ height: 3 }}>
                      <div
                        style={{
                          width: totalItems > 0 ? `${(count / totalItems) * 100}%` : "0%",
                          height: "100%",
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right text-sm font-semibold tabular-nums text-[#111827]">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#F3F4F6] px-5 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#9CA3AF]">Total</span>
                <span className="text-sm font-semibold tabular-nums text-[#111827]">{totalItems}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Top locations ── */}
        <div className="mt-6 border border-[#E5E7EB]">
          <div className="border-b border-[#E5E7EB] px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
              Top Locations
            </p>
          </div>

          {topLocations.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[#9CA3AF]">No location data yet.</p>
          ) : (
            <div className="divide-y divide-[#F3F4F6]">
              {topLocations.map(({ location, count }, idx) => (
                <div key={location} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-5 flex-shrink-0 text-[11px] tabular-nums text-[#9CA3AF]">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-[#374151]">{location}</span>
                  <div className="hidden w-40 overflow-hidden bg-[#F3F4F6] sm:block" style={{ height: 3 }}>
                    <div
                      className="h-full bg-[#1E293B]"
                      style={{ width: `${(count / topMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-7 flex-shrink-0 text-right text-sm font-semibold tabular-nums text-[#111827]">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <p className="mt-6 text-right text-[10px] text-[#9CA3AF]">
          Generated {generated}
        </p>

      </main>
    </div>
  );
}
