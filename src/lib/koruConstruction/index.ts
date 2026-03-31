/**
 * Koru construction system: circle-grammar SVG shapes.
 *
 * Design language (3 hard rules):
 * 1. Approved parts only - every curve traces to a numbered circle in the library.
 * 2. Approved placement only - circle centers snap to the anchor lattice.
 * 3. Approved operations only - place, intersect, subtract, clip, retain arc, discard arc.
 *
 * Structure:
 * - Zone: golden rectangle (default 162×100)
 * - Anchor lattice: corners, edge midpoints, center, quarter-grid (q-tl, q-tr, q-bl, q-br)
 * - Circle library: c1..c8, radii in golden-ratio progression (r, r×φ, r×φ², ...)
 * - Build instruction: place circles at anchors, then subtract/intersect/retain arcs
 *
 * Output: JSON construction first, then SVG path + metadata.
 */

export * from './types'
export * from './goldenGrid'
export * from './anchors'
export * from './library'
export * from './builder'
export * from './json'
export * from './recipes'
