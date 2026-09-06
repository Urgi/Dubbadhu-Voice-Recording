import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'
import { useAuth } from '../context/AuthContext'
import {
  ADMIN_PIN,
  FIDEL_RECORDER_PIN,
  PROFESSOR_PIN,
  VOICE_PIN,
} from '../config/internalPins'
import { ADMIN_EMAIL, sendAdminOtp, verifyAdminOtp } from '../lib/adminAuth'

type Props = StackScreenProps<RootStackParamList, 'Login'>

const PIN_LENGTH = 4
const OTP_LENGTH = 6
const RESEND_COOLDOWN_SEC = 30

const KEYPAD_ROWS: (string | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'delete'],
]

export default function LoginScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [step, setStep] = useState<'pin' | 'admin_otp'>('pin')
  const [pin, setPin] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  const requestAdminOtp = useCallback(async () => {
    setIsSendingOtp(true)
    setError('')
    const res = await sendAdminOtp(ADMIN_EMAIL)
    setIsSendingOtp(false)
    if (!res.ok) {
      setError(res.error || 'Could not send verification code.')
    } else {
      setResendCooldown(RESEND_COOLDOWN_SEC)
    }
  }, [])

  const tryCompletePin = useCallback(
    async (fullPin: string) => {
      if (fullPin === ADMIN_PIN) {
        setError('')
        setPin('')
        setOtp('')
        setStep('admin_otp')
        void requestAdminOtp()
        return
      }
      if (fullPin === VOICE_PIN) {
        setError('')
        setPin('')
        setRole('voice')
        navigation.reset({ index: 0, routes: [{ name: 'VoiceActorHome' }] })
        return
      }
      if (fullPin === PROFESSOR_PIN) {
        setError('')
        setPin('')
        setRole('professor')
        navigation.reset({ index: 0, routes: [{ name: 'ProfessorHome' }] })
        return
      }
      if (fullPin === FIDEL_RECORDER_PIN) {
        setError('')
        setPin('')
        setRole('fidel')
        navigation.reset({ index: 0, routes: [{ name: 'FidelRecorderHome' }] })
        return
      }
      setError('Incorrect PIN')
      setPin('')
    },
    [navigation, requestAdminOtp, setRole],
  )

  const tryCompleteOtp = useCallback(
    async (fullOtp: string) => {
      setIsVerifyingOtp(true)
      setError('')
      const res = await verifyAdminOtp(fullOtp, ADMIN_EMAIL)
      setIsVerifyingOtp(false)
      if (res.ok) {
        setRole('admin', ADMIN_EMAIL)
        navigation.reset({ index: 0, routes: [{ name: 'AdminHome' }] })
      } else {
        setOtp('')
        setError(res.error || 'Invalid or expired code.')
      }
    },
    [navigation, setRole],
  )

  const onDigit = useCallback(
    (d: string) => {
      if (isSendingOtp || isVerifyingOtp) return
      setError('')

      if (step === 'pin') {
        setPin((prev) => {
          if (prev.length >= PIN_LENGTH) return prev
          const next = prev + d
          if (next.length === PIN_LENGTH) {
            setTimeout(() => void tryCompletePin(next), 0)
          }
          return next
        })
      } else {
        setOtp((prev) => {
          if (prev.length >= OTP_LENGTH) return prev
          const next = prev + d
          if (next.length === OTP_LENGTH) {
            setTimeout(() => void tryCompleteOtp(next), 0)
          }
          return next
        })
      }
    },
    [isSendingOtp, isVerifyingOtp, step, tryCompleteOtp, tryCompletePin],
  )

  const onDelete = useCallback(() => {
    if (isSendingOtp || isVerifyingOtp) return
    setError('')
    if (step === 'pin') {
      setPin((prev) => prev.slice(0, -1))
    } else {
      setOtp((prev) => prev.slice(0, -1))
    }
  }, [isSendingOtp, isVerifyingOtp, step])

  const onBackToPin = useCallback(() => {
    setStep('pin')
    setPin('')
    setOtp('')
    setError('')
    setIsSendingOtp(false)
    setIsVerifyingOtp(false)
  }, [])

  const currentLength = step === 'pin' ? pin.length : otp.length
  const totalLength = step === 'pin' ? PIN_LENGTH : OTP_LENGTH

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dubbadhu Internal</Text>

      {step === 'pin' ? (
        <Text style={styles.subtitle}>Enter your PIN</Text>
      ) : (
        <View style={styles.adminHeaderBlock}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ADMIN 2FA</Text>
          </View>
          <Text style={styles.otpSubtitle}>
            Enter the 6-digit code sent to{'\n'}
            <Text style={styles.emailHighlight}>{ADMIN_EMAIL}</Text>
          </Text>
        </View>
      )}

      <View style={styles.dotsRow}>
        {Array.from({ length: totalLength }, (_, i) => (
          <View
            key={i}
            style={[
              step === 'pin' ? styles.dot : styles.dotSmall,
              i < currentLength ? styles.dotFilled : styles.dotEmpty,
            ]}
          />
        ))}
      </View>

      {isSendingOtp ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#d4af37" />
          <Text style={styles.statusText}>Sending verification code…</Text>
        </View>
      ) : isVerifyingOtp ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#d4af37" />
          <Text style={styles.statusText}>Verifying code…</Text>
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <View style={styles.errorSpacer} />
      )}

      <View style={styles.keypad}>
        {KEYPAD_ROWS.map((row, ri) => (
          <View key={ri} style={styles.keypadRow}>
            {row.map((cell, ci) => {
              if (cell === null) {
                return <View key={ci} style={styles.keySpacer} />
              }
              if (cell === 'delete') {
                return (
                  <Pressable
                    key={ci}
                    style={({ pressed }) => [
                      styles.key,
                      styles.keyGhost,
                      pressed && styles.keyPressed,
                    ]}
                    onPress={onDelete}
                    hitSlop={12}
                    disabled={isSendingOtp || isVerifyingOtp}
                  >
                    <Text style={styles.keyDeleteText}>⌫</Text>
                  </Pressable>
                )
              }
              return (
                <Pressable
                  key={ci}
                  style={({ pressed }) => [
                    styles.key,
                    pressed && styles.keyPressed,
                    (isSendingOtp || isVerifyingOtp) && styles.keyDisabled,
                  ]}
                  onPress={() => onDigit(cell)}
                  disabled={isSendingOtp || isVerifyingOtp}
                >
                  <Text style={styles.keyText}>{cell}</Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

      {step === 'admin_otp' && (
        <View style={styles.otpActionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.actionLinkBtn,
              pressed && styles.actionLinkBtnPressed,
            ]}
            onPress={requestAdminOtp}
            disabled={resendCooldown > 0 || isSendingOtp || isVerifyingOtp}
          >
            <Text
              style={[
                styles.actionLinkText,
                (resendCooldown > 0 || isSendingOtp || isVerifyingOtp) &&
                  styles.actionLinkTextDisabled,
              ]}
            >
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : 'Resend Code'}
            </Text>
          </Pressable>

          <Text style={styles.actionDivider}>·</Text>

          <Pressable
            style={({ pressed }) => [
              styles.actionLinkBtn,
              pressed && styles.actionLinkBtnPressed,
            ]}
            onPress={onBackToPin}
            disabled={isSendingOtp || isVerifyingOtp}
          >
            <Text style={styles.actionLinkText}>Back to PIN</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const KEY_SIZE = 78

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
    paddingTop: 64,
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 15,
    marginBottom: 28,
  },
  adminHeaderBlock: {
    alignItems: 'center',
    marginBottom: 22,
  },
  badge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  badgeText: {
    color: '#d4af37',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  otpSubtitle: {
    color: '#a1a1aa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emailHighlight: {
    color: '#ffffff',
    fontWeight: '600',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  dotSmall: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  dotEmpty: {
    borderColor: '#52525b',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    borderColor: '#d4af37',
    backgroundColor: '#d4af37',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    minHeight: 20,
  },
  statusText: {
    color: '#d4af37',
    fontSize: 13,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    marginBottom: 16,
    minHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  errorSpacer: {
    minHeight: 20,
    marginBottom: 16,
  },
  keypad: {
    marginTop: 4,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 14,
    gap: 22,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  keyGhost: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  keyPressed: {
    backgroundColor: '#3f3f46',
  },
  keyDisabled: {
    opacity: 0.5,
  },
  keySpacer: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  keyText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '400',
  },
  keyDeleteText: {
    color: '#a1a1aa',
    fontSize: 22,
  },
  otpActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 18,
  },
  actionLinkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  actionLinkBtnPressed: {
    opacity: 0.7,
  },
  actionLinkText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
  },
  actionLinkTextDisabled: {
    color: '#52525b',
  },
  actionDivider: {
    color: '#52525b',
    fontSize: 14,
  },
})
