import { useEffect, useRef, useState, useCallback } from "react"

const PHRASES = ["harco", "in experimentation mode"]
const TYPE_SPEED = 80
const DELETE_SPEED = 50
const INITIAL_PAUSE = 5000
const MIN_PAUSE = 3000
const MAX_PAUSE = 8000

interface TypewriterProps {
  hideCursor?: boolean
  frozen?: boolean
}

export function Typewriter({ hideCursor = false, frozen = false }: TypewriterProps) {
  const [displayed, setDisplayed] = useState("harco")
  const phraseIndex = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const frozenRef = useRef(frozen)
  frozenRef.current = frozen

  const randomPause = useCallback(
    () => MIN_PAUSE + Math.random() * (MAX_PAUSE - MIN_PAUSE),
    [],
  )

  useEffect(() => {
    if (frozen) {
      clearTimeout(timeoutRef.current)
      setDisplayed("harco")
      phraseIndex.current = 0
      return
    }

    let cancelled = false

    function deleteChars(text: string, onDone: () => void) {
      if (cancelled || frozenRef.current || text.length === 0) { onDone(); return }
      timeoutRef.current = setTimeout(() => {
        if (cancelled || frozenRef.current) return
        const next = text.slice(0, -1)
        setDisplayed(next)
        deleteChars(next, onDone)
      }, DELETE_SPEED)
    }

    function typeChars(target: string, index: number, onDone: () => void) {
      if (cancelled || frozenRef.current || index > target.length) { onDone(); return }
      setDisplayed(target.slice(0, index))
      timeoutRef.current = setTimeout(() => {
        if (cancelled || frozenRef.current) return
        typeChars(target, index + 1, onDone)
      }, TYPE_SPEED)
    }

    function cycle(pause: number) {
      timeoutRef.current = setTimeout(() => {
        if (cancelled || frozenRef.current) return
        const current = PHRASES[phraseIndex.current]
        deleteChars(current, () => {
          if (cancelled || frozenRef.current) return
          phraseIndex.current = (phraseIndex.current + 1) % PHRASES.length
          const next = PHRASES[phraseIndex.current]
          timeoutRef.current = setTimeout(() => {
            if (cancelled || frozenRef.current) return
            typeChars(next, 1, () => {
              if (cancelled || frozenRef.current) return
              cycle(randomPause())
            })
          }, 400)
        })
      }, pause)
    }

    setDisplayed(PHRASES[phraseIndex.current])
    cycle(INITIAL_PAUSE)

    return () => {
      cancelled = true
      clearTimeout(timeoutRef.current)
    }
  }, [frozen, randomPause])

  return (
    <span>
      {displayed}
      {!hideCursor && (
        <span className="ml-1 inline-block h-[0.75em] w-[0.5em] translate-y-[0.05em] animate-blink bg-white/40" />
      )}
    </span>
  )
}
