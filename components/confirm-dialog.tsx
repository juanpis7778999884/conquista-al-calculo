'use client'

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'normal' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'normal',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => {
      confirmRef.current?.focus()
    })
    return () => {
      document.body.style.overflow = previousOverflow
      window.cancelAnimationFrame(frame)
    }
  }, [open])

  if (!open) return null

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-panel border border-mapa-trazo max-w-md w-full p-7">
        <h2 id="confirm-title" className="font-serif text-2xl text-oro-claro">
          {title}
        </h2>
        <p id="confirm-desc" className="mt-3 text-tenue leading-relaxed">
          {message}
        </p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="border border-marco px-4 py-2 text-sm text-tenue"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={
              tone === 'danger'
                ? 'border border-aviso text-aviso px-4 py-2 text-sm font-bold'
                : 'bg-boton px-4 py-2 text-sm font-bold text-[#182a29]'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
