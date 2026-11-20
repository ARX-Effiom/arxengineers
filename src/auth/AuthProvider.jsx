// Provides the current Supabase session to the whole app.
// Wrap the top of App with <AuthProvider>, then any child can call useAuth()
// to get { session, user, loading, signOut }.
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // session === undefined  →  we haven't checked localStorage yet (loading)
  // session === null       →  no active session (show Login)
  // session is an object   →  user is signed in
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // Initial read of any session already saved in localStorage
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    // Subscribe to future changes: magic-link redirect, signOut, token refresh
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    loading: session === undefined,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
