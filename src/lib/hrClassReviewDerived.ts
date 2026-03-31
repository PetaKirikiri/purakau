import type {
  HrClassSnapshot,
  HrStudentDerived,
  HrStudentRow,
  HrStudentStatus,
} from '../mocks/hrClassReviewTypes'

/** Active if last activity within this many days */
export const ACTIVE_DAYS_THRESHOLD = 7
/** Inactive if last activity beyond this */
export const INACTIVE_DAYS_THRESHOLD = 14
export const AT_RISK_ATTENDANCE_PCT = 70
export const HIGH_PERFORMER_MIN_LEVEL = 3.2
export const HIGH_PERFORMER_MIN_ATTENDANCE = 85
export const LOW_ENGAGEMENT_ATTENDANCE = 72
/** Bottom fraction by composite engagement score flagged “low engagement” */
export const LOW_ENGAGEMENT_BOTTOM_FRACTION = 0.2

export function deriveStudentRow(s: HrStudentRow): HrStudentDerived {
  const insights: string[] = []
  let status: HrStudentStatus = 'Active'

  if (s.lastActiveDaysAgo > INACTIVE_DAYS_THRESHOLD) {
    status = 'Inactive'
    insights.push('Inactive — no recent logins')
  } else if (
    s.attendanceRate < AT_RISK_ATTENDANCE_PCT ||
    s.lastActiveDaysAgo > ACTIVE_DAYS_THRESHOLD
  ) {
    status = 'At Risk'
    if (s.attendanceRate < AT_RISK_ATTENDANCE_PCT) insights.push('Low attendance')
    if (s.lastActiveDaysAgo > ACTIVE_DAYS_THRESHOLD) insights.push('Stale activity')
  }

  const isHighPerformer =
    s.level >= HIGH_PERFORMER_MIN_LEVEL && s.attendanceRate >= HIGH_PERFORMER_MIN_ATTENDANCE

  if (isHighPerformer) insights.push('High performer')

  return {
    ...s,
    status,
    isHighPerformer,
    insights,
    isLowEngagement: false,
  }
}

function engagementScore(s: HrStudentRow): number {
  return s.attendanceRate * 0.6 + Math.min(s.loginCount * 2, 40)
}

export function markLowEngagement(rows: HrStudentDerived[]): HrStudentDerived[] {
  const withScores = rows.map((r) => ({
    row: r,
    score: engagementScore(r),
  }))
  withScores.sort((a, b) => a.score - b.score)
  const cut = Math.max(1, Math.ceil(withScores.length * LOW_ENGAGEMENT_BOTTOM_FRACTION))
  const lowIds = new Set(withScores.slice(0, cut).map((x) => x.row.id))

  return rows.map((r) => {
    const thresholdLow = r.attendanceRate < LOW_ENGAGEMENT_ATTENDANCE
    const isLow = lowIds.has(r.id) || thresholdLow
    if (isLow && !r.insights.includes('Low engagement')) {
      const nextInsights = [...r.insights]
      if (thresholdLow || lowIds.has(r.id)) nextInsights.unshift('Low engagement')
      return { ...r, isLowEngagement: true, insights: nextInsights }
    }
    return { ...r, isLowEngagement: isLow }
  })
}

export function enrichStudents(students: HrStudentRow[]): HrStudentDerived[] {
  const derived = students.map((s) => deriveStudentRow(s))
  return markLowEngagement(derived)
}

export type ClassKpis = {
  totalStudents: number
  pctActive: number
  averageLevel: number
  averageAttendance: number
  overallProgressPct: number
}

export function computeKpis(snapshot: HrClassSnapshot): ClassKpis {
  const { students } = snapshot
  const n = students.length
  const activeCount = students.filter((s) => s.lastActiveDaysAgo <= ACTIVE_DAYS_THRESHOLD).length
  const avgLevel = n ? students.reduce((acc, s) => acc + s.level, 0) / n : 0
  const avgAtt = n ? students.reduce((acc, s) => acc + s.attendanceRate, 0) / n : 0
  const levelPart = (avgLevel / 6) * 100
  const vocabPart =
    n > 0 ? students.reduce((acc, s) => acc + s.vocabProgress, 0) / n : 0
  const sentPart =
    n > 0 ? students.reduce((acc, s) => acc + s.sentenceProgress, 0) / n : 0
  const overallProgressPct = Math.round(
    Math.min(100, levelPart * 0.35 + vocabPart * 0.325 + sentPart * 0.325)
  )
  return {
    totalStudents: n,
    pctActive: n ? Math.round((activeCount / n) * 100) : 0,
    averageLevel: Math.round(avgLevel),
    averageAttendance: Math.round(avgAtt),
    overallProgressPct,
  }
}

/** Levels 1–6: discrete band from rounded level */
export function levelDistribution(students: HrStudentRow[]): Record<number, number> {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  for (const s of students) {
    const b = Math.min(6, Math.max(1, Math.round(s.level)))
    dist[b] += 1
  }
  return dist
}

export type ClassInsightsSummary = {
  atRiskCount: number
  inactiveCount: number
  highPerformerCount: number
  lowEngagementCount: number
}

export function computeInsightSummary(enriched: HrStudentDerived[]): ClassInsightsSummary {
  return {
    atRiskCount: enriched.filter((s) => s.status === 'At Risk').length,
    inactiveCount: enriched.filter((s) => s.status === 'Inactive').length,
    highPerformerCount: enriched.filter((s) => s.isHighPerformer).length,
    lowEngagementCount: enriched.filter((s) => s.isLowEngagement).length,
  }
}
