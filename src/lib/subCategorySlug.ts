/** Stable slug for sub_categories.slug from user-facing label. */
export function slugifySubCategory(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'theme'
}
