'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, AuthState } from '@/lib/types'

interface AuthContextType extends AuthState {
  login: (user: User) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = 'linehaul_auth_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  })

  // Load user from the signed server session first. sessionStorage is only a UI cache.
  useEffect(() => {
    let isMounted = true

    async function loadSession() {
      try {
        const response = await fetch('/api/auth/session')
        if (response.ok) {
          const { user } = await response.json() as { user: User }
          sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
          if (!isMounted) return
          setAuthState({
            user,
            isAuthenticated: true,
            isLoading: false,
          })
          return
        }

        sessionStorage.removeItem(AUTH_STORAGE_KEY)
        if (!isMounted) return
        setAuthState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        })
      } catch {
        sessionStorage.removeItem(AUTH_STORAGE_KEY)
        if (!isMounted) return
        setAuthState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    }

    loadSession()

    return () => {
      isMounted = false
    }
  }, [])

  const login = useCallback((user: User) => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
    setAuthState({
      user,
      isAuthenticated: true,
      isLoading: false,
    })
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })
  }, [])

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
