import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'

export default function Students() {
  const { data: students, isLoading, error } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, email, app_user_id, created_at')
        .order('name')
      if (error) throw error
      return data as { id: number; name: string; email: string | null; app_user_id: number | null; created_at: string }[]
    },
  })

  const { data: enrollmentsByStudent } = useQuery({
    queryKey: ['class_enrollments_by_student'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_enrollments')
        .select('student_id')
      if (error) throw error
      const counts: Record<number, number> = {}
      for (const row of data ?? []) {
        counts[row.student_id] = (counts[row.student_id] ?? 0) + 1
      }
      return counts
    },
  })

  if (isLoading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">Error: {formatError(error)}</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Students</h1>
      <ul className="space-y-3">
        {students?.map((s) => {
          const classCount = enrollmentsByStudent?.[s.id] ?? 0
          return (
            <li
              key={s.id}
              className="border rounded p-4 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{s.name}</span>
                {s.app_user_id != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                    from user
                  </span>
                )}
              </div>
              {s.email && (
                <div className="text-sm text-gray-500 mt-1">{s.email}</div>
              )}
              <div className="text-xs text-gray-400 mt-2">
                {classCount} class{classCount !== 1 ? 'es' : ''} enrolled
              </div>
            </li>
          )
        })}
      </ul>
      {!students?.length && (
        <p className="text-gray-500">No students yet. Add students to classes from the Classes page (select users to enroll).</p>
      )}
    </div>
  )
}
