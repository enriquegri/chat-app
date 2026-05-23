import { useState } from 'react'
import { profile as profileApi } from '../services/api'

const AVATAR_COLORS = [
  '#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245',
  '#f0b132', '#1db954', '#00b0f4', '#9c59b6', '#e67e22',
]

export default function Profile({ user, onBack, onUpdate }) {
  const [bio, setBio] = useState(user.bio || '')
  const [avatarColor, setAvatarColor] = useState(user.avatar_color || '#5865f2')
  const [saving, setSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState('')

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    setProfileMsg('')
    try {
      const { data } = await profileApi.update({ bio, avatar_color: avatarColor })
      onUpdate(data)
      setProfileMsg('Profile updated!')
    } catch {
      setProfileMsg('Error saving profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPw !== confirmPw) {
      setPwMsg('Passwords do not match')
      return
    }
    setPwSaving(true)
    setPwMsg('')
    try {
      await profileApi.changePassword({ current_password: currentPw, new_password: newPw })
      setPwMsg('Password changed!')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setPwMsg(err.response?.data?.error || 'Error changing password')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="profile-layout">
      <div className="profile-header">
        <button className="admin-back" onClick={onBack}>← Back to Chat</button>
        <h1>My Profile</h1>
      </div>

      <div className="profile-content">
        <div className="profile-card">
          <div className="profile-avatar-preview" style={{ background: avatarColor }}>
            {user.username[0].toUpperCase()}
          </div>
          <div className="profile-username">{user.username}</div>
          <div className="profile-role-badge">{user.role}</div>
        </div>

        <form className="profile-form" onSubmit={handleSaveProfile}>
          <h2>Edit Profile</h2>

          <label>Avatar Color</label>
          <div className="color-picker">
            {AVATAR_COLORS.map(c => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${avatarColor === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setAvatarColor(c)}
              />
            ))}
          </div>

          <label>Bio <span className="char-count">{bio.length}/200</span></label>
          <textarea
            className="profile-bio"
            value={bio}
            onChange={e => setBio(e.target.value.slice(0, 200))}
            placeholder="Tell people a bit about yourself..."
            rows={3}
          />

          {profileMsg && (
            <div className={`profile-msg ${profileMsg.includes('Error') ? 'error' : 'success'}`}>
              {profileMsg}
            </div>
          )}

          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        <form className="profile-form" onSubmit={handleChangePassword}>
          <h2>Change Password</h2>

          <label>Current Password</label>
          <input
            type="password"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
            required
          />

          <label>New Password</label>
          <input
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            minLength={6}
            required
          />

          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            required
          />

          {pwMsg && (
            <div className={`profile-msg ${pwMsg.includes('Error') || pwMsg.includes('incorrect') || pwMsg.includes('match') ? 'error' : 'success'}`}>
              {pwMsg}
            </div>
          )}

          <button type="submit" disabled={pwSaving}>
            {pwSaving ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
