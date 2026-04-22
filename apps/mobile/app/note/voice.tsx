import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  BackHandler,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { supabase } from '@/lib/supabase/client'

type Phase = 'idle' | 'listening' | 'processing' | 'success' | 'error'

const SILENCE_TIMEOUT_MS = 3500
const MIN_RECORDING_MS = 1200

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3456'

export default function VoiceNoteScreen() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pulseAnim = useRef(new Animated.Value(1)).current
  const fadeAnim = useRef(new Animated.Value(0)).current
  const savedRef = useRef(false)
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingStartRef = useRef<number>(0)
  const phaseRef = useRef<Phase>('idle')
  const finalTextRef = useRef('')
  const transcriptRef = useRef('')

  const setPhaseAndRef = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    const elapsed = Date.now() - recordingStartRef.current
    const delay = elapsed < MIN_RECORDING_MS
      ? (MIN_RECORDING_MS - elapsed) + SILENCE_TIMEOUT_MS
      : SILENCE_TIMEOUT_MS
    silenceTimer.current = setTimeout(() => {
      ExpoSpeechRecognitionModule.stop()
    }, delay)
  }, [])

  const startListening = useCallback(async () => {
    const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (status !== 'granted') {
      setPhaseAndRef('error')
      setErrorMsg('Mikrofon-Berechtigung benötigt')
      return
    }

    setPhaseAndRef('listening')
    setTranscript('')
    finalTextRef.current = ''
    transcriptRef.current = ''
    savedRef.current = false
    recordingStartRef.current = Date.now()

    ExpoSpeechRecognitionModule.start({
      lang: 'de-DE',
      interimResults: true,
      requiresOnDeviceRecognition: false,
      continuous: true,
    })

    resetSilenceTimer()
  }, [resetSilenceTimer, setPhaseAndRef])

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? ''
    if (event.isFinal) {
      finalTextRef.current = text
      transcriptRef.current = text
      setTranscript(text)
      if (silenceTimer.current) clearTimeout(silenceTimer.current)
      ExpoSpeechRecognitionModule.stop()
    } else {
      transcriptRef.current = text
      setTranscript(text)
      resetSilenceTimer()
    }
  })

  useSpeechRecognitionEvent('end', () => {
    if (phaseRef.current === 'listening') {
      const text = finalTextRef.current || transcriptRef.current
      if (text) {
        void saveNote(text)
      } else {
        setPhaseAndRef('idle')
      }
    }
  })

  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'no-speech') {
      setPhaseAndRef('idle')
      return
    }
    setPhaseAndRef('error')
    setErrorMsg('Spracherkennung fehlgeschlagen')
  })

  const saveNote = useCallback(async (text: string) => {
    if (savedRef.current || !text.trim()) return
    savedRef.current = true
    setPhaseAndRef('processing')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch(`${BASE_URL}/api/notes/create-from-voice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ transcript: text }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const { id, title } = (await response.json()) as { id: string; title: string }

      setNoteTitle(title)
      setPhaseAndRef('success')

      Animated.timing(fadeAnim, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }).start()

      setTimeout(() => {
        router.replace(`/note/${id}`)
      }, 1500)
    } catch {
      setPhaseAndRef('error')
      setErrorMsg('Notiz konnte nicht erstellt werden')
    }
  }, [fadeAnim, router, setPhaseAndRef])

  useEffect(() => {
    void startListening()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'listening') return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [phase, pulseAnim])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ExpoSpeechRecognitionModule.abort()
      return false
    })
    return () => sub.remove()
  }, [])

  const handleClose = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    phaseRef.current = 'idle'
    ExpoSpeechRecognitionModule.abort()
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/notes')
  }, [router])

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={16}>
        <Ionicons name="close" size={28} color="#6b7280" />
      </TouchableOpacity>

      <View style={styles.content}>
        {phase === 'idle' && (
          <TouchableOpacity style={styles.micButton} onPress={startListening} activeOpacity={0.7}>
            <Ionicons name="mic" size={48} color="#E8713A" />
            <Text style={styles.hint}>Tippen zum Starten</Text>
          </TouchableOpacity>
        )}

        {phase === 'listening' && (
          <View style={styles.listeningArea}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.micCircle}>
                <Ionicons name="mic" size={48} color="#fff" />
              </View>
            </Animated.View>

            <Text style={styles.listeningLabel}>Ich höre zu...</Text>

            {transcript ? (
              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptText}>{transcript}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.stopBtn}
              onPress={() => ExpoSpeechRecognitionModule.stop()}
              activeOpacity={0.7}
            >
              <Ionicons name="stop-circle" size={24} color="#dc2626" />
              <Text style={styles.stopText}>Stopp</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'processing' && (
          <View style={styles.processingArea}>
            <View style={styles.processingCircle}>
              <Ionicons name="sparkles" size={40} color="#E8713A" />
            </View>
            <Text style={styles.processingLabel}>Notiz wird formatiert…</Text>
            {transcript ? (
              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptText} numberOfLines={3}>{transcript}</Text>
              </View>
            ) : null}
          </View>
        )}

        {phase === 'success' && (
          <Animated.View style={[styles.successArea, { opacity: fadeAnim }]}>
            <View style={styles.successCircle}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
            <Text style={styles.successTitle}>Notiz erstellt</Text>
            {noteTitle ? (
              <Text style={styles.successSubtitle}>{noteTitle}</Text>
            ) : null}
          </Animated.View>
        )}

        {phase === 'error' && (
          <View style={styles.errorArea}>
            <Ionicons name="alert-circle" size={48} color="#dc2626" />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={startListening}>
              <Text style={styles.retryText}>Erneut versuchen</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  closeBtn: { position: 'absolute', top: 60, right: 20, zIndex: 10, padding: 4 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  micButton: { alignItems: 'center', gap: 16 },
  hint: { fontSize: 15, color: '#9ca3af' },
  listeningArea: { alignItems: 'center', gap: 24, width: '100%' },
  pulseRing: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(232, 113, 58, 0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  micCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#E8713A',
    alignItems: 'center', justifyContent: 'center',
  },
  listeningLabel: { fontSize: 18, fontWeight: '600', color: '#E8713A' },
  transcriptBox: {
    backgroundColor: '#f9fafb', borderRadius: 16, padding: 16,
    width: '100%', borderWidth: 1, borderColor: '#e5e7eb',
  },
  transcriptText: { fontSize: 17, color: '#111827', lineHeight: 24, textAlign: 'center' },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
  },
  stopText: { fontSize: 14, fontWeight: '600', color: '#dc2626' },
  processingArea: { alignItems: 'center', gap: 20, width: '100%' },
  processingCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#fff7ed',
    alignItems: 'center', justifyContent: 'center',
  },
  processingLabel: { fontSize: 16, fontWeight: '500', color: '#E8713A' },
  successArea: { alignItems: 'center', gap: 16 },
  successCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  successSubtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center' },
  errorArea: { alignItems: 'center', gap: 12 },
  errorText: { fontSize: 15, color: '#dc2626', textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#f3f4f6', marginTop: 8,
  },
  retryText: { fontSize: 14, fontWeight: '600', color: '#374151' },
})
