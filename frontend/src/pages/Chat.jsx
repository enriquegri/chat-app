import { useState, useEffect, useRef, useCallback } from 'react'
import { channels as channelsApi, reactions as reactionsApi, uploads } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import Message from '../components/Message'

const TYPING_TIMEOUT = 2000

export default function Chat({ user, onLogout, onOpenAdmin }) {
  const [channelList, setChannelList] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [newChannel, setNewChannel] = useState('')
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [uploading, setUploading] = useState(false)
  const messagesEndRef = useRef(null)
  const typingTimers = useRef({})
  const fileInputRef = useRef(null)

  const handleNewMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { ...msg, reactions: [] }])
  }, [])

  const handleTyping = useCallback((username) => {
    setTypingUsers(prev => prev.includes(username) ? prev : [...prev, username])
    clearTimeout(typingTimers.current[username])
    typingTimers.current[username] = setTimeout(() => {
      setTypingUsers(prev => prev.filter(u => u !== username))
    }, TYPING_TIMEOUT)
  }, [])

  const { send, sendTyping } = useWebSocket(activeChannel?.id, handleNewMessage, handleTyping)

  useEffect(() => {
    channelsApi.list().then(({ data }) => {
      setChannelList(data)
      if (data.length > 0) setActiveChannel(data[0])
    })
  }, [])

  useEffect(() => {
    if (!activeChannel) return
    setMessages([])
    setTypingUsers([])
    channelsApi.messages(activeChannel.id).then(({ data }) => {
      setMessages(data.map(m => ({ ...m, reactions: [] })))
      // Cargar reactions para todos los mensajes
      data.forEach(m => loadReactions(m.id))
    })
  }, [activeChannel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsers])

  const loadReactions = async (messageId) => {
    try {
      const { data } = await reactionsApi.list(messageId)
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: data } : m))
    } catch {}
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    send(input.trim())
    setInput('')
  }

  const handleInputChange = (e) => {
    setInput(e.target.value)
    sendTyping()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const { data } = await uploads.upload(file)
      send('', data.url, data.file_type)
    } catch {
      alert('Error uploading file')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const createChannel = async (e) => {
    e.preventDefault()
    if (!newChannel.trim()) return
    const { data } = await channelsApi.create({ name: newChannel.trim() })
    setChannelList(prev => [...prev, data])
    setActiveChannel(data)
    setNewChannel('')
    setShowNewChannel(false)
  }

  const typingText = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length > 1
    ? `${typingUsers.join(', ')} are typing...`
    : ''

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ChatApp</h2>
          <button className="logout-btn" onClick={onLogout}>Exit</button>
        </div>
        <div className="user-info">
          <span className="user-avatar">{user.username[0].toUpperCase()}</span>
          <span>{user.username}</span>
        </div>
        {onOpenAdmin && (
          <button className="admin-link" onClick={onOpenAdmin}>⚙ Admin Panel</button>
        )}
        <div className="channels-section">
          <div className="channels-header">
            <span>Channels</span>
            {user.role === 'admin' && (
              <button onClick={() => setShowNewChannel(!showNewChannel)}>+</button>
            )}
          </div>
          {showNewChannel && user.role === 'admin' && (
            <form onSubmit={createChannel} className="new-channel-form">
              <input
                type="text"
                placeholder="channel-name"
                value={newChannel}
                onChange={e => setNewChannel(e.target.value)}
                autoFocus
              />
              <button type="submit">Create</button>
            </form>
          )}
          <ul className="channel-list">
            {channelList.map(ch => (
              <li
                key={ch.id}
                className={`channel-item ${activeChannel?.id === ch.id ? 'active' : ''}`}
                onClick={() => setActiveChannel(ch)}
              >
                # {ch.name}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="chat-main">
        {activeChannel ? (
          <>
            <div className="chat-header">
              <h3># {activeChannel.name}</h3>
              {activeChannel.description && <p>{activeChannel.description}</p>}
            </div>
            <div className="messages-container">
              {messages.map(msg => (
                <Message
                  key={msg.id}
                  message={msg}
                  currentUserId={user.id}
                  onReactionUpdate={loadReactions}
                />
              ))}
              {typingText && (
                <div className="typing-indicator">{typingText}</div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form className="message-input" onSubmit={sendMessage}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="image/*,.pdf,.txt"
              />
              <button
                type="button"
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Attach file"
              >
                {uploading ? '⏳' : '📎'}
              </button>
              <input
                type="text"
                placeholder={`Message #${activeChannel.name}`}
                value={input}
                onChange={handleInputChange}
              />
              <button type="submit" disabled={!input.trim()}>Send</button>
            </form>
          </>
        ) : (
          <div className="no-channel">Select a channel to start chatting</div>
        )}
      </main>
    </div>
  )
}
