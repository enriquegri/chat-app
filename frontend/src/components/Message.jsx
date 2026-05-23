import { useState, useEffect, useRef } from 'react'
import { reactions as reactionsApi } from '../services/api'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export default function Message({ message, currentUserId, onReactionUpdate, isCompact }) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => {
    if (!showPicker) return
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

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

  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const avatarColor = message.avatar_color || '#5b5ef4'

  return (
    <div className={`msg-row ${isCompact ? 'compact' : ''}`}>
      <div className="msg-avatar-col">
        <div
          className="msg-avatar"
          style={{ background: avatarColor }}
        >
          {message.username[0].toUpperCase()}
        </div>
        {isCompact && <span className="msg-time-compact">{time}</span>}
      </div>

      <div className="msg-body">
        {!isCompact && (
          <div className="msg-meta">
            <span
              className="msg-author"
              style={{ color: avatarColor }}
            >
              {message.username}
            </span>
            <span className="msg-time">{time}</span>
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
          {message.content && (
            <span className="msg-text">{message.content}</span>
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

      <div className="msg-actions" ref={pickerRef}>
        <button
          className="reaction-trigger"
          onClick={() => setShowPicker(p => !p)}
          title="React"
        >😊</button>
        {showPicker && (
          <div className="emoji-picker">
            {QUICK_EMOJIS.map(e => (
              <button key={e} onMouseDown={() => handleReaction(e)}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
