import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  BackHandler, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { useCreateTask } from '@/hooks/use-tasks'
import { parseTaskInput, formatRelativeDate, formatTime } from '@/lib/task-parser'

type Phase = 'idle' | 'listening' | 'success' | 'error'

export default function VoiceTaskScreen() {
  const router = useRouter()
  const createTask = useCreateTask()
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [finalText, setFinalText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pulseAnim = useRef(new Animated.Value(1)).current
  const fadeAnim = useRef(new Animated.Value(0)).current
  const savedRef = useRef(false)
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SILENCE_TIMEOUT_MS = 2000

  const parsed = useMemo(() => {
    const text = finalText || transcript
    if (!text) return null
    return parseTaskInput(text)
  }, [transcript, finalText])

  const startListening = useCallback(async () => {
    const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (status !== 'granted') {
      setPhase('error')
      setErrorMsg('Mikrofon-Berechtigung benötigt')
      return
    }

    setPhase('listening')
    setTranscript('')
    setFinalText('')
    savedRef.current = false

    ExpoSpeechRecognitionModule.start({
      lang: 'de-DE',
      interimResults: true,
      requiresOnDeviceRecognition: false,
    })

    resetSilenceTimer()
  }, [resetSilenceTimer])

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    silenceTimer.current = setTimeout(() => {
      ExpoSpeechRecognitionModule.stop()
    }, SILENCE_TIMEOUT_MS)
  }, [])

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? ''
    if (event.isFinal) {
      setFinalText(text)
      setTranscript(text)
      if (silenceTimer.current) clearTimeout(silenceTimer.current)
      ExpoSpeechRecognitionModule.stop()
    } else {
      setTranscript(text)
      resetSilenceTimer()
    }
  })

  useSpeechRecognitionEvent('end', () => {
    if (phase === 'listening') {
      if (finalText || transcript) {
        saveTask(finalText || transcript)
      } else {
        setPhase('idle')
      }
    }
  })

  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'no-speech') {
      setPhase('idle')
      return
    }
    setPhase('error')
    setErrorMsg('Spracherkennung fehlgeschlagen')
  })

  const saveTask = useCallback(async (text: string) => {
    if (savedRef.current || !text.trim()) return
    savedRef.current = true

    const result = parseTaskInput(text)
    try {
      await createTask.mutateAsync({
        title: result.title,
        due_at: result.due_at?.toISOString() ?? null,
        end_at: result.end_at?.toISOString() ?? null,
      })
      setPhase('success')

      Animated.timing(fadeAnim, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }).start()

      setTimeout(() => {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace('/(tabs)/dashboard')
        }
      }, 1500)
    } catch {
      setPhase('error')
      setErrorMsg('Aufgabe konnte nicht gespeichert werden')
    }
  }, [createTask, fadeAnim, router])

  useEffect(() => {
    startListening()
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

  const handleClose = () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    ExpoSpeechRecognitionModule.abort()
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/dashboard')
  }

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

            {parsed && (parsed.due_at || parsed.end_at) && (
              <View style={styles.parsePreview}>
                <Ionicons name="sparkles" size={14} color="#E8713A" />
                <Text style={styles.parseText}>
                  {parsed.title}
                  {parsed.due_at ? ` · ${formatRelativeDate(parsed.due_at)}` : ''}
                  {parsed.due_at && (parsed.due_at.getHours() !== 0 || parsed.due_at.getMinutes() !== 0)
                    ? ` ${formatTime(parsed.due_at)}`
                    : ''}
                  {parsed.end_at ? ` – ${formatTime(parsed.end_at)}` : ''}
                </Text>
              </View>
            )}

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

        {phase === 'success' && (
          <Animated.View style={[styles.successArea, { opacity: fadeAnim }]}>
            <View style={styles.successCircle}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
            <Text style={styles.successTitle}>Aufgabe erstellt</Text>
            {parsed && (
              <Text style={styles.successSubtitle}>{parsed.title}</Text>
            )}
            {parsed?.due_at && (
              <View style={styles.parsePreview}>
                <Ionicons name="calendar-outline" size={14} color="#22c55e" />
                <Text style={[styles.parseText, { color: '#22c55e' }]}>
                  {formatRelativeDate(parsed.due_at)}
                  {(parsed.due_at.getHours() !== 0 || parsed.due_at.getMinutes() !== 0)
                    ? ` ${formatTime(parsed.due_at)}`
                    : ''}
                  {parsed.end_at ? ` – ${formatTime(parsed.end_at)}` : ''}
                </Text>
              </View>
            )}
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
  container: {
    flex: 1, backgroundColor: '#fff',
  },
  closeBtn: {
    position: 'absolute', top: 60, right: 20, zIndex: 10, padding: 4,
  },
  content: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  micButton: {
    alignItems: 'center', gap: 16,
  },
  hint: {
    fontSize: 15, color: '#9ca3af',
  },
  listeningArea: {
    alignItems: 'center', gap: 24, width: '100%',
  },
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
  listeningLabel: {
    fontSize: 18, fontWeight: '600', color: '#E8713A',
  },
  transcriptBox: {
    backgroundColor: '#f9fafb', borderRadius: 16, padding: 16,
    width: '100%', borderWidth: 1, borderColor: '#e5e7eb',
  },
  transcriptText: {
    fontSize: 17, color: '#111827', lineHeight: 24, textAlign: 'center',
  },
  parsePreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff7ed', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  parseText: {
    fontSize: 13, color: '#E8713A', fontWeight: '500',
  },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
  },
  stopText: {
    fontSize: 14, fontWeight: '600', color: '#dc2626',
  },
  successArea: {
    alignItems: 'center', gap: 16,
  },
  successCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: {
    fontSize: 22, fontWeight: '700', color: '#111827',
  },
  successSubtitle: {
    fontSize: 16, color: '#6b7280', textAlign: 'center',
  },
  errorArea: {
    alignItems: 'center', gap: 12,
  },
  errorText: {
    fontSize: 15, color: '#dc2626', textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#f3f4f6', marginTop: 8,
  },
  retryText: {
    fontSize: 14, fontWeight: '600', color: '#374151',
  },
})
