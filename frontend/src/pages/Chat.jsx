import { useState, useEffect, useRef, useCallback } from 'react'
import { channels as channelsApi, reactions as reactionsApi, uploads, dm as dmApi, users as usersApi } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import Message from '../components/Message'

const TYPING_TIMEOUT = 2000

export default function Chat({ user, onLogout, onOpenAdmin, onOpenProfile }) {
  const [channelList, setChannelList] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [activeDMUser, setActiveDMUser] = useState(null)
  const [dmList, setDmList] = useState([])
  const [userList, setUserList] = useState([])
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [newChannel, setNewChannel] = useState('')
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const typingTimers = useRef({})
  const fileInputRef = useRef(null)
  const activeChannelRef = useRef(null)

  useEffect(() => { activeChannelRef.current = activeChannel }, [activeChannel])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        setUnread(0)
        document.title = 'ChatApp'
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ChatApp` : 'ChatApp'
  }, [unread])

  const handleNewMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { ...msg, reactions: [] }])
    if (msg.user_id === user.id) return
    if (document.hidden) {
      setUnread(prev => prev + 1)
      if ('Notification' in window && Notification.permission === 'granted') {
        const ch = activeChannelRef.current
        const n = new Notification(`#${ch?.name || 'chat'}`, {
          body: `${msg.username}: ${msg.content || '📎 attachment'}`,
          icon: '/favicon.ico',
          tag: 'chat-message',
        })
        n.onclick = () => { window.focus(); n.close() }
      }
    }
  }, [user.id])

  const handleTyping = useCallback((username) => {
    setTypingUsers(prev => prev.includes(username) ? prev : [...prev, username])
    clearTimeout(typingTimers.current[username])
    typingTimers.current[username] = setTimeout(() => {
      setTypingUsers(prev => prev.filter(u => u !== username))
    }, TYPING_TIMEOUT)
  }, [])

  const loadReactions = useCallback(async (messageId) => {
    try {
      const { data } = await reactionsApi.list(messageId)
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: data } : m))
    } catch {}
  }, [])

  const handleMessageEdited = useCallback((messageId, content) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } : m
    ))
  }, [])

  const handleMessageDeleted = useCallback((messageId) => {
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }, [])

  const { send, sendTyping } = useWebSocket(
    activeChannel?.id, handleNewMessage, handleTyping,
    loadReactions, handleMessageEdited, handleMessageDeleted
  )

  // Scroll to bottom button
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const onScroll = () => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      setShowScrollBtn(distFromBottom > 300)
    }
    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    channelsApi.list().then(({ data }) => {
      setChannelList(data)
      if (data.length > 0) setActiveChannel(data[0])
    })
    dmApi.list().then(({ data }) => setDmList(data))
    usersApi.list().then(({ data }) => setUserList(data))
  }, [])

  useEffect(() => {
    if (!activeChannel) return
    setMessages([])
    setTypingUsers([])
    setUnread(0)
    channelsApi.messages(activeChannel.id).then(({ data }) => {
      setMessages(data.map(m => ({ ...m, reactions: [] })))
      data.forEach(m => loadReactions(m.id))
    })
  }, [activeChannel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsers])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    send(input.trim())
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(e)
    }
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

  const openDM = async (u) => {
    setShowUserPicker(false)
    const { data: ch } = await dmApi.open(u.id)
    setActiveDMUser(u)
    setActiveChannel(ch)
    setDmList(prev => prev.find(d => d.channel_id === ch.id)
      ? prev
      : [{ channel_id: ch.id, user_id: u.id, username: u.username, avatar_color: u.avatar_color }, ...prev]
    )
  }

  const channelHistoryPushed = useRef(false)

  const selectChannel = (ch) => {
    setActiveDMUser(null)
    if (ch && window.innerWidth < 768) {
      window.history.pushState({ level: 'channel' }, '')
      channelHistoryPushed.current = true
    }
    setActiveChannel(ch)
  }

  const selectDM = (conv) => {
    if (window.innerWidth < 768) {
      window.history.pushState({ level: 'channel' }, '')
      channelHistoryPushed.current = true
    }
    setActiveDMUser({ id: conv.user_id, username: conv.username, avatar_color: conv.avatar_color })
    setActiveChannel({ id: conv.channel_id, name: conv.username })
  }

  const handleMobileBack = () => {
    setActiveDMUser(null)
    if (channelHistoryPushed.current) {
      channelHistoryPushed.current = false
      window.history.back()
    } else {
      setActiveChannel(null)
    }
  }

  // Gesto atrás en Android: si no hay overlay abierto, vuelve a la lista de canales
  useEffect(() => {
    const handler = (e) => {
      if (window.innerWidth < 768 && !e.state?.level && !e.state?.overlay) {
        channelHistoryPushed.current = false
        setActiveChannel(null)
        setActiveDMUser(null)
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const createChannel = async (e) => {
    e.preventDefault()
    if (!newChannel.trim()) return
    const { data } = await channelsApi.create({ name: newChannel.trim() })
    setChannelList(prev => [...prev, data])
    setActiveChannel(data)
    setNewChannel('')
    setShowNewChannel(false)
  }

  const handleSearch = (q) => {
    setSearchQuery(q)
    clearTimeout(searchTimer.current)
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await channelsApi.search(activeChannel.id, q)
        setSearchResults(data)
      } catch {}
      setSearching(false)
    }, 300)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const typingText = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length > 1
    ? `${typingUsers.join(', ')} are typing...`
    : ''

  return (
    <div className={`chat-layout${activeChannel ? ' has-channel' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ChatApp</h2>
          <button className="logout-btn" onClick={onLogout}>Exit</button>
        </div>

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
                className={`channel-item ${activeChannel?.id === ch.id && !activeDMUser ? 'active' : ''}`}
                onClick={() => selectChannel(ch)}
              >
                # {ch.name}
              </li>
            ))}
          </ul>
        </div>

        <div className="channels-section">
          <div className="channels-header">
            <span>Direct Messages</span>
            <button onClick={() => setShowUserPicker(v => !v)}>+</button>
          </div>
          {showUserPicker && (
            <div className="user-picker">
              {userList.map(u => (
                <div key={u.id} className="user-picker-item" onClick={() => openDM(u)}>
                  <span className="user-avatar-sm" style={{ background: u.avatar_color || '#5b5ef4' }}>
                    {u.username[0].toUpperCase()}
                  </span>
                  {u.username}
                </div>
              ))}
            </div>
          )}
          <ul className="channel-list">
            {dmList.map(conv => (
              <li
                key={conv.channel_id}
                className={`channel-item ${activeChannel?.id === conv.channel_id && activeDMUser ? 'active' : ''}`}
                onClick={() => selectDM(conv)}
              >
                <span className="user-avatar-sm" style={{ background: conv.avatar_color || '#5b5ef4' }}>
                  {conv.username[0].toUpperCase()}
                </span>
                {conv.username}
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-avatar" style={{ background: user.avatar_color || '#5b5ef4' }}>
              {user.username[0].toUpperCase()}
            </span>
            <div className="user-info-text">
              <span className="user-info-name">{user.username}</span>
              <button className="profile-link" onClick={onOpenProfile}>Edit profile</button>
            </div>
          </div>
          {onOpenAdmin && (
            <button className="admin-link" onClick={onOpenAdmin}>⚙ Admin Panel</button>
          )}
        </div>
      </aside>

      <main className="chat-main">
        {activeChannel ? (
          <>
            <div className="chat-header">
              <button className="mobile-back" onClick={handleMobileBack}>←</button>
              <div className="chat-header-title">
                {activeDMUser ? (
                  <h3>
                    <span className="user-avatar-sm" style={{ background: activeDMUser.avatar_color || '#5b5ef4' }}>
                      {activeDMUser.username[0].toUpperCase()}
                    </span>
                    {activeDMUser.username}
                  </h3>
                ) : (
                  <>
                    <h3># {activeChannel.name}</h3>
                    {activeChannel.description && <p>{activeChannel.description}</p>}
                  </>
                )}
              </div>
              <button
                className="search-toggle"
                onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}
                title="Search messages"
              >🔍</button>
            </div>

            {searchOpen && (
              <div className="search-bar">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                />
                {searchQuery.length >= 2 && (
                  <div className="search-results">
                    {searching && <div className="search-status">Searching...</div>}
                    {!searching && searchResults.length === 0 && (
                      <div className="search-status">No results</div>
                    )}
                    {searchResults.map(msg => (
                      <div key={msg.id} className="search-result">
                        <span className="search-result-author" style={{ color: msg.avatar_color || '#8a8f98' }}>
                          {msg.username}
                        </span>
                        <span className="search-result-content">
                          {msg.content || '📎 attachment'}
                        </span>
                        <span className="search-result-time">
                          {new Date(msg.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="messages-container" ref={messagesContainerRef}>
              {messages.map((msg, i) => {
                const prev = messages[i - 1]
                const isCompact = prev
                  && prev.user_id === msg.user_id
                  && (new Date(msg.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000

                // Separador de fecha
                const msgDate = new Date(msg.created_at).toDateString()
                const prevDate = prev ? new Date(prev.created_at).toDateString() : null
                const showDateSep = msgDate !== prevDate

                const today = new Date().toDateString()
                const yesterday = new Date(Date.now() - 86400000).toDateString()
                const dateLabel = msgDate === today ? 'Hoy'
                  : msgDate === yesterday ? 'Ayer'
                  : new Date(msg.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

                return (
                  <div key={msg.id}>
                    {showDateSep && <div className="date-separator"><span>{dateLabel}</span></div>}
                    <Message
                      message={msg}
                      currentUserId={user.id}
                      currentUserRole={user.role}
                      onReactionUpdate={loadReactions}
                      onEdited={handleMessageEdited}
                      onDeleted={handleMessageDeleted}
                      isCompact={!showDateSep && isCompact}
                    />
                  </div>
                )
              })}
              {typingText && (
                <div className="typing-indicator">{typingText}</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {showScrollBtn && (
              <button
                className="scroll-to-bottom"
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                ↓{unread > 0 ? ` ${unread}` : ''}
              </button>
            )}

            <form className="composer" onSubmit={sendMessage}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="image/*,.pdf,.txt"
              />
              <input
                className="composer-input"
                type="text"
                placeholder={activeDMUser ? `Message ${activeDMUser.username}` : `Message #${activeChannel.name}`}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />
              <div className="composer-actions">
                <button
                  type="button"
                  className="attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Attach file"
                >
                  {uploading ? '⏳' : '📎'}
                </button>
                <button
                  type="submit"
                  className="send-btn"
                  disabled={!input.trim()}
                  title="Send"
                >→</button>
              </div>
            </form>
          </>
        ) : (
          <div className="no-channel">Select a channel or contact to start chatting</div>
        )}
      </main>
    </div>
  )
}
