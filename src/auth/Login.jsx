// Magic-link login screen. Only email is required. The user types their email,
// Supabase emails them a sign-in link, they click it, and the app's AuthProvider
// picks up the new session automatically (via onAuthStateChange).
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const PURPLE = '#5B2D8E'
const PURPLE_DARK = '#3D1F6E'
const PURPLE_LIGHT = '#F3EEF9'

export default function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errMsg, setErrMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setStatus('sending')
    setErrMsg('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          // Supabase will redirect here after the link is clicked.
          // The hash containing the tokens is parsed automatically by the client.
          emailRedirectTo: window.location.origin,
          shouldCreateUser: false, // allowlist is enforced server-side; never silently create accounts
        },
      })
      if (error) throw error
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setErrMsg(err?.message || 'Could not send the sign-in link. Please try again.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `linear-gradient(135deg, ${PURPLE_LIGHT} 0%, #FFFFFF 60%)`,
      fontFamily: 'Arial, sans-serif',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 14,
        padding: '36px 32px',
        boxShadow: '0 10px 40px rgba(61, 31, 110, 0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: PURPLE_DARK, color: 'white',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em',
            marginBottom: 14,
          }}>A</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: PURPLE_DARK, letterSpacing: '-0.01em' }}>
            ARX Engineers
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>
            Aim For Excellence
          </div>
        </div>

        {status === 'sent' ? (
          <div style={{
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            color: '#166534', borderRadius: 10, padding: '16px 18px',
            fontSize: 14, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ Check your inbox</div>
            A sign-in link has been sent to <strong>{email.trim().toLowerCase()}</strong>.
            Open it on whichever device you want to use. The link expires in an hour.
            <button
              type="button"
              onClick={() => { setStatus('idle'); setEmail('') }}
              style={{
                display: 'block', marginTop: 14, background: 'none', border: 'none',
                color: PURPLE, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0,
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email" style={{
              display: 'block', fontSize: 13, fontWeight: 600,
              color: '#374151', marginBottom: 6,
            }}>Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={status === 'sending'}
              style={{
                width: '100%', padding: '12px 14px',
                border: '1px solid #D1D5DB', borderRadius: 8,
                fontSize: 15, outline: 'none',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = PURPLE}
              onBlur={e => e.target.style.borderColor = '#D1D5DB'}
            />

            {status === 'error' && (
              <div style={{
                marginTop: 10, padding: '8px 12px',
                background: '#FEF2F2', border: '1px solid #FECACA',
                color: '#B91C1C', borderRadius: 6, fontSize: 12.5,
              }}>{errMsg}</div>
            )}

            <button
              type="submit"
              disabled={status === 'sending' || !email.trim()}
              style={{
                width: '100%', marginTop: 16, padding: '12px 0',
                background: status === 'sending' || !email.trim() ? '#C4B5D9' : PURPLE,
                color: 'white', border: 'none', borderRadius: 8,
                fontWeight: 700, fontSize: 15,
                cursor: status === 'sending' || !email.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
            </button>

            <div style={{
              marginTop: 18, fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', lineHeight: 1.5,
            }}>
              This is a private internal tool for ARX Engineers Ltd. Access is restricted to authorised users.
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
