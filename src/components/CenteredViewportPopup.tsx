import type { ReactNode, RefObject } from 'react'

/** Full-viewport flex centering so popovers stay on-screen; inner panel scrolls if tall. */
export function CenteredViewportPopup({
  children,
  panelRef,
  zClassName = 'z-[100]',
  backdropClassName = 'bg-black/10',
  innerClassName = '',
}: {
  children: ReactNode
  panelRef: RefObject<HTMLDivElement | null>
  zClassName?: string
  backdropClassName?: string
  innerClassName?: string
}) {
  return (
    <div
      className={`fixed inset-0 ${zClassName} flex items-center justify-center p-3 sm:p-4 ${backdropClassName}`}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`w-full max-h-[min(85vh,90dvh)] max-w-[min(42rem,calc(100vw-1.5rem))] overflow-auto overscroll-contain min-h-0 flex flex-col ${innerClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
