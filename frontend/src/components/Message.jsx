import { useState, useEffect, useRef } from 'react'
import { reactions as reactionsApi } from '../services/api'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export default function Message({ message, currentUserId, onReactionUpdate }) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef(null)

  // Cierra el picker al hacer click fuera
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

  const isOwn = message.user_id === currentUserId
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`message ${isOwn ? 'own' : ''}`}>
      {!isOwn && (
        <span className="message-author" style={{ color: message.avatar_color || '#9ea3a8' }}>
          {message.username}
        </span>
      )}

      <div className="message-bubble-wrap">
        <div className="message-bubble">
          {message.file_type === 'image' && (
            <img src={message.file_url} alt="attachment" className="message-img" />
          )}
          {message.file_type === 'file' && (
            <a href={message.file_url} target="_blank" rel="noreferrer" className="message-file">
              📎 {message.file_url?.split('/').pop()}
            </a>
          )}
          {message.content && (
            <span className="message-content">{message.content}</span>
          )}
          <span className="message-time">{time}</span>
        </div>

        <div className="reaction-wrap" ref={pickerRef}>
          <button
            className="reaction-trigger"
            onClick={() => setShowPicker(p => !p)}
            title="Reaccionar"
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
  )
}
