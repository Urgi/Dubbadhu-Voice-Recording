import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthRole } from '../types'
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from '../lib/sessionStorage'
import { ADMIN_EMAIL } from '../lib/adminAuth'

type AuthContextValue = {
  role: AuthRole | null
  isLoading: boolean
  adminEmail: string | null
  setRole: (role: AuthRole | null, email?: string | null) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [role, setRoleState] = useState<AuthRole | null>(null)
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function restoreSession() {
      try {
        const stored = await loadStoredSession()
        if (!cancelled && stored?.role) {
          setRoleState(stored.role)
          setAdminEmail(stored.email ?? (stored.role === 'admin' ? ADMIN_EMAIL : null))
        }
      } catch (err) {
        console.warn('[AuthContext] Error restoring session:', err)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    void restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  const setRole = useCallback((newRole: AuthRole | null, email?: string | null) => {
    setRoleState(newRole)
    if (newRole) {
      const resolvedEmail = email ?? (newRole === 'admin' ? ADMIN_EMAIL : null)
      setAdminEmail(resolvedEmail)
      void saveStoredSession({
        role: newRole,
        email: resolvedEmail,
        savedAt: new Date().toISOString(),
      })
    } else {
      setAdminEmail(null)
      void clearStoredSession()
    }
  }, [])

  const value = useMemo(
    () => ({
      role,
      isLoading,
      adminEmail,
      setRole,
    }),
    [role, isLoading, adminEmail, setRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
