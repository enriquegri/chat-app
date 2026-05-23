import { useState } from 'react'
import { reactions as reactionsApi } from '../services/api'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export default function Message({ message, currentUserId, onReactionUpdate }) {
  const [showPicker, setShowPicker] = useState(false)

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
    <div className={`message ${isOwn ? 'own' : ''}`}
      onMouseLeave={() => setShowPicker(false)}>
      {!isOwn && <span className="message-author">{message.username}</span>}

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

        <button className="reaction-trigger" onClick={() => setShowPicker(p => !p)}>😊</button>

        {showPicker && (
          <div className="emoji-picker">
            {QUICK_EMOJIS.map(e => (
              <button key={e} onClick={() => handleReaction(e)}>{e}</button>
            ))}
          </div>
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
  )
}
