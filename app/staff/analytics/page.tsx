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

// ── Data helpers ─────────────────────────────────────────────────────────────

function avgHoursToReturn(items: ItemRow[]): number | null {
  const returned = items.filter((i) => deriveStatus(i) === "returned" && i.returned_at);
  if (returned.length === 0) return null;
  const totalMs = returned.reduce((sum, i) => {
    return sum + (new Date(i.returned_at!).getTime() - new Date(i.created_at).getTime());
  }, 0);
  return totalMs / returned.length / (1000 * 60 * 60);
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
    const month = start.toLocaleString("en-US", { month: "short" });
    const day = start.getDate();
    weeks.push({ start, end, label: `${month} ${day}`, count: 0 });
  }

  for (const item of items) {
    const created = new Date(item.created_at);
    for (const week of weeks) {
      if (created >= week.start && created < week.end) {
        week.count++;
        break;
      }
    }
  }

  return weeks.map(({ label, count }) => ({ label, count }));
}

function getTopLocations(items: ItemRow[], limit = 6): { location: string; count: number }[] {
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

// ── SVG bar chart ─────────────────────────────────────────────────────────────

function WeeklyBarChart({ weeks }: { weeks: { label: string; count: number }[] }) {
  const maxCount = Math.max(...weeks.map((w) => w.count), 1);
  const barW = 30;
  const gap = 10;
  const chartH = 100;
  const labelH = 28;
  const totalW = weeks.length * (barW + gap) - gap;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${chartH + labelH}`}
      className="w-full overflow-visible"
      aria-label="Items logged per week"
      role="img"
    >
      {/* Horizontal guide lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = chartH - frac * chartH;
        return (
          <line
            key={frac}
            x1={0}
            y1={y}
            x2={totalW}
            y2={y}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />
        );
      })}

      {weeks.map((week, i) => {
        const barH = Math.max((week.count / maxCount) * chartH, week.count > 0 ? 4 : 0);
        const x = i * (barW + gap);
        const y = chartH - barH;
        const isCurrentWeek = i === weeks.length - 1;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={isCurrentWeek ? "#CC0000" : "rgba(204,0,0,0.45)"}
              rx={3}
            />
            {week.count > 0 ? (
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={9}
                fill="rgba(245,245,240,0.7)"
              >
                {week.count}
              </text>
            ) : null}
            <text
              x={x + barW / 2}
              y={chartH + labelH - 4}
              textAnchor="middle"
              fontSize={8.5}
              fill="rgba(245,245,240,0.45)"
            >
              {week.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-[#F5F5F0]/50">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold text-[#F5F5F0]">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-[#F5F5F0]/50">{sub}</p> : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function StaffAnalyticsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const supabase = createAdminSupabaseClient();

  // Fetch all items for this department
  const { data: itemsData, error: itemsErr } = await supabase
    .from("items")
    .select("id, created_at, returned_at, sent_to_surplus_at, location")
    .eq("department_id", session.department_id);

  if (itemsErr) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <p className="text-red-400 text-sm">{itemsErr.message}</p>
      </div>
    );
  }

  const items = (itemsData ?? []) as ItemRow[];
  const itemIds = items.map((i) => i.id);

  // Fetch claims count scoped to this department's items
  const claimsCountRes =
    itemIds.length > 0
      ? await supabase
          .from("claims")
          .select("id", { count: "exact", head: true })
          .in("item_id", itemIds)
      : { count: 0, error: null };

  const claimsTotal = claimsCountRes.count ?? 0;

  // Compute metrics
  const totalItems = items.length;
  const activeItems = items.filter((i) => deriveStatus(i) === "active").length;
  const returnedItems = items.filter((i) => deriveStatus(i) === "returned").length;
  const surplusItems = items.filter((i) => deriveStatus(i) === "surplus").length;
  const returnRate = totalItems > 0 ? Math.round((returnedItems / totalItems) * 100) : 0;
  const avgHours = avgHoursToReturn(items);
  const weeklyTrend = getWeeklyTrend(items);
  const topLocations = getTopLocations(items);
  const topLocationMax = topLocations[0]?.count ?? 1;

  function fmtHours(h: number): string {
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${Math.round(h)}h`;
    const days = Math.round(h / 24);
    return `${days}d`;
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#F5F5F0]">

      {/* Header */}
      <header className="border-b border-white/10 bg-[#0c0c0c]/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#FF6666]">Staff · Analytics</p>
            <h1 className="text-lg font-semibold leading-tight">{session.department_name}</h1>
          </div>
          <nav aria-label="Staff navigation" className="flex items-center gap-2">
            <Link
              href="/staff"
              className="inline-flex min-h-9 items-center rounded border border-white/20 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              ← Dashboard
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-9 items-center rounded border border-white/20 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              Student view
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 space-y-8">

        {/* ── Summary stats ── */}
        <section aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#F5F5F0]/40">
            Overview
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Items logged" value={totalItems} />
            <StatCard label="Claims submitted" value={claimsTotal} />
            <StatCard
              label="Return rate"
              value={`${returnRate}%`}
              sub={`${returnedItems} of ${totalItems} returned`}
            />
            <StatCard
              label="Avg time to return"
              value={avgHours !== null ? fmtHours(avgHours) : "—"}
              sub={avgHours !== null ? "from logged to returned" : "no returns yet"}
            />
          </div>
        </section>

        {/* ── Item status breakdown ── */}
        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#F5F5F0]/40">
            Item status breakdown
          </h2>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] divide-y divide-white/10">
            {[
              { label: "Active", count: activeItems, color: "#60a5fa" },
              { label: "Returned to owner", count: returnedItems, color: "#34d399" },
              { label: "Sent to surplus", count: surplusItems, color: "#f59e0b" },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm text-[#F5F5F0]/80">{label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block w-32 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: totalItems > 0 ? `${(count / totalItems) * 100}%` : "0%",
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold text-[#F5F5F0]">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Weekly trend ── */}
        <section aria-labelledby="trend-heading">
          <h2 id="trend-heading" className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#F5F5F0]/40">
            Items logged — last 8 weeks
          </h2>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-5">
            {weeklyTrend.every((w) => w.count === 0) ? (
              <p className="text-center text-sm text-[#F5F5F0]/40 py-8">No items logged in the last 8 weeks.</p>
            ) : (
              <WeeklyBarChart weeks={weeklyTrend} />
            )}
          </div>
        </section>

        {/* ── Top locations ── */}
        <section aria-labelledby="locations-heading">
          <h2 id="locations-heading" className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#F5F5F0]/40">
            Top locations
          </h2>
          {topLocations.length === 0 ? (
            <p className="text-sm text-[#F5F5F0]/40">No location data yet.</p>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] divide-y divide-white/10">
              {topLocations.map(({ location, count }) => (
                <div key={location} className="flex items-center gap-4 px-5 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-[#F5F5F0]/80">{location}</span>
                  <div className="hidden sm:block w-32 h-1.5 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                    <div
                      className="h-full rounded-full bg-[#CC0000]/70"
                      style={{ width: `${(count / topLocationMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 flex-shrink-0 text-right text-sm font-semibold text-[#F5F5F0]">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
