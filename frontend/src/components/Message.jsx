import { useState, useEffect, useRef } from 'react'
import { reactions as reactionsApi, messages as messagesApi } from '../services/api'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export default function Message({ message, currentUserId, currentUserRole, onReactionUpdate, isCompact, onEdited, onDeleted }) {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerBelow, setPickerBelow] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const pickerRef = useRef(null)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const editInputRef = useRef(null)

  const isOwn = message.user_id === currentUserId
  const isAdmin = currentUserRole === 'admin'
  const canDelete = isOwn || isAdmin
  const canEdit = isOwn && !message.file_type

  // Cerrar picker al click fuera
  useEffect(() => {
    if (!showPicker) return
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  // Cerrar menú al click fuera
  useEffect(() => {
    if (!showMenu) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  // Foco en el input al entrar en modo edición
  useEffect(() => {
    if (editing) editInputRef.current?.focus()
  }, [editing])

  const grouped = (message.reactions || []).reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false }
    acc[r.emoji].count++
    if (r.user_id === currentUserId) acc[r.emoji].mine = true
    return acc
  }, {})

  const handleReaction = async (emoji) => {
    setShowPicker(false)
    await reactionsApi.toggle(message.id, encodeURIComponent(emoji))
    if (onReactionUpdate) onReactionUpdate(message.id)
  }

  const handleTogglePicker = () => {
    if (!showPicker && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPickerBelow(rect.top < 160)
    }
    setShowPicker(p => !p)
  }

  const handleEdit = () => {
    setShowMenu(false)
    setEditText(message.content)
    setEditing(true)
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editText.trim() || editText.trim() === message.content) { setEditing(false); return }
    try {
      await messagesApi.edit(message.id, editText.trim())
      if (onEdited) onEdited(message.id, editText.trim())
      setEditing(false)
    } catch { setEditing(false) }
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(e) }
    if (e.key === 'Escape') { setEditing(false) }
  }

  const handleDelete = async () => {
    setShowMenu(false)
    if (!confirm('¿Borrar este mensaje?')) return
    try {
      await messagesApi.delete(message.id)
      if (onDeleted) onDeleted(message.id)
    } catch {}
  }

  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const avatarColor = message.avatar_color || '#5b5ef4'

  return (
    <div className={`msg-row ${isCompact ? 'compact' : ''}`}>
      <div className="msg-avatar-col">
        <div className="msg-avatar" style={{ background: avatarColor }}>
          {message.username[0].toUpperCase()}
        </div>
        {isCompact && <span className="msg-time-compact">{time}</span>}
      </div>

      <div className="msg-body">
        {!isCompact && (
          <div className="msg-meta">
            <span className="msg-author" style={{ color: avatarColor }}>{message.username}</span>
            <span className="msg-time">{time}</span>
            {message.edited_at && <span className="msg-edited">(editado)</span>}
          </div>
        )}

        <div className="msg-content-wrap">
          {message.file_type === 'image' && (
            <img src={message.file_url} alt="attachment" className="message-img" />
          )}
          {message.file_type === 'file' && (
            <a href={message.file_url} target="_blank" rel="noreferrer" className="message-file">
              📎 {message.file_url?.split('/').pop()}
            </a>
          )}
          {editing ? (
            <form className="edit-form" onSubmit={handleEditSubmit}>
              <input
                ref={editInputRef}
                className="edit-input"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
              />
              <span className="edit-hint">Enter para guardar · Esc para cancelar</span>
            </form>
          ) : (
            message.content && <span className="msg-text">{message.content}</span>
          )}
          {isCompact && message.edited_at && !editing && (
            <span className="msg-edited">(editado)</span>
          )}
        </div>

        {Object.keys(grouped).length > 0 && (
          <div className="reactions">
            {Object.entries(grouped).map(([emoji, { count, mine }]) => (
              <button
                key={emoji}
                className={`reaction-badge ${mine ? 'mine' : ''}`}
                onClick={() => handleReaction(emoji)}
              >
                {emoji} {count}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`msg-actions${showPicker ? ' picker-open' : ''}${showMenu ? ' picker-open' : ''}`} ref={pickerRef}>
        <button
          ref={triggerRef}
          className="reaction-trigger"
          onClick={handleTogglePicker}
          title="React"
        >😊</button>

        {(canEdit || canDelete) && (
          <div className="msg-menu-wrap" ref={menuRef}>
            <button
              className="msg-menu-trigger"
              onClick={() => setShowMenu(p => !p)}
              title="More"
            >⋯</button>
            {showMenu && (
              <div className="msg-menu">
                {canEdit && <button onClick={handleEdit}>✏️ Editar</button>}
                {canDelete && <button className="danger" onClick={handleDelete}>🗑️ Borrar</button>}
              </div>
            )}
          </div>
        )}

        {showPicker && (
          <div className={`emoji-picker${pickerBelow ? ' below' : ''}`}>
            {QUICK_EMOJIS.map(e => (
              <button key={e} onMouseDown={() => handleReaction(e)}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
