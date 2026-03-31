import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'

type AppUser = { id: number; email: string; display_name: string | null }
type StudentInfo = { id: number; name: string; email: string | null; app_user_id: number | null }
type EnrollmentRow = { id: number; class_id: number; student_id: number; students: StudentInfo | StudentInfo[] }

export default function Classes() {
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState<string>('')
  const [courseId, setCourseId] = useState<string>('')
  const [versionId, setVersionId] = useState<string>('')
  const [label, setLabel] = useState('')
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null)
  const [enrollUserId, setEnrollUserId] = useState<string>('')

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name')
      if (error) throw error
      return data as { id: number; name: string }[]
    },
  })

  const { data: courses } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, title_id')
        .order('name')
      if (error) throw error
      return data as { id: number; name: string; title_id: number | null }[]
    },
  })

  const selectedCourse = courseId ? courses?.find((c) => c.id === Number(courseId)) : null
  useEffect(() => {
    setVersionId('')
  }, [courseId])
  const { data: versions = [] } = useQuery({
    queryKey: ['story_versions', selectedCourse?.title_id],
    queryFn: async () => {
      const titleId = selectedCourse?.title_id
      if (!titleId) return []
      const { data, error } = await supabase
        .from('story_versions')
        .select('id, label, version_number')
        .eq('title_id', titleId)
        .order('version_number')
      if (error) throw error
      return (data ?? []) as { id: number; label: string; version_number: number }[]
    },
    enabled: !!selectedCourse?.title_id,
  })

  const { data: classesData, isLoading, error } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, level, label, course_id, version_id, created_at, clients (id, name), courses (id, name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const classVersionIds = [...new Set((classesData ?? []).map((c) => c.version_id).filter((id): id is number => id != null))]
  const { data: versionLabels = [] } = useQuery({
    queryKey: ['story_versions_labels', classVersionIds],
    queryFn: async () => {
      if (classVersionIds.length === 0) return []
      const { data, error } = await supabase
        .from('story_versions')
        .select('id, label')
        .in('id', classVersionIds)
      if (error) throw error
      return (data ?? []) as { id: number; label: string }[]
    },
    enabled: classVersionIds.length > 0,
  })
  const versionLabelById = Object.fromEntries(versionLabels.map((v) => [v.id, v.label]))

  const { data: enrollmentsByClass } = useQuery({
    queryKey: ['class_enrollments_counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_enrollments')
        .select('class_id')
      if (error) throw error
      const counts: Record<number, number> = {}
      for (const row of data ?? []) {
        counts[row.class_id] = (counts[row.class_id] ?? 0) + 1
      }
      return counts
    },
  })

  const { data: sessionsByClass } = useQuery({
    queryKey: ['class_sessions_counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_sessions')
        .select('class_id')
      if (error) throw error
      const counts: Record<number, number> = {}
      for (const row of data ?? []) {
        counts[row.class_id] = (counts[row.class_id] ?? 0) + 1
      }
      return counts
    },
  })

  const { data: appUsers = [] } = useQuery({
    queryKey: ['app_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, email, display_name')
        .order('email')
      if (error) throw error
      return data as AppUser[]
    },
  })

  const { data: enrollments = [] } = useQuery({
    queryKey: ['class_enrollments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_enrollments')
        .select('id, class_id, student_id, students(id, name, email, app_user_id)')
      if (error) throw error
      return (data ?? []) as EnrollmentRow[]
    },
  })

  const insertMutation = useMutation({
    mutationFn: async (payload: { client_id: number; course_id: number | null; version_id: number | null; label: string }) => {
      const { data, error } = await supabase
        .from('classes')
        .insert({
          client_id: payload.client_id,
          course_id: payload.course_id || null,
          version_id: payload.version_id || null,
          label: payload.label.trim() || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      setClientId('')
      setCourseId('')
      setVersionId('')
      setLabel('')
    },
  })

  const enrollMutation = useMutation({
    mutationFn: async ({ classId, appUserId }: { classId: number; appUserId: number }) => {
      const appUser = appUsers.find((u) => u.id === appUserId)
      if (!appUser) throw new Error('User not found')
      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('app_user_id', appUserId)
        .maybeSingle()
      let studentId: number
      if (existing) {
        studentId = existing.id
      } else {
        const name = appUser.display_name?.trim() || appUser.email
        const { data: newStudent, error: insErr } = await supabase
          .from('students')
          .insert({ name, email: appUser.email, app_user_id: appUserId })
          .select('id')
          .single()
        if (insErr) throw insErr
        studentId = newStudent.id
      }
      const { error: enrollErr } = await supabase
        .from('class_enrollments')
        .insert({ student_id: studentId, class_id: classId })
      if (enrollErr) throw enrollErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class_enrollments'] })
      queryClient.invalidateQueries({ queryKey: ['class_enrollments_counts'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setEnrollUserId('')
    },
  })

  const removeEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: number) => {
      const { error } = await supabase.from('class_enrollments').delete().eq('id', enrollmentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class_enrollments'] })
      queryClient.invalidateQueries({ queryKey: ['class_enrollments_counts'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cid = Number(clientId)
    const coid = courseId ? Number(courseId) : null
    const vid = versionId ? Number(versionId) : null
    if (cid) insertMutation.mutate({ client_id: cid, course_id: coid, version_id: vid, label })
  }

  if (isLoading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">Error: {formatError(error)}</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Classes</h1>

      <form onSubmit={handleSubmit} className="mb-8 p-4 border rounded bg-gray-50">
        <h2 className="text-sm font-medium text-gray-700 mb-3">New class</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select client...</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Course</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select course...</option>
              {courses?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {versions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Level (version)</label>
              <select
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select version...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. MOE Policy Group - Level 1"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={insertMutation.isPending || !clientId}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {insertMutation.isPending ? 'Adding...' : 'Add class'}
          </button>
        </div>
        {insertMutation.isError && (
          <p className="text-red-600 text-sm mt-2">{formatError(insertMutation.error)}</p>
        )}
      </form>

      <ul className="space-y-3">
        {classesData?.map((c) => {
          const rawClient = c.clients
          const client = Array.isArray(rawClient) ? rawClient[0] : rawClient
          const clientObj = client as { id: number; name: string } | null | undefined
          const rawCourse = c.courses
          const course = Array.isArray(rawCourse) ? rawCourse[0] : rawCourse
          const courseObj = course as { id: number; name: string } | null | undefined
          const levelLabel = c.version_id ? versionLabelById[c.version_id] : c.level
          const courseOrLevel = courseObj?.name ?? levelLabel ?? '—'
          const displayName = c.label || `${clientObj?.name ?? 'Unknown'} – ${courseOrLevel}`
          const studentCount = enrollmentsByClass?.[c.id] ?? 0
          const sessionCount = sessionsByClass?.[c.id] ?? 0
          const classEnrollments = enrollments.filter((e) => e.class_id === c.id)
          const getStudent = (e: EnrollmentRow): StudentInfo => {
            const s = e.students
            return Array.isArray(s) ? s[0] : s
          }
          const enrolledAppUserIds = new Set(
            classEnrollments
              .map((e) => getStudent(e)?.app_user_id)
              .filter((id): id is number => id != null)
          )
          const availableUsers = appUsers.filter((u) => !enrolledAppUserIds.has(u.id))
          const isExpanded = expandedClassId === c.id
          return (
            <li key={c.id} className="border rounded p-4 hover:bg-gray-50">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="font-medium">{displayName}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {clientObj?.name && <span>{clientObj.name}</span>}
                    {courseOrLevel !== '—' && (
                      <span className={clientObj?.name ? ' ml-2' : ''}>{courseOrLevel}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    {sessionCount} session(s) · {studentCount} student(s)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedClassId(isExpanded ? null : c.id)}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-100 shrink-0"
                >
                  {isExpanded ? 'Hide students' : 'Add students'}
                </button>
              </div>
              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Add user as student</label>
                      <select
                        value={enrollUserId}
                        onChange={(e) => setEnrollUserId(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                      >
                        <option value="">Select user...</option>
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.display_name || u.email} ({u.email})
                          </option>
                        ))}
                        {availableUsers.length === 0 && (
                          <option value="" disabled>
                            All users enrolled or no users
                          </option>
                        )}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const uid = Number(enrollUserId)
                        if (uid) enrollMutation.mutate({ classId: c.id, appUserId: uid })
                      }}
                      disabled={!enrollUserId || enrollMutation.isPending}
                      className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {enrollMutation.isPending ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                  {enrollMutation.isError && (
                    <p className="text-red-600 text-sm">{formatError(enrollMutation.error)}</p>
                  )}
                  <div>
                    <h4 className="text-xs font-medium text-gray-700 mb-1">Enrolled students</h4>
                    {classEnrollments.length > 0 ? (
                      <ul className="space-y-1">
                        {classEnrollments.map((e) => {
                          const s = getStudent(e)
                          if (!s) return null
                          return (
                            <li key={e.id} className="flex justify-between items-center text-sm">
                              <span>{s.name}{s.email ? ` (${s.email})` : ''}</span>
                              <button
                                type="button"
                                onClick={() => removeEnrollmentMutation.mutate(e.id)}
                                disabled={removeEnrollmentMutation.isPending}
                                className="text-red-600 hover:underline text-xs disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="text-gray-500 text-sm">No students enrolled yet.</p>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {!classesData?.length && (
        <p className="text-gray-500">No classes yet. Add clients and courses first, then add a class above.</p>
      )}
    </div>
  )
}
