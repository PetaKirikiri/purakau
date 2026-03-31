/** Fixed highlight matching the token rect; sits above the popover backdrop so the target word stays obvious. */
export function TokenHoverHighlight({ rect }: { rect: DOMRect }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[101] rounded-sm shadow-[0_0_0_2px_rgba(37,99,235,0.45),0_0_14px_rgba(37,99,235,0.35)] ring-2 ring-blue-600 ring-offset-2 ring-offset-transparent transition-opacity duration-150"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    />
  )
}
