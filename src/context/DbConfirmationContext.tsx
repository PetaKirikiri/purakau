import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

export type DbConfirmation = {
  tables: string[]
  details: string[]
  type?: 'success' | 'error'
}

const DbConfirmationContext = createContext<{
  show: (conf: DbConfirmation) => void
} | null>(null)

export function DbConfirmationProvider({ children }: { children: ReactNode }) {
  const [confirmation, setConfirmation] = useState<DbConfirmation | null>(null)

  const show = useCallback((conf: DbConfirmation) => {
    setConfirmation(conf)
    setTimeout(() => setConfirmation(null), 5000)
  }, [])

  return (
    <DbConfirmationContext.Provider value={{ show }}>
      {children}
      {confirmation && (
        <div
          className={`fixed right-4 top-20 z-[100] flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg ${
            confirmation.type === 'error'
              ? 'border-red-600 bg-red-50'
              : 'border-green-600 bg-green-50'
          }`}
          role="status"
          aria-live="polite"
        >
          {confirmation.type === 'error' ? (
            <span className="text-xl text-red-600" aria-hidden>✗</span>
          ) : (
            <span className="text-xl text-green-600" aria-hidden>✓</span>
          )}
          <div className="flex flex-col gap-0.5">
            <span className={`text-sm font-semibold ${confirmation.type === 'error' ? 'text-red-800' : 'text-green-800'}`}>
              {confirmation.type === 'error' ? 'Save failed' : 'DB saved'}
            </span>
            <span className={`text-xs ${confirmation.type === 'error' ? 'text-red-700' : 'text-green-700'}`}>
              {confirmation.details?.length ? confirmation.details.join(' · ') : confirmation.tables.join(' · ')}
            </span>
          </div>
        </div>
      )}
    </DbConfirmationContext.Provider>
  )
}

export function useDbConfirmation() {
  const ctx = useContext(DbConfirmationContext)
  if (!ctx) throw new Error('useDbConfirmation must be used within DbConfirmationProvider')
  return ctx
}
