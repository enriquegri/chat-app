export default function Message({ message, currentUserId }) {
  const isOwn = message.user_id === currentUserId
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`message ${isOwn ? 'own' : ''}`}>
      {!isOwn && <span className="message-author">{message.username}</span>}
      <div className="message-bubble">
        <span className="message-content">{message.content}</span>
        <span className="message-time">{time}</span>
      </div>
    </div>
  )
}
