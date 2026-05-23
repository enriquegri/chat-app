import { useState } from 'react'

export default function Login({ onLogin, on2FA, onSwitchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 2FA step
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [totpCode, setTotpCode] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await onLogin(email, password)
      if (data?.requires_2fa) {
        setTempToken(data.temp_token)
        setRequires2FA(true)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handle2FA = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await on2FA(tempToken, totpCode)
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code')
      setTotpCode('')
    } finally {
      setLoading(false)
    }
  }

  if (requires2FA) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>ChatApp</h1>
          <h2>Two-Factor Authentication</h2>
          <p className="auth-hint">Enter the 6-digit code from your authenticator app</p>
          <form onSubmit={handle2FA}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
              className="totp-input"
            />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading || totpCode.length !== 6}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
          <button className="link-btn" onClick={() => { setRequires2FA(false); setError(''); setTotpCode('') }}>
            ← Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>ChatApp</h1>
        <h2>Sign In</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        {onSwitchToRegister && (
          <p>
            No account?{' '}
            <button className="link-btn" onClick={onSwitchToRegister}>
              Register here
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
