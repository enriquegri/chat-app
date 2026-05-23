import { useState, useEffect } from 'react'
import { admin as adminApi } from '../services/api'

const EMPTY_FORM = { username: '', email: '', password: '', role: 'user' }

export default function Admin({ user, onBack }) {
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [expandedChannel, setExpandedChannel] = useState(null)
  const [channelMembers, setChannelMembers] = useState({})
  const [addingMember, setAddingMember] = useState({})

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [u, c] = await Promise.all([adminApi.listUsers(), adminApi.listChannels()])
      setUsers(u.data || [])
      setChannels(c.data || [])
    } catch {
      setError('Error loading data')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      await adminApi.createUser(form)
      setForm(EMPTY_FORM)
      setShowCreate(false)
      await loadAll()
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteUser = async (id, username) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      await adminApi.deleteUser(id)
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch {
      alert('Failed to delete user')
    }
  }

  const handleToggleRole = async (id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    try {
      await adminApi.setRole(id, newRole)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRole } : u))
    } catch {
      alert('Failed to update role')
    }
  }

  const handleDeleteChannel = async (id, name) => {
    if (!confirm(`Delete channel "#${name}"? All messages will be lost.`)) return
    try {
      await adminApi.deleteChannel(id)
      setChannels(prev => prev.filter(c => c.id !== id))
    } catch {
      alert('Failed to delete channel')
    }
  }

  const toggleChannelMembers = async (channelId) => {
    if (expandedChannel === channelId) {
      setExpandedChannel(null)
      return
    }
    setExpandedChannel(channelId)
    if (!channelMembers[channelId]) {
      try {
        const { data } = await adminApi.getChannelMembers(channelId)
        setChannelMembers(prev => ({ ...prev, [channelId]: data }))
      } catch {
        alert('Failed to load members')
      }
    }
  }

  const handleAddMember = async (channelId, userId) => {
    setAddingMember(prev => ({ ...prev, [channelId]: true }))
    try {
      await adminApi.addChannelMember(channelId, userId)
      const { data } = await adminApi.getChannelMembers(channelId)
      setChannelMembers(prev => ({ ...prev, [channelId]: data }))
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, member_count: data.length } : c))
    } catch {
      alert('Failed to add member')
    } finally {
      setAddingMember(prev => ({ ...prev, [channelId]: false }))
    }
  }

  const handleRemoveMember = async (channelId, userId) => {
    try {
      await adminApi.removeChannelMember(channelId, userId)
      const updated = (channelMembers[channelId] || []).filter(m => m.id !== userId)
      setChannelMembers(prev => ({ ...prev, [channelId]: updated }))
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, member_count: updated.length } : c))
    } catch {
      alert('Failed to remove member')
    }
  }

  return (
    <div className="admin-layout">
      <div className="admin-header">
        <button className="admin-back" onClick={onBack}>← Back to Chat</button>
        <h1>Admin Dashboard</h1>
        <span className="admin-badge">Logged in as {user.username}</span>
      </div>

      <div className="admin-tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          Users ({users.length})
        </button>
        <button className={tab === 'channels' ? 'active' : ''} onClick={() => setTab('channels')}>
          Channels ({channels.length})
        </button>
      </div>

      <div className="admin-content">
        {loading && <div className="admin-loading">Loading...</div>}
        {error && <div className="admin-error">{error}</div>}

        {!loading && tab === 'users' && (
          <>
            <div className="admin-section-header">
              <button
                className="btn-create-user"
                onClick={() => { setShowCreate(v => !v); setCreateError('') }}
              >
                {showCreate ? '✕ Cancel' : '+ New user'}
              </button>
            </div>

            {showCreate && (
              <form className="create-user-form" onSubmit={handleCreateUser}>
                <input
                  type="text"
                  placeholder="Username"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                  autoFocus
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                {createError && <span className="create-user-error">{createError}</span>}
                <button type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create user'}
                </button>
              </form>
            )}

            <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className={u.id === user.id ? 'admin-table-self' : ''}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="admin-actions">
                      {u.id !== user.id && (
                        <>
                          <button className="btn-role" onClick={() => handleToggleRole(u.id, u.role)}>
                            {u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                          </button>
                          <button className="btn-delete" onClick={() => handleDeleteUser(u.id, u.username)}>
                            Delete
                          </button>
                        </>
                      )}
                      {u.id === user.id && <span className="admin-you">(you)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}

        {!loading && tab === 'channels' && (
          <div className="admin-channels-list">
            {channels.map(c => {
              const members = channelMembers[c.id] || []
              const nonMembers = users.filter(u => !members.find(m => m.id === u.id))
              const isExpanded = expandedChannel === c.id
              return (
                <div key={c.id} className="admin-channel-card">
                  <div className="admin-channel-row">
                    <div className="admin-channel-info">
                      <span className="admin-channel-name">#{c.name}</span>
                      <span className="admin-channel-meta">{c.msg_count} msgs · {c.member_count} members · {new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="admin-actions">
                      <button className="btn-members" onClick={() => toggleChannelMembers(c.id)}>
                        {isExpanded ? 'Hide members' : 'Manage members'}
                      </button>
                      {c.name !== 'general' && c.name !== 'random' ? (
                        <button className="btn-delete" onClick={() => handleDeleteChannel(c.id, c.name)}>
                          Delete
                        </button>
                      ) : (
                        <span className="admin-protected">Protected</span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="admin-members-panel">
                      <div className="admin-members-add">
                        <select
                          defaultValue=""
                          onChange={e => {
                            if (e.target.value) handleAddMember(c.id, parseInt(e.target.value))
                            e.target.value = ''
                          }}
                          disabled={addingMember[c.id] || nonMembers.length === 0}
                        >
                          <option value="" disabled>
                            {nonMembers.length === 0 ? 'All users are members' : 'Add user to channel…'}
                          </option>
                          {nonMembers.map(u => (
                            <option key={u.id} value={u.id}>{u.username}</option>
                          ))}
                        </select>
                      </div>
                      <div className="admin-members-list">
                        {members.length === 0 && <span className="admin-no-members">No members</span>}
                        {members.map(m => (
                          <div key={m.id} className="admin-member-row">
                            <span className="user-avatar-sm" style={{ background: m.avatar_color || '#5b5ef4' }}>
                              {m.username[0].toUpperCase()}
                            </span>
                            <span className="admin-member-name">{m.username}</span>
                            <button
                              className="btn-remove-member"
                              onClick={() => handleRemoveMember(c.id, m.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
