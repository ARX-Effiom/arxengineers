// Wrapper around fetch() that attaches the current Supabase access token
// as a Bearer Authorization header. Every call to /api/* on the backend
// MUST go through this helper — the server will 401 otherwise.
import { supabase } from './supabase'

export async function apiFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token

  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { ...options, headers })

  // If the server tells us the session is invalid, force a sign-out so the
  // app shows the Login screen again — avoids a page stuck in a 401 loop.
  if (res.status === 401) {
    await supabase.auth.signOut()
  }
  return res
}
