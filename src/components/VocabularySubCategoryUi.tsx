import { useState } from 'react'

export type SubCategoryRow = { id: number; slug: string; label: string | null }

export function SubCategoryCatToggle({
  open,
  onToggle,
  className = '',
}: {
  open: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${
        open ? 'bg-amber-100 border-amber-400' : 'border-gray-300 hover:bg-gray-50'
      } ${className}`.trim()}
      title="Sub-categories (themes: family, nature, …)"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      Cat
    </button>
  )
}

export type SubCategoryCatEditorProps = {
  open: boolean
  subCategoriesAssigned: SubCategoryRow[]
  onUnassignSubCategory: (subCategoryId: number) => void
  onCreateSubCategory: (displayName: string) => void
  subCategoryBusy?: boolean
  /** Extra classes on the outer panel (e.g. padding). */
  className?: string
}

export function SubCategoryCatEditor({
  open,
  subCategoriesAssigned,
  onUnassignSubCategory,
  onCreateSubCategory,
  subCategoryBusy,
  className = '',
}: SubCategoryCatEditorProps) {
  const [newCatName, setNewCatName] = useState('')
  if (!open) return null
  return (
    <div
      className={`border-t border-gray-100 pt-2 space-y-2 text-xs ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div className="flex flex-wrap items-center gap-1">
        {subCategoriesAssigned.length ? (
          subCategoriesAssigned.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200"
            >
              {s.label?.trim() || s.slug}
              <button
                type="button"
                className="text-amber-800 hover:text-red-600 leading-none disabled:opacity-50"
                disabled={subCategoryBusy}
                title={`Remove ${s.slug}`}
                onClick={() => onUnassignSubCategory(s.id)}
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-gray-500">No sub-categories yet.</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          placeholder="Theme (e.g. family) — matches existing by name"
          className="px-2 py-1 text-xs border rounded flex-1 min-w-[8rem]"
          disabled={subCategoryBusy}
          autoComplete="off"
        />
        <button
          type="button"
          className="px-2 py-1 text-xs border rounded bg-white hover:bg-gray-50 disabled:opacity-50"
          disabled={subCategoryBusy || !newCatName.trim()}
          onClick={() => {
            const n = newCatName.trim()
            if (!n) return
            onCreateSubCategory(n)
            setNewCatName('')
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
