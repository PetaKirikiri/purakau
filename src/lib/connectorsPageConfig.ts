/**
 * Connectors page only. Golden-grid construction sandbox.
 * Not shared with connector design system (StoryEditor, token underlines).
 *
 * viewBox: 0 0 162 100. Display: 388×240. 1 unit ≈ 2.4px.
 */

/** Dot at each grid node: diameter in pixels. Fixed size, not affected by SVG viewBox. */
export const GRID_NODE_DOT_SIZE_PX = 4

/** Placed circles (Circle button): scale factor. 1 = full circle through both points. */
export const PLACED_CIRCLE_SCALE = 1

/** Stroke width for grid lines and nested squares. */
export const GRID_STROKE_WIDTH = 0.5

/** Stroke width for placed lines and circles. */
export const LINE_STROKE_WIDTH = 1

/** Outer rect stroke opacity. */
export const GRID_OPACITY = 0.2

/** Nested square stroke opacity. */
export const SQUARE_OPACITY = 0.15

/** Selected node fill color. */
export const SELECTED_NODE_COLOR = 'blue'
