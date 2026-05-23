import { useState, useEffect, useRef, useCallback } from 'react'
import { channels as channelsApi } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import Message from '../components/Message'

export default function Chat({ user, onLogout }) {
  const [channelList, setChannelList] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [newChannel, setNewChannel] = useState('')
  const [showNewChannel, setShowNewChannel] = useState(false)
  const messagesEndRef = useRef(null)

  const handleNewMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const { send } = useWebSocket(activeChannel?.id, handleNewMessage)

  useEffect(() => {
    channelsApi.list().then(({ data }) => {
      setChannelList(data)
      if (data.length > 0) setActiveChannel(data[0])
    })
  }, [])

  useEffect(() => {
    if (!activeChannel) return
    channelsApi.messages(activeChannel.id).then(({ data }) => {
      setMessages(data)
    })
  }, [activeChannel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    send(input.trim())
    setInput('')
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

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ChatApp</h2>
          <button className="logout-btn" onClick={onLogout}>Exit</button>
        </div>
        <div className="user-info">
          <span className="user-avatar">{user.username[0].toUpperCase()}</span>
          <span>{user.username}</span>
        </div>
        <div className="channels-section">
          <div className="channels-header">
            <span>Channels</span>
            <button onClick={() => setShowNewChannel(!showNewChannel)}>+</button>
          </div>
          {showNewChannel && (
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

      {/* Main chat area */}
      <main className="chat-main">
        {activeChannel ? (
          <>
            <div className="chat-header">
              <h3># {activeChannel.name}</h3>
              {activeChannel.description && <p>{activeChannel.description}</p>}
            </div>
            <div className="messages-container">
              {messages.map(msg => (
                <Message key={msg.id} message={msg} currentUserId={user.id} />
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form className="message-input" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder={`Message #${activeChannel.name}`}
                value={input}
                onChange={e => setInput(e.target.value)}
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="no-channel">Select a channel to start chatting</div>
        )}
      </main>
    </div>
  )
}
