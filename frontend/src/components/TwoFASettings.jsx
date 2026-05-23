import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { twofa as twofaApi } from '../services/api'

export default function TwoFASettings() {
  const [enabled, setEnabled] = useState(null) // null = loading
  const [step, setStep] = useState('idle') // 'idle' | 'setup' | 'disable'
  const [secret, setSecret] = useState('')
  const [otpauthURL, setOtpauthURL] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'success'|'error', text }
  const canvasRef = useRef(null)

  useEffect(() => {
    twofaApi.status().then(({ data }) => setEnabled(data.enabled)).catch(() => setEnabled(false))
  }, [])

  useEffect(() => {
    if (otpauthURL && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, otpauthURL, { width: 200, margin: 1 })
    }
  }, [otpauthURL])

  const startSetup = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const { data } = await twofaApi.setup()
      setSecret(data.secret)
      setOtpauthURL(data.otpauth_url)
      setStep('setup')
      setCode('')
    } catch {
      setMsg({ type: 'error', text: 'Error generating 2FA secret' })
    } finally {
      setLoading(false)
    }
  }

  const handleEnable = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      await twofaApi.enable({ secret, code })
      setEnabled(true)
      setStep('idle')
      setCode('')
      setMsg({ type: 'success', text: '2FA enabled! Your account is now more secure.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Invalid code' })
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      await twofaApi.disable({ code })
      setEnabled(false)
      setStep('idle')
      setCode('')
      setMsg({ type: 'success', text: '2FA disabled.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Invalid code' })
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  if (enabled === null) return <div className="twofa-loading">Loading security settings…</div>

  return (
    <div className="twofa-section">
      <div className="twofa-header">
        <h3>Two-Factor Authentication</h3>
        <span className={`twofa-badge ${enabled ? 'on' : 'off'}`}>
          {enabled ? '🔐 Enabled' : '🔓 Disabled'}
        </span>
      </div>
      <p className="twofa-desc">
        {enabled
          ? 'Your account is protected with TOTP. Use your authenticator app each time you log in.'
          : 'Add an extra layer of security. Use Google Authenticator, Authy, or any TOTP app.'}
      </p>

      {msg && (
        <div className={`profile-msg ${msg.type === 'error' ? 'error' : 'success'}`}>
          {msg.text}
        </div>
      )}

      {step === 'idle' && (
        <button
          className={enabled ? 'btn-danger' : 'btn-primary'}
          onClick={enabled ? () => { setStep('disable'); setCode(''); setMsg(null) } : startSetup}
          disabled={loading}
        >
          {enabled ? '🗑 Disable 2FA' : '🔐 Enable 2FA'}
        </button>
      )}

      {step === 'setup' && (
        <div className="twofa-setup">
          <p className="twofa-step">1. Scan this QR code with your authenticator app:</p>
          <canvas ref={canvasRef} className="twofa-qr" />
          <details className="twofa-manual">
            <summary>Can't scan? Enter manually</summary>
            <code className="twofa-secret">{secret}</code>
          </details>
          <p className="twofa-step">2. Enter the 6-digit code to confirm:</p>
          <form onSubmit={handleEnable} className="twofa-form">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              className="totp-input"
              autoFocus
              required
            />
            <div className="twofa-actions">
              <button type="submit" disabled={loading || code.length !== 6} className="btn-primary">
                {loading ? 'Verifying…' : 'Confirm & Enable'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setStep('idle'); setMsg(null) }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'disable' && (
        <form onSubmit={handleDisable} className="twofa-form">
          <p className="twofa-step">Enter your current TOTP code to disable 2FA:</p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            className="totp-input"
            autoFocus
            required
          />
          <div className="twofa-actions">
            <button type="submit" disabled={loading || code.length !== 6} className="btn-danger">
              {loading ? 'Disabling…' : 'Disable 2FA'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setStep('idle'); setMsg(null) }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
