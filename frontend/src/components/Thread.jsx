import { useState, useEffect, useRef } from 'react'
import { messages as messagesApi, reactions as reactionsApi } from '../services/api'
import Message from './Message'

export default function Thread({
  parentMessage,
  currentUserId,
  currentUserRole,
  currentUsername,
  onClose,
  send,           // WebSocket send fn
  newReply,       // última reply recibida por WS (puede ser null)
  onReactionUpdate,
  onEdited,
  onDeleted,
}) {
  const [replies, setReplies] = useState([])
  const [input, setInput] = useState('')
  const endRef = useRef(null)
  const inputRef = useRef(null)

  // Cargar respuestas al abrir el hilo
  useEffect(() => {
    if (!parentMessage) return
    messagesApi.thread(parentMessage.id).then(({ data }) => {
      setReplies(data.map(m => ({ ...m, reactions: [] })))
      data.forEach(m =>
        reactionsApi.list(m.id).then(r => {
          setReplies(prev => prev.map(x => x.id === m.id ? { ...x, reactions: r.data } : x))
        }).catch(() => {})
      )
    }).catch(() => {})
  }, [parentMessage?.id])

  // Recibir nueva reply por WS
  useEffect(() => {
    if (!newReply || !parentMessage) return
    if (newReply.reply_to_id !== parentMessage.id) return
    setReplies(prev => {
      if (prev.find(r => r.id === newReply.id)) return prev
      return [...prev, { ...newReply, reactions: [] }]
    })
  }, [newReply, parentMessage?.id])

  // Scroll al añadir replies
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [replies])

  const handleLoadReactions = async (messageId) => {
    try {
      const { data } = await reactionsApi.list(messageId)
      setReplies(prev => prev.map(m => m.id === messageId ? { ...m, reactions: data } : m))
    } catch {}
  }

  const handleEdited = (msgId, content) => {
    setReplies(prev => prev.map(m =>
      m.id === msgId ? { ...m, content, edited_at: new Date().toISOString() } : m
    ))
    if (onEdited) onEdited(msgId, content)
  }

  const handleDeleted = (msgId) => {
    setReplies(prev => prev.filter(m => m.id !== msgId))
    if (onDeleted) onDeleted(msgId)
  }

  const handleSend = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    send(input.trim(), '', '', parentMessage.id)
    setInput('')
    inputRef.current?.focus()
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) }
  }

  if (!parentMessage) return null

  const time = new Date(parentMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const avatarColor = parentMessage.avatar_color || '#5b5ef4'

  return (
    <div className="thread-panel">
      <div className="thread-header">
        <span className="thread-title">Hilo</span>
        <button className="thread-close" onClick={onClose} title="Cerrar hilo">✕</button>
      </div>

      <div className="thread-body">
        {/* Mensaje original */}
        <div className="thread-parent">
          <div className="msg-row">
            <div className="msg-avatar-col">
              <div className="msg-avatar" style={{ background: avatarColor }}>
                {parentMessage.username[0].toUpperCase()}
              </div>
            </div>
            <div className="msg-body">
              <div className="msg-meta">
                <span className="msg-author" style={{ color: avatarColor }}>{parentMessage.username}</span>
                <span className="msg-time">{time}</span>
              </div>
              <div className="msg-content-wrap">
                {parentMessage.content && (
                  <span className="msg-text">{parentMessage.content}</span>
                )}
                {parentMessage.file_type === 'image' && (
                  <img src={parentMessage.file_url} alt="attachment" className="message-img" />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="thread-divider">
          <span>{replies.length} {replies.length === 1 ? 'respuesta' : 'respuestas'}</span>
        </div>

        {/* Respuestas */}
        <div className="thread-replies">
          {replies.map((msg, i) => {
            const prev = replies[i - 1]
            const isCompact = prev
              && prev.user_id === msg.user_id
              && (new Date(msg.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000
            return (
              <Message
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                currentUsername={currentUsername}
                onReactionUpdate={handleLoadReactions}
                onEdited={handleEdited}
                onDeleted={handleDeleted}
                isCompact={isCompact}
                isThreadReply
              />
            )
          })}
          <div ref={endRef} />
        </div>
      </div>

      <form className="thread-composer" onSubmit={handleSend}>
        <input
          ref={inputRef}
          className="composer-input"
          placeholder={`Responder a ${parentMessage.username}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          autoFocus
        />
        <button type="submit" className="send-btn" disabled={!input.trim()}>→</button>
      </form>
    </div>
  )
}
