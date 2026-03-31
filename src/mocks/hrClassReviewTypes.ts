/** Visual prototype types — aligned with student/class concepts; not persisted. */

export type HrStudentStatus = 'Active' | 'At Risk' | 'Inactive'

export type HrStudentRow = {
  id: number
  name: string
  email: string | null
  appUserId: number | null
  /** Current proficiency 1–6 (may be fractional e.g. 2.4) */
  level: number
  /** 0–100 */
  attendanceRate: number
  lessonsCompleted: number
  /** 0–100 */
  vocabProgress: number
  /** 0–100 */
  sentenceProgress: number
  /** 0–100 participation index */
  participationScore: number
  loginCount: number
  lastActiveDaysAgo: number
  achievementsCount: number
}

export type LevelOverTimePoint = {
  weekLabel: string
  averageLevel: number
}

export type HrClassSnapshot = {
  classLabel: string
  clientName: string
  asOfDate: string
  students: HrStudentRow[]
  levelOverTime: LevelOverTimePoint[]
}

export type HrStudentDerived = HrStudentRow & {
  status: HrStudentStatus
  isHighPerformer: boolean
  isLowEngagement: boolean
  insights: string[]
}
