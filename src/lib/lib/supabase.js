// Single shared Supabase client used by the whole frontend.
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the build-time env.
// The anon/publishable key is safe to ship in the bundle — it only enables
// the operations that Row Level Security policies allow on your Supabase tables.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Visible in the browser console on an unconfigured build — easy to diagnose
  console.error(
    '[supabase] missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — ' +
    'set these as env vars on Railway and redeploy.'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,       // keep the session in localStorage across reloads
    autoRefreshToken: true,     // silently refresh the access token before it expires
    detectSessionInUrl: true,   // parse ?code= or #access_token= from magic-link redirects
  },
})
