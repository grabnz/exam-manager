import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, AuthUser, getToken, getStoredUser, storeAuth, storeUser, clearAuth } from './api/client'

interface AuthState {
  user: AuthUser | null
  login: (token: string, user: AuthUser) => void
  updateUser: (user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  login: () => {},
  updateUser: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    getToken() ? getStoredUser() : null
  )

  // Sync the stored user with the server (name/subject/role may have changed)
  useEffect(() => {
    if (getToken()) {
      api.auth.me().then(u => { storeUser(u); setUser(u) }).catch(() => {})
    }
  }, [])

  const login = (token: string, u: AuthUser) => {
    storeAuth(token, u)
    setUser(u)
  }
  const updateUser = (u: AuthUser) => {
    storeUser(u)
    setUser(u)
  }
  const logout = () => {
    clearAuth()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}
