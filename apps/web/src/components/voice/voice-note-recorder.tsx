'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Square, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'listening' | 'processing' | 'done' | 'error' | 'unsupported'

// Inline-Typen für Web Speech API
interface SpeechResult {
  readonly isFinal: boolean
  [index: number]: { transcript: string }
}
interface SpeechResultList {
  readonly length: number
  [index: number]: SpeechResult
}
interface SpeechEvent {
  readonly resultIndex: number
  readonly results: SpeechResultList
}
interface SpeechErrorEvent {
  readonly error: string
}
interface WebSpeechRecognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
}
type WebSpeechRecognitionConstructor = new () => WebSpeechRecognition

interface VoiceNoteRecorderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VoiceNoteRecorder({ open, onOpenChange }: VoiceNoteRecorderProps): React.JSX.Element {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const recognitionRef = useRef<WebSpeechRecognition | null>(null)
  const phaseRef = useRef<Phase>('idle')
  // Ref für aktuellen Transkript-Text — verhindert Stale-Closure-Bug in onend
  const liveTranscriptRef = useRef('')
  const savedRef = useRef(false)

  const setPhaseAndRef = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const saveNote = useCallback(
    async (text: string) => {
      if (savedRef.current || !text.trim()) {
        setPhaseAndRef('idle')
        return
      }
      savedRef.current = true
      setPhaseAndRef('processing')

      try {
        let token: string | null = null
        try {
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          token = session?.access_token ?? null
        } catch (sessionEx) {
          throw new Error(`Session-Fehler: ${sessionEx instanceof Error ? sessionEx.message : String(sessionEx)}`)
        }

        if (!token) throw new Error('Nicht eingeloggt')

        const res = await fetch('/api/notes/create-from-voice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ transcript: text }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }

        const { id } = await res.json() as { id: string }
        setPhaseAndRef('done')
        setTimeout(() => {
          onOpenChange(false)
          router.push(`/notes/${id}`)
        }, 1200)
      } catch (err) {
        setPhaseAndRef('error')
        setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler')
      }
    },
    [onOpenChange, router, setPhaseAndRef],
  )

  const stopAndSave = useCallback(() => {
    if (!recognitionRef.current) return
    // onend wird nach stop() gefeuert und löst saveNote aus
    recognitionRef.current.stop()
  }, [])

  const startListening = useCallback(() => {
    type WindowWithSpeech = typeof window & {
      SpeechRecognition?: WebSpeechRecognitionConstructor
      webkitSpeechRecognition?: WebSpeechRecognitionConstructor
    }
    const w = typeof window !== 'undefined' ? (window as WindowWithSpeech) : null
    const SpeechRecognitionAPI = w?.SpeechRecognition ?? w?.webkitSpeechRecognition

    if (!SpeechRecognitionAPI) {
      setPhaseAndRef('unsupported')
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'de-DE'
    recognition.interimResults = true
    recognition.continuous = true
    recognitionRef.current = recognition
    liveTranscriptRef.current = ''
    savedRef.current = false

    recognition.onresult = (event) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const text = r[0]?.transcript ?? ''
        if (r.isFinal) {
          finalChunk += text
        } else {
          interim += text
        }
      }
      if (finalChunk) {
        liveTranscriptRef.current += (liveTranscriptRef.current ? ' ' : '') + finalChunk
      }
      const display = liveTranscriptRef.current + (interim ? ' ' + interim : '')
      setTranscript(display.trim())
    }

    recognition.onend = () => {
      if (phaseRef.current === 'listening') {
        const text = liveTranscriptRef.current.trim() || transcript.trim()
        void saveNote(text)
      }
    }

    recognition.onerror = (event) => {
      console.error('[VoiceNote] Speech-Erkennungsfehler:', event.error)
      if (event.error === 'no-speech') {
        setPhaseAndRef('idle')
        return
      }
      setPhaseAndRef('error')
      setErrorMsg(`Spracherkennung fehlgeschlagen: ${event.error}`)
    }

    setPhaseAndRef('listening')
    setTranscript('')
    liveTranscriptRef.current = ''
    recognition.start()
  }, [saveNote, setPhaseAndRef, transcript])

  // Dialog schließen / öffnen
  useEffect(() => {
    if (open) {
      setPhaseAndRef('idle')
      setTranscript('')
      setErrorMsg('')
      liveTranscriptRef.current = ''
    } else {
      if (recognitionRef.current && phaseRef.current === 'listening') {
        phaseRef.current = 'idle'
        recognitionRef.current.stop()
      }
    }
  }, [open, setPhaseAndRef])

  const handleClose = useCallback(() => {
    if (recognitionRef.current && phaseRef.current === 'listening') {
      phaseRef.current = 'idle'
      recognitionRef.current.stop()
    }
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic size={18} className="text-orange-500" />
            Sprachnotiz aufnehmen
          </DialogTitle>
          <DialogDescription className="sr-only">
            Mikrofon aktivieren und sprechen — die Aufnahme wird als Notiz gespeichert.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">

          {phase === 'idle' && (
            <>
              <button
                onClick={startListening}
                className="flex h-24 w-24 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                <Mic size={40} />
              </button>
              <p className="text-sm text-muted-foreground">Tippen um Aufnahme zu starten</p>
            </>
          )}

          {phase === 'listening' && (
            <>
              <div className="relative flex items-center justify-center">
                <span className="absolute h-24 w-24 animate-ping rounded-full bg-orange-400 opacity-30" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg">
                  <Mic size={40} />
                </div>
              </div>
              <p className="text-sm font-medium text-orange-500">Ich höre zu…</p>

              {transcript && (
                <div className="w-full rounded-xl border border-border bg-muted/50 p-4">
                  <p className="text-center text-sm leading-relaxed text-foreground">{transcript}</p>
                </div>
              )}

              <button
                onClick={stopAndSave}
                className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                <Square size={14} fill="currentColor" />
                Aufnahme beenden
              </button>
            </>
          )}

          {phase === 'processing' && (
            <>
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-orange-100">
                <Loader2 size={40} className="animate-spin text-orange-500" />
              </div>
              <p className="text-sm text-muted-foreground">Notiz wird formatiert…</p>
              {transcript && (
                <div className="w-full rounded-xl border border-border bg-muted/50 p-4">
                  <p className="text-center text-sm leading-relaxed text-foreground line-clamp-3">{transcript}</p>
                </div>
              )}
            </>
          )}

          {phase === 'done' && (
            <>
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
                <CheckCircle size={40} className="text-green-500" />
              </div>
              <p className="text-sm font-medium text-green-600">Notiz erstellt!</p>
            </>
          )}

          {phase === 'error' && (
            <>
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-red-100">
                <AlertCircle size={40} className="text-red-500" />
              </div>
              <p className="text-center text-sm text-red-600">{errorMsg}</p>
              {transcript && (
                <div className="w-full rounded-xl border border-border bg-muted/50 p-4">
                  <p className="text-center text-xs text-muted-foreground">Transkript: {transcript}</p>
                </div>
              )}
              <button
                onClick={() => { setPhaseAndRef('idle'); setErrorMsg('') }}
                className="rounded-full bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/80"
              >
                Erneut versuchen
              </button>
            </>
          )}

          {phase === 'unsupported' && (
            <p className={cn('text-center text-sm text-muted-foreground')}>
              Spracherkennung wird von diesem Browser nicht unterstützt.
              <br />
              Bitte Chrome oder Edge verwenden.
            </p>
          )}

        </div>

        <div className="flex justify-end">
          <button
            onClick={handleClose}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Schließen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
