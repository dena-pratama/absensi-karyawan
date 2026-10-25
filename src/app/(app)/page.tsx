import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CountUp, GrowBar } from "@/components/dashboard-motion";
import { PageBody, PageHeader, PageTabs } from "@/components/shell/page-layout";
import { getDashboardStats, getRangeSummary, type BranchStats, type StaffToday } from "@/lib/data/dashboard";
import { getShellData } from "@/lib/data/shell";
import { formatDateLong, formatTimeWIB, initials, parseDateParam, shiftDay, todayWIB } from "@/lib/format";
import { ATTENDANCE_LABEL, BRANCH_TYPE_LABEL } from "@/lib/labels";
import { getMyAccess } from "@/lib/data/access";
import { getBackups } from "@/lib/data/backup";
import { createClient } from "@/lib/supabase/server";
import { AiInsightCard } from "./_components/ai-insight-card";
import { DashboardControls } from "./_components/dashboard-controls";
import { TodaySummary } from "./_components/today-summary";
import { BranchCarousel, type BranchCard } from "./_components/branch-carousel";

export const metadata: Metadata = { title: "Dashboard" };

const TABS = [
  { label: "Overview Hub", href: "/", active: true },
  { label: "Absensi Operasional", href: "/absensi" },
];

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader
        crumb={
          <Suspense fallback="…">
            <ActiveBranchCode />
          </Suspense>
        }
        current="Dashboard Ekspedisi & Hub"
        title="Ringkasan Operasional Hub & Cabang Ekspedisi"
        actions={<PageTabs items={TABS} />}
      />
      <PageBody>
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

/**
 * Data ringkasan untuk rentang & lingkup terpilih: rekap kehadiran (+ periode sebelumnya),
 * backup yang aktif di rentang itu, kasbon menunggu (khusus admin; lingkup cabang = karyawan cabang itu).
 */
async function getSummaryData(
  scoped: BranchStats[],
  from: string,
  to: string,
  isAdmin: boolean,
  scope: { branchId: string; employeeIds: string[] } | null, // null = global
) {
  const supabase = await createClient();
  let kasbonQuery = supabase.from("kasbon").select("id", { count: "exact", head: true }).eq("status", "diajukan");
  if (scope) kasbonQuery = kasbonQuery.in("employee_id", scope.employeeIds.length ? scope.employeeIds : ["00000000-0000-0000-0000-000000000000"]);
  const [summary, { rows: backups }, kasbon] = await Promise.all([
    getRangeSummary(scoped, from, to),
    getBackups({ from, to }),
    isAdmin ? kasbonQuery : null,
  ]);
  return {
    summary,
    extras: {
      backups: (scope ? backups.filter((b) => b.toBranchId === scope.branchId || b.fromBranchId === scope.branchId) : backups).length,
      kasbonPending: kasbon && !kasbon.error ? (kasbon.count ?? 0) : null,
    },
  };
}

async function ActiveBranchCode() {
  const { activeBranch } = await getShellData();
  return activeBranch?.code ?? "Semua Cabang";
}

async function DashboardContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const [{ branches, activeBranch }, { role }, params] = await Promise.all([getShellData(), getMyAccess(), searchParams]);
  const now = todayWIB();
  // Rentang (?dari=&sampai=, atau ?tanggal= lama) tidak boleh di masa depan; maks. 93 hari.
  // Bagian dashboard lain (kartu cabang, persentase, absensi terkini) memakai tanggal akhir.
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const clamp = (d: string) => (d > now ? now : d);
  const to = clamp(parseDateParam(param("sampai") ?? param("tanggal"), now));
  let from = clamp(parseDateParam(param("dari") ?? param("tanggal"), to));
  if (from > to) from = to;
  if (shiftDay(from, 92) < to) from = shiftDay(to, -92);
  const today = to;
  const global = params.lingkup === "global";
  const stats = await getDashboardStats(branches, today);
  const showInsight = (role === "admin" || role === "office") && activeBranch;
  const activeStats = stats.find((s) => s.id === activeBranch?.id) ?? null;
  const scope = global || !activeStats ? null : { branchId: activeStats.id, employeeIds: activeStats.staff.map((x) => x.employeeId) };
  const scoped = scope ? stats.filter((s) => s.id === scope.branchId) : stats;
  const summary = showInsight ? await getSummaryData(scoped, from, to, role === "admin", scope) : null;
  const active = stats.find((s) => s.id === activeBranch?.id) ?? null;
  const aktifCount = stats.filter((s) => s.status === "aktif").length;

  const cards: BranchCard[] = stats.map((s) => ({
    id: s.id,
    title: `${s.code} - ${s.name}`,
    subtitle: BRANCH_TYPE_LABEL[s.branch_type],
    hadir: s.hadir,
    total: s.total,
    percent: s.percent,
    avatars: s.staff.slice(0, 3).map((x) => initials(x.name)),
    more: Math.max(0, s.total - 3),
  }));

  return (
    <>
      {/* Admin & Office: ringkasan semua cabang (kiri) + AI Insight cabang aktif (kanan, dimuat terpisah) */}
      {showInsight && summary && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
          <div className="xl:col-span-7">
            <TodaySummary
              summary={summary.summary}
              isToday={from === now && to === now}
              scopeLabel={scope ? activeBranch.code : "Semua cabang"}
              extras={summary.extras}
              controls={<DashboardControls from={from} to={to} today={now} global={!scope} branchCode={activeBranch.code} />}
            />
          </div>
          <div className="xl:col-span-5">
            <AiInsightCard key={activeBranch.id} branchCode={activeBranch.code} />
          </div>
        </div>
      )}

      {/* Data Cabang */}
      <section aria-labelledby="cabang-heading">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <h2 id="cabang-heading" className="text-lg font-bold text-ink tracking-tight">
              Data Cabang Ekspedisi
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20">
              {aktifCount} Aktif / Monitoring
            </span>
          </div>
        </div>
        {cards.length ? (
          <BranchCarousel cards={cards} />
        ) : (
          <EmptyCard
            text="Belum ada cabang terdaftar."
            link={{ href: "/pengaturan", label: "Tambah cabang di Pengaturan" }}
          />
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        <AttendanceByBranch stats={stats} dateLabel={today === now ? "Hari Ini" : formatDateLong(today).replace(/^[^,]+, /, "")} />
        <RecentAttendance branch={active} today={today} />
      </div>
    </>
  );
}

/* ----------------------------- Persentase kehadiran ----------------------------- */

// ≥95% cyan (optimal), 85–94% amber (perlu perhatian), <85% rose (kritis)
function tone(percent: number) {
  if (percent >= 95)
    return {
      text: "text-cyan-400",
      sub: "text-gray-400",
      bar: "bg-gradient-to-r from-cyan-400 to-teal-400 shadow-[0_0_8px_rgba(0,210,255,0.6)]",
    };
  if (percent >= 85)
    return {
      text: "text-amber-200",
      sub: "text-amber-200",
      bar: "bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
    };
  return {
    text: "text-rose-400",
    sub: "text-rose-300",
    bar: "bg-gradient-to-r from-rose-500 to-pink-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]",
  };
}

function globalBadge(percent: number | null) {
  if (percent === null) return { label: "Belum Ada Data", cls: "bg-gray-500/10 text-gray-400 border-gray-500/30" };
  if (percent >= 95) return { label: "Optimal", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
  if (percent >= 85) return { label: "Perlu Perhatian", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" };
  return { label: "Kritis", cls: "bg-rose-500/10 text-rose-400 border-rose-500/30" };
}

function AttendanceByBranch({ stats, dateLabel }: { stats: BranchStats[]; dateLabel: string }) {
  const withStaff = stats.filter((s) => s.total > 0);
  const totalStaff = withStaff.reduce((n, s) => n + s.total, 0);
  const totalHadir = withStaff.reduce((n, s) => n + s.hadir, 0);
  const globalPercent = totalStaff ? Math.round((totalHadir / totalStaff) * 100) : null;
  const badge = globalBadge(globalPercent);
  const sorted = [...withStaff].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));

  return (
    <section aria-labelledby="persen-heading" className="lg:col-span-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="persen-heading" className="text-lg font-bold text-ink tracking-tight">
          Persentase Kehadiran Cabang
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-medium bg-panel px-2.5 py-1 rounded-lg border border-cyan-500/20 shadow-sm flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00d2ff]" />
          {dateLabel}
        </div>
      </div>

      <div className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-4 h-full hover:border-line-strong transition">
        <div className="flex items-center justify-between p-3 rounded-xl bg-panel-raised border border-line-strong">
          <div className="flex items-center gap-3">
            <div className="min-w-9 h-9 px-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm tabular-nums">
              {globalPercent === null ? "–" : <CountUp value={globalPercent} />}
            </div>
            <div>
              <div className="text-xs font-bold text-gray-100">Rata-rata Kehadiran Global</div>
              <div className="text-[10px] text-gray-400">{stats.length} Hub &amp; Cabang Ekspedisi Aktif</div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls}`}>{badge.label}</span>
        </div>

        {sorted.length ? (
          <div className="flex flex-col gap-3.5">
            {sorted.map((s, i) => {
              const t = tone(s.percent ?? 0);
              return (
                <div key={s.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-gray-200 truncate">{s.code}</span>
                      <span className="text-[11px] text-gray-400 truncate">· {s.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                      <span className={`text-[10px] ${t.sub}`}>
                        {s.hadir}/{s.total} Staf
                      </span>
                      <span className={`text-xs font-bold ${t.text}`}>
                        <CountUp value={s.percent ?? 0} delay={0.1 + i * 0.06} />
                      </span>
                    </div>
                  </div>
                  <div
                    className="w-full h-2 rounded-full bg-panel-raised overflow-hidden border border-line-strong"
                    role="progressbar"
                    aria-label={`Kehadiran ${s.code}`}
                    aria-valuenow={s.percent ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <GrowBar percent={s.percent ?? 0} index={i} className={`h-full rounded-full ${t.bar}`} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-4 text-center">Belum ada karyawan yang ditempatkan di cabang.</p>
        )}
      </div>
    </section>
  );
}

/* ----------------------------- Absensi terkini ----------------------------- */

const AVATAR_TONES = [
  "bg-purple-900/80 text-purple-200 border-purple-500/30",
  "bg-indigo-900/80 text-indigo-200 border-indigo-500/30",
  "bg-teal-900/80 text-teal-200 border-teal-500/30",
  "bg-amber-900/80 text-amber-200 border-amber-500/30",
  "bg-sky-900/80 text-sky-200 border-sky-500/30",
  "bg-rose-900/80 text-rose-200 border-rose-500/30",
];

const STATUS_PILL: Record<string, { pill: string; dot: string }> = {
  hadir: { pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
  sakit: { pill: "bg-amber-500/10 text-amber-400 border-amber-500/30", dot: "bg-amber-400" },
  tidak_hadir: { pill: "bg-rose-500/10 text-rose-400 border-rose-500/30", dot: "bg-rose-400" },
  belum: { pill: "bg-gray-500/10 text-gray-400 border-gray-500/30", dot: "bg-gray-500" },
};

const RECENT_LIMIT = 6;

function StatusPill({ staff }: { staff: StaffToday }) {
  const key = staff.status ?? "belum";
  const s = STATUS_PILL[key];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {staff.status ? ATTENDANCE_LABEL[staff.status] : "Belum Diabsen"}
    </span>
  );
}

function RecentAttendance({ branch, today }: { branch: BranchStats | null; today: string }) {
  const rows = branch?.staff.slice(0, RECENT_LIMIT) ?? [];

  return (
    <section aria-labelledby="terkini-heading" className="lg:col-span-7 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 id="terkini-heading" className="text-lg font-bold text-ink tracking-tight">
          Absensi Outlet Terkini
        </h2>
        <Link
          href="/absensi"
          className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
        >
          Lihat semua
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          </svg>
        </Link>
      </div>

      <div className="bg-panel border border-line rounded-2xl p-5 flex flex-col h-full">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <span>{branch ? `Hub ${branch.code}` : "Belum ada cabang"}</span>
            <span className="text-gray-500 font-normal">&gt;</span>
            <span className="text-cyan-400">{formatDateLong(today)}</span>
          </div>
          <span className="text-[11px] font-medium text-gray-400">
            {branch?.lastUpdate ? `Terakhir update: ${formatTimeWIB(branch.lastUpdate)}` : "Belum ada absensi hari ini"}
          </span>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto -mx-2">
            <div className="min-w-[420px]">
              <div className="grid grid-cols-12 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-line pb-2.5 mb-2 px-4">
                <div className="col-span-5">Karyawan &amp; Posisi</div>
                <div className="col-span-4">Status Kehadiran</div>
                <div className="col-span-3 text-right">Aksi</div>
              </div>
              <ul className="divide-y divide-line/60 px-2">
                {rows.map((s, i) => (
                  <li
                    key={s.employeeId}
                    className="grid grid-cols-12 items-center py-2.5 px-2 hover:bg-panel-raised/50 rounded-lg transition"
                  >
                    <div className="col-span-5 flex items-center gap-3 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-full border text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                          AVATAR_TONES[i % AVATAR_TONES.length]
                        }`}
                      >
                        {initials(s.name)}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-gray-100 block truncate">{s.name}</span>
                        <span className={`text-[10px] block truncate ${i === 0 ? "text-cyan-400" : "text-gray-400"}`}>
                          {s.role}
                        </span>
                      </div>
                    </div>
                    <div className="col-span-4">
                      <StatusPill staff={s} />
                    </div>
                    <div className="col-span-3 text-right">
                      <Link
                        href="/absensi"
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-panel-raised hover:bg-panel-raised text-cyan-400 border border-cyan-500/30 rounded-lg text-[11px] font-medium transition"
                      >
                        Edit
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                        </svg>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-6 text-center">
            {branch ? "Belum ada karyawan di cabang ini." : "Tambahkan cabang dan karyawan terlebih dahulu."}
          </p>
        )}
      </div>
    </section>
  );
}

/* ----------------------------- Empty & loading ----------------------------- */

function EmptyCard({ text, link }: { text: string; link: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-panel p-8 text-center flex flex-col items-center gap-2">
      <p className="text-sm text-gray-300">{text}</p>
      <Link href={link.href} className="text-xs font-semibold text-cyan-400 hover:text-cyan-300">
        {link.label} →
      </Link>
    </div>
  );
}

function DashboardSkeleton() {
  const block = "rounded-2xl bg-panel border border-line animate-pulse";
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${block} h-[170px]`} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        <div className={`${block} lg:col-span-5 h-80`} />
        <div className={`${block} lg:col-span-7 h-80`} />
      </div>
    </>
  );
}
