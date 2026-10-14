'use client'

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import type { ZoneQuestion } from '@/data/questions'

type QuestionModalProps = {
  zone: ZoneQuestion
  step: number
  optionOrder: number[]
  feedback: string
  explanation: string
  conquered: boolean
  busy: boolean
  cooldown: boolean
  onAnswer: (originalIndex: number) => void
  onClose: () => void
}

export function QuestionModal({
  zone,
  step,
  optionOrder,
  feedback,
  explanation,
  conquered,
  busy,
  cooldown,
  onAnswer,
  onClose,
}: QuestionModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const firstOptionRef = useRef<HTMLButtonElement | null>(null)
  const currentStep = zone.steps[step]

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => {
      firstOptionRef.current?.focus()
    })
    return () => {
      document.body.style.overflow = previousOverflow
      window.cancelAnimationFrame(frame)
      document.getElementById(`zona-${zone.id}`)?.focus()
    }
  }, [zone.id])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
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

  if (!currentStep) return null

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-title"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-panel border border-mapa-trazo max-w-xl w-full p-7 max-h-[90dvh] overflow-y-auto">
        <div className="flex justify-between">
          <div>
            <p className="text-oro uppercase text-xs tracking-widest">
              {conquered
                ? `${zone.theme} · Conquistada`
                : `${zone.theme} · Reto ${step + 1}/${zone.steps.length}`}
            </p>
            <h2 id="question-title" className="font-serif text-3xl text-oro-claro mt-2">
              {zone.question}
            </h2>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-2xl">
            ×
          </button>
        </div>
        {conquered ? (
          <p className="mt-8 font-serif text-2xl text-oro-claro">¡Zona conquistada!</p>
        ) : (
          <>
            <p className="mt-8 text-lg">{currentStep.prompt}</p>
            <div className="grid gap-3 mt-5">
              {optionOrder.map((originalIndex, position) => (
                <button
                  key={originalIndex}
                  ref={position === 0 ? firstOptionRef : undefined}
                  type="button"
                  disabled={busy || cooldown}
                  onClick={() => onAnswer(originalIndex)}
                  className="border border-linea-clara px-4 py-3 text-left hover:border-oro-claro disabled:opacity-50"
                >
                  {currentStep.options[originalIndex]}
                </button>
              ))}
            </div>
          </>
        )}
        {feedback && (
          <p role="status" className="mt-5 text-oro">
            {feedback}
          </p>
        )}
        {explanation && (
          <div className="mt-5 border border-mapa-trazo bg-mapa-base p-4">
            <p className="text-xs uppercase tracking-widest text-oro">Por qué</p>
            <p className="mt-1 text-sm text-crema">{explanation}</p>
          </div>
        )}
        {cooldown && (
          <p role="status" className="mt-2 text-xs text-aviso">
            Espera un segundo…
          </p>
        )}
        {conquered && (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full bg-boton py-3 font-bold text-[#182a29]"
          >
            Continuar
          </button>
        )}
      </div>
    </div>
  )
}
