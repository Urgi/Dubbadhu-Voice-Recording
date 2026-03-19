import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AuthRole } from '../types'

type AuthContextValue = {
  role: AuthRole | null
  setRole: (role: AuthRole | null) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [role, setRole] = useState<AuthRole | null>(null)

  const value = useMemo(
    () => ({
      role,
      setRole,
    }),
    [role],
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
