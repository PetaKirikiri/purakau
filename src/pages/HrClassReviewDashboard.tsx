import { useMemo, type ReactNode } from 'react'
import type { IconType } from 'react-icons'
import {
  HiArrowPath,
  HiArrowTrendingUp,
  HiBolt,
  HiCalendarDays,
  HiChartBar,
  HiChartPie,
  HiExclamationTriangle,
  HiFlag,
  HiMoon,
  HiTrophy,
  HiUsers,
} from 'react-icons/hi2'
import { mockHrClassReview } from '../mocks/hrClassReviewMock'
import type { HrStudentDerived, HrStudentStatus } from '../mocks/hrClassReviewTypes'
import {
  ACTIVE_DAYS_THRESHOLD,
  AT_RISK_ATTENDANCE_PCT,
  HIGH_PERFORMER_MIN_ATTENDANCE,
  HIGH_PERFORMER_MIN_LEVEL,
  INACTIVE_DAYS_THRESHOLD,
  type ClassInsightsSummary,
  computeInsightSummary,
  computeKpis,
  enrichStudents,
  levelDistribution,
} from '../lib/hrClassReviewDerived'

const W = 420
const H = 220
const PAD_L = 44
const PAD_R = 16
const PAD_T = 20
const PAD_B = 36
const INNER_W = W - PAD_L - PAD_R
const INNER_H = H - PAD_T - PAD_B

const VOCAB_TARGET = 1000

function vocabWordsKnown(vocabProgressPct: number): number {
  return Math.min(
    VOCAB_TARGET,
    Math.max(0, Math.round((vocabProgressPct / 100) * VOCAB_TARGET))
  )
}

/** Attendance colour tiers (quick read: green on track, amber watch, red concern) */
const ATTENDANCE_GOOD_MIN_PCT = HIGH_PERFORMER_MIN_ATTENDANCE

type AttendanceTier = 'good' | 'caution' | 'poor'

function attendanceTier(pct: number): AttendanceTier {
  if (pct >= ATTENDANCE_GOOD_MIN_PCT) return 'good'
  if (pct >= AT_RISK_ATTENDANCE_PCT) return 'caution'
  return 'poor'
}

const attendanceTierClass: Record<
  AttendanceTier,
  { bar: string; track: string; text: string; icon: string }
> = {
  good: {
    bar: 'bg-emerald-500',
    track: 'bg-emerald-100',
    text: 'text-emerald-800',
    icon: 'text-emerald-600',
  },
  caution: {
    bar: 'bg-amber-500',
    track: 'bg-amber-100',
    text: 'text-amber-900',
    icon: 'text-amber-600',
  },
  poor: {
    bar: 'bg-red-600',
    track: 'bg-red-100',
    text: 'text-red-800',
    icon: 'text-red-600',
  },
}

const AVATAR_PALETTE = [
  'bg-slate-200 text-slate-800',
  'bg-stone-200 text-stone-800',
  'bg-zinc-200 text-zinc-800',
  'bg-neutral-200 text-neutral-900',
  'bg-slate-300 text-slate-900',
  'bg-gray-200 text-gray-800',
]

function statusSort(a: HrStudentDerived, b: HrStudentDerived): number {
  const rank = (s: HrStudentStatus) =>
    s === 'At Risk' ? 0 : s === 'Inactive' ? 1 : 2
  const d = rank(a.status) - rank(b.status)
  if (d !== 0) return d
  return a.name.localeCompare(b.name)
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? (parts[1]?.[0] ?? '') : (parts[0]?.[1] ?? '')
  return (a + b).toUpperCase() || '?'
}

function StudentAvatar({ id, name }: { id: number; name: string }) {
  const cls = AVATAR_PALETTE[Math.abs(id) % AVATAR_PALETTE.length]
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${cls}`}
      aria-hidden
    >
      {initialsFromName(name)}
    </span>
  )
}

function MicroBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-slate-600" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

function VocabOutOf1000({ vocabProgress }: { vocabProgress: number }) {
  const known = vocabWordsKnown(vocabProgress)
  const pct = (known / VOCAB_TARGET) * 100
  return (
    <div className="flex items-center gap-2">
      <MicroBar pct={pct} />
      <span className="tabular-nums text-slate-700">
        {known} / {VOCAB_TARGET}
      </span>
    </div>
  )
}

function AttendanceBar({ rate }: { rate: number }) {
  const tier = attendanceTier(rate)
  const cl = attendanceTierClass[tier]
  const label =
    tier === 'good' ? 'Attendance on track' : tier === 'caution' ? 'Attendance needs attention' : 'Attendance at risk'
  return (
    <div className="flex items-center gap-2" title={`${label} (${rate}%)`}>
      <div className={`h-2 w-[4.5rem] shrink-0 overflow-hidden rounded-full ${cl.track}`}>
        <div className={`h-full rounded-full ${cl.bar}`} style={{ width: `${Math.min(100, rate)}%` }} />
      </div>
      <span className={`min-w-[3rem] tabular-nums font-semibold ${cl.text}`}>{rate}%</span>
    </div>
  )
}

/** Discrete level 1–6 (rounded) with six step dots. */
function LevelExact({ level }: { level: number }) {
  const n = Math.min(6, Math.max(1, Math.round(level)))
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-base font-semibold tabular-nums tracking-tight text-slate-900">{n}</span>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i <= n ? 'bg-slate-700' : 'bg-slate-200'}`}
          />
        ))}
      </div>
    </div>
  )
}

function KpiTile({
  icon: Icon,
  label,
  value,
  valueClassName,
  hint,
  emphasize,
  footer,
}: {
  icon: IconType
  label: string
  value: string | number
  valueClassName?: string
  hint?: string
  emphasize?: boolean
  footer?: ReactNode
}) {
  return (
    <div
      className={`flex gap-3 rounded-xl border bg-white px-4 py-4 shadow-sm ${
        emphasize ? 'border-amber-400 ring-2 ring-amber-200/70' : 'border-slate-200'
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
          emphasize ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${valueClassName ?? 'text-slate-900'}`}>
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
        {footer}
      </div>
    </div>
  )
}

function ClassSnapshotBadges({ summary }: { summary: ClassInsightsSummary }) {
  const items: {
    n: number
    label: string
    icon: IconType
    card: string
  }[] = [
    {
      n: summary.atRiskCount,
      label: 'At risk',
      icon: HiExclamationTriangle,
      card: 'border-amber-200 bg-amber-50 text-amber-950',
    },
    {
      n: summary.inactiveCount,
      label: 'Inactive',
      icon: HiMoon,
      card: 'border-slate-200 bg-slate-100 text-slate-800',
    },
    {
      n: summary.highPerformerCount,
      label: 'Top performers',
      icon: HiTrophy,
      card: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    },
    {
      n: summary.lowEngagementCount,
      label: 'Low engagement',
      icon: HiFlag,
      card: 'border-orange-200 bg-orange-50 text-orange-950',
    },
  ]
  return (
    <div
      className="flex flex-wrap gap-3"
      aria-label="Class snapshot counts"
    >
      {items.map(({ n, label, icon: Icon, card }) => (
        <div
          key={label}
          className={`flex min-w-[140px] flex-1 items-center gap-3 rounded-full border px-4 py-2 shadow-sm sm:flex-initial ${card}`}
        >
          <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          <div className="min-w-0">
            <p className="text-lg font-semibold tabular-nums leading-none">{n}</p>
            <p className="mt-0.5 text-[11px] font-medium leading-tight opacity-90">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function LevelTrendChart({
  points,
}: {
  points: { weekLabel: string; averageLevel: number }[]
}) {
  const n = points.length
  const coords = useMemo(() => {
    const len = points.length
    if (len < 2) return { pts: '', circles: [] as { cx: number; cy: number }[] }
    const pts: string[] = []
    const circles: { cx: number; cy: number }[] = []
    for (let i = 0; i < len; i++) {
      const x = PAD_L + (i / (len - 1)) * INNER_W
      const lvl = Math.min(6, Math.max(1, Math.round(points[i].averageLevel)))
      const y = PAD_T + INNER_H - ((lvl - 1) / 5) * INNER_H
      pts.push(`${x},${y}`)
      circles.push({ cx: x, cy: y })
    }
    return { pts: pts.join(' '), circles }
  }, [points])

  const yTicks = [1, 2, 3, 4, 5, 6]

  return (
    <div className="flex gap-1 sm:gap-2">
      <span
        className="self-center py-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400 [writing-mode:vertical-rl] rotate-180"
        aria-hidden
      >
        Level
      </span>
      <svg
        className="h-auto w-full max-w-md flex-1 text-slate-600"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Class average level over time"
      >
        <rect x={0} y={0} width={W} height={H} fill="none" />
        {yTicks.map((tick) => {
          const y = PAD_T + INNER_H - ((tick - 1) / 5) * INNER_H
          return (
            <line
              key={tick}
              x1={PAD_L}
              y1={y}
              x2={PAD_L + INNER_W}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.12}
            />
          )
        })}
        <line
          x1={PAD_L}
          y1={PAD_T + INNER_H}
          x2={PAD_L + INNER_W}
          y2={PAD_T + INNER_H}
          stroke="currentColor"
          strokeOpacity={0.25}
        />
        <line
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={PAD_T + INNER_H}
          stroke="currentColor"
          strokeOpacity={0.25}
        />
        {yTicks.map((tick) => {
          const y = PAD_T + INNER_H - ((tick - 1) / 5) * INNER_H
          return (
            <text
              key={`y-${tick}`}
              x={PAD_L - 8}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-500 text-[10px]"
            >
              {tick}
            </text>
          )
        })}
        {points.map((p, i) => {
          const x = PAD_L + (n > 1 ? (i / (n - 1)) * INNER_W : INNER_W / 2)
          return (
            <text
              key={p.weekLabel}
              x={x}
              y={H - 10}
              textAnchor="middle"
              className="fill-slate-500 text-[9px]"
            >
              {p.weekLabel}
            </text>
          )
        })}
        {coords.pts && (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={coords.pts}
            className="text-slate-800"
          />
        )}
        {coords.circles.map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r={3.5} className="fill-slate-800" />
        ))}
      </svg>
    </div>
  )
}

function LevelDistributionBars({ dist }: { dist: Record<number, number> }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="space-y-2">
      {([1, 2, 3, 4, 5, 6] as const).map((lv) => {
        const count = dist[lv] ?? 0
        const pct = Math.round((count / total) * 100)
        return (
          <div key={lv} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 tabular-nums text-slate-600">Level {lv}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-sm bg-slate-100">
              <div
                className="h-full rounded-sm bg-slate-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums text-slate-600">
              {count} ({pct}%)
            </span>
          </div>
        )
      })}
    </div>
  )
}

function EngagementRow({ s }: { s: HrStudentDerived }) {
  const low = s.isLowEngagement
  const att = attendanceTierClass[attendanceTier(s.attendanceRate)]
  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm first:pt-0 ${
        low ? 'border-l-4 border-amber-400 bg-amber-50/60 pl-3 -ml-1 rounded-r-md' : ''
      }`}
    >
      {low ? (
        <HiFlag className="h-4 w-4 shrink-0 text-amber-700" aria-hidden title="Low engagement" />
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-[8rem] font-medium text-slate-900">{s.name}</span>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-slate-600">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <HiCalendarDays className={`h-4 w-4 ${att.icon}`} aria-hidden />
          <span className={`font-semibold ${att.text}`}>{s.attendanceRate}%</span>
          <span className="sr-only">attendance</span>
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <HiArrowPath className="h-4 w-4 text-slate-400" aria-hidden />
          <span>{s.loginCount}</span>
          <span className="text-xs text-slate-400">logins</span>
        </span>
      </div>
    </li>
  )
}

function ScoringDetails() {
  return (
    <details className="group rounded-lg border border-slate-200 bg-slate-50/80 text-sm text-slate-700">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="underline decoration-slate-300 underline-offset-2 group-open:no-underline">
          How scores are calculated
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-200 px-3 py-3 text-xs leading-relaxed text-slate-600">
        <p>
          <strong className="text-slate-800">At risk:</strong> attendance below {AT_RISK_ATTENDANCE_PCT}%,
          or no activity in over {ACTIVE_DAYS_THRESHOLD} days.
        </p>
        <p>
          <strong className="text-slate-800">Inactive:</strong> no activity in over{' '}
          {INACTIVE_DAYS_THRESHOLD} days.
        </p>
        <p>
          <strong className="text-slate-800">Top performer:</strong> level at least{' '}
          {HIGH_PERFORMER_MIN_LEVEL} and attendance at least {HIGH_PERFORMER_MIN_ATTENDANCE}%.
        </p>
        <p>
          <strong className="text-slate-800">Attendance colours:</strong> green ≥{ATTENDANCE_GOOD_MIN_PCT}%,
          amber {AT_RISK_ATTENDANCE_PCT}%–{ATTENDANCE_GOOD_MIN_PCT - 1}%, red below {AT_RISK_ATTENDANCE_PCT}%.
        </p>
        <p>
          <strong className="text-slate-800">Vocab column:</strong> words recognised mapped from progress to a{' '}
          {VOCAB_TARGET}-word programme target (prototype scale).
        </p>
      </div>
    </details>
  )
}

export default function HrClassReviewDashboard() {
  const snapshot = mockHrClassReview
  const enriched = useMemo(() => enrichStudents(snapshot.students).sort(statusSort), [snapshot.students])
  const kpis = useMemo(() => computeKpis(snapshot), [snapshot])
  const dist = useMemo(() => levelDistribution(snapshot.students), [snapshot.students])
  const insightSummary = useMemo(() => computeInsightSummary(enriched), [enriched])
  const needsAttention = insightSummary.atRiskCount > 0

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Class review</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{snapshot.classLabel}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {snapshot.clientName} · Snapshot {snapshot.asOfDate}
          </p>
        </header>

        <section
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          aria-label="Student roster"
        >
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Students</h2>
            <p className="mt-0.5 text-xs text-slate-500">At-risk and inactive rows sort to the top</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
              <span className="font-medium text-slate-700">Attendance:</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                Good ≥{ATTENDANCE_GOOD_MIN_PCT}%
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                Watch {AT_RISK_ATTENDANCE_PCT}–{ATTENDANCE_GOOD_MIN_PCT - 1}%
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-600" aria-hidden />
                Concern below {AT_RISK_ATTENDANCE_PCT}%
              </span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Learner</th>
                  <th className="px-4 py-3 tabular-nums">Level</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3 tabular-nums">Words / {VOCAB_TARGET}</th>
                  <th className="px-4 py-3">Recognition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enriched.map((s) => (
                  <tr key={s.id} className={s.isLowEngagement ? 'bg-amber-50/50' : undefined}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <StudentAvatar id={s.id} name={s.name} />
                        <span className="font-medium text-slate-900">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <LevelExact level={s.level} />
                    </td>
                    <td className="px-4 py-3">
                      <AttendanceBar rate={s.attendanceRate} />
                    </td>
                    <td className="px-4 py-3">
                      <VocabOutOf1000 vocabProgress={s.vocabProgress} />
                    </td>
                    <td className="px-4 py-3">
                      {s.isHighPerformer ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-900">
                          <HiTrophy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Top performer
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <ClassSnapshotBadges summary={insightSummary} />

        <section aria-label="Summary KPIs" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiTile icon={HiUsers} label="Enrolled" value={kpis.totalStudents} hint="In this class" />
          <KpiTile
            icon={HiBolt}
            label={`Active (≤${ACTIVE_DAYS_THRESHOLD}d)`}
            value={`${kpis.pctActive}%`}
            hint="Recent logins"
          />
          <KpiTile
            icon={HiChartBar}
            label="Average level"
            value={kpis.averageLevel}
            hint="Across class"
          />
          <KpiTile
            icon={HiCalendarDays}
            label="Avg attendance"
            value={`${kpis.averageAttendance}%`}
            valueClassName={attendanceTierClass[attendanceTier(kpis.averageAttendance)].text}
            hint="Sessions to date · colour matches band"
          />
          <KpiTile
            icon={HiArrowTrendingUp}
            label="Overall progress"
            value={`${kpis.overallProgressPct}%`}
            hint={needsAttention ? 'Review at-risk learners' : 'Composite proficiency'}
            emphasize={needsAttention}
            footer={
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-slate-800"
                  style={{ width: `${kpis.overallProgressPct}%` }}
                />
              </div>
            }
          />
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section
            className="space-y-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            aria-label="Progress and distribution"
          >
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <HiArrowTrendingUp className="h-4 w-4" aria-hidden />
                </span>
                Progress over time
              </h2>
              <p className="mt-1 text-xs text-slate-500">Class average level by week</p>
              <div className="mt-4">
                <LevelTrendChart points={snapshot.levelOverTime} />
              </div>
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <HiChartPie className="h-4 w-4" aria-hidden />
                </span>
                Students by level
              </h2>
              <p className="mt-1 text-xs text-slate-500">Current level band</p>
              <div className="mt-4">
                <LevelDistributionBars dist={dist} />
              </div>
            </div>
          </section>

          <section
            className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            aria-label="Engagement and insights"
          >
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <HiBolt className="h-4 w-4" aria-hidden />
                </span>
                Engagement
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Attendance and logins · border highlights low engagement
              </p>
              <ul className="mt-2 divide-y divide-slate-100">{enriched.map((s) => <EngagementRow key={s.id} s={s} />)}</ul>
            </div>
            <ScoringDetails />
          </section>
        </div>
      </div>
    </div>
  )
}
