import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { channels as channelsApi, reactions as reactionsApi, uploads, dm as dmApi, users as usersApi } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { usePushNotifications } from '../hooks/usePushNotifications'
import Message from '../components/Message'
import GlobalSearch from '../components/GlobalSearch'
import Thread from '../components/Thread'

const TYPING_TIMEOUT = 2000

// ── localStorage persistence ──────────────────────────────────────────────────
const LS_MSG_KEY    = 'chatapp_msg_v2'
const LS_SCROLL_KEY = 'chatapp_scroll_v2'
const LS_ACTIVE_KEY = 'chatapp_active_ch'
const LS_ONLINE_KEY = 'chatapp_online_v1'
const MAX_MSG_PER_CH = 200   // cap per channel to stay well under the 5 MB quota
const PAGE_SIZE = 50

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {} // ignore quota errors
}

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
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [onlineCount, setOnlineCount] = useState(0)
  const [newChannelPrivate, setNewChannelPrivate] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [activeThread, setActiveThread] = useState(null)
  const [lastThreadReply, setLastThreadReply] = useState(null)
  const activeThreadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const composerInputRef = useRef(null)
  const typingTimers = useRef({})
  const fileInputRef = useRef(null)
  const activeChannelRef = useRef(null)
  // Cache: channelId (string) → Message[] — pre-seeded from localStorage
  const messageCache = useRef((() => {
    const map = new Map()
    const stored = lsGet(LS_MSG_KEY) || {}
    Object.entries(stored).forEach(([k, v]) => map.set(k, v))
    return map
  })())
  // Hover-prefetch timers: channelId → timeoutId
  const hoverTimers = useRef({})
  // Scroll state per channel: channelId (string) → { atBottom, scrollTop }
  const scrollState = useRef((() => {
    const map = new Map()
    const stored = lsGet(LS_SCROLL_KEY) || {}
    Object.entries(stored).forEach(([k, v]) => map.set(k, v))
    return map
  })())
  // Debounce timer for persisting scroll state (fires many times per second)
  const scrollPersistTimer = useRef(null)
  // True right after a channel switch — triggers instant scroll
  const isInitialLoad = useRef(false)
  // True when fresh API data replaces cache after a channel switch (second setMessages)
  const pendingScrollRestore = useRef(false)
  // Stores prevScrollHeight before prepending older messages; useLayoutEffect reads it
  const prependScrollRef = useRef(null)
  // Suppresses saving scroll position during programmatic scroll
  const suppressScrollSave = useRef(false)
  // Pagination
  const hasMoreRef = useRef(false)          // whether older messages exist
  const loadingMoreRef = useRef(false)      // prevents concurrent fetches
  const oldestMsgIdRef = useRef(null)       // ID of the top-most loaded message
  const [loadingMore, setLoadingMore] = useState(false)
  // Online count cache: channelId → count (persisted to localStorage)
  const onlineCacheRef = useRef(lsGet(LS_ONLINE_KEY) || {})

  useEffect(() => { activeThreadRef.current = activeThread }, [activeThread])

  // Ctrl+K / Cmd+K opens global search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowGlobalSearch(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  usePushNotifications()

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

  // Flush the entire message cache to localStorage (trimmed to MAX_MSG_PER_CH)
  const persistCache = useCallback(() => {
    const obj = {}
    messageCache.current.forEach((msgs, chId) => {
      obj[chId] = msgs.filter(m => !m._temp).slice(-MAX_MSG_PER_CH)
    })
    lsSet(LS_MSG_KEY, obj)
  }, [])

  // Debounced flush of scroll state (scroll events fire hundreds of times/second)
  const persistScroll = useCallback(() => {
    clearTimeout(scrollPersistTimer.current)
    scrollPersistTimer.current = setTimeout(() => {
      const obj = {}
      scrollState.current.forEach((v, k) => { obj[k] = v })
      lsSet(LS_SCROLL_KEY, obj)
    }, 400)
  }, [])

  // updateCache must be defined BEFORE callbacks that use it
  const updateCache = useCallback((updater) => {
    const chId = activeChannelRef.current?.id
    if (!chId) return
    const key = String(chId)
    messageCache.current.set(key, updater(messageCache.current.get(key) || []))
    persistCache()
  }, [persistCache])

  const handleNewMessage = useCallback((msg) => {
    if (msg.reply_to_id) {
      // Es una reply — no va al feed principal, actualiza el contador del padre
      setMessages(prev => {
        const next = prev.map(m =>
          m.id === msg.reply_to_id
            ? { ...m, reply_count: (m.reply_count || 0) + 1 }
            : m
        )
        updateCache(() => next)
        return next
      })
      setLastThreadReply(msg)
      return
    }

    setMessages(prev => {
      // Replace optimistic temp message if it's ours and content matches
      const tempIdx = prev.findIndex(m =>
        m._temp && m.content === msg.content && m.user_id === msg.user_id
      )
      const next = tempIdx !== -1
        ? prev.map((m, i) => i === tempIdx ? { ...msg, reactions: [] } : m)
        : [...prev, { ...msg, reactions: [] }]
      updateCache(() => next)
      return next
    })

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
  }, [user.id, updateCache])

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
      setMessages(prev => {
        const next = prev.map(m => m.id === messageId ? { ...m, reactions: data } : m)
        updateCache(() => next)
        return next
      })
    } catch {}
  }, [updateCache])

  const handleMessageEdited = useCallback((messageId, content) => {
    setMessages(prev => {
      const next = prev.map(m =>
        m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } : m
      )
      updateCache(() => next)
      return next
    })
  }, [updateCache])

  const handleMessageDeleted = useCallback((messageId) => {
    setMessages(prev => {
      const next = prev.filter(m => m.id !== messageId)
      updateCache(() => next)
      return next
    })
  }, [updateCache])

  const handleOnlineUpdate = useCallback((count) => {
    const chId = activeChannelRef.current?.id
    if (chId) {
      onlineCacheRef.current[String(chId)] = count
      lsSet(LS_ONLINE_KEY, onlineCacheRef.current)
    }
    setOnlineCount(count)
  }, [])

  const { send, sendTyping } = useWebSocket(
    activeChannel?.id, handleNewMessage, handleTyping,
    loadReactions, handleMessageEdited, handleMessageDeleted, handleOnlineUpdate
  )

  // Cargar mensajes más antiguos (scroll hacia arriba — paginación)
  // Debe estar definido ANTES del scroll listener que lo referencia en deps
  const loadMoreMessages = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    const chId = activeChannelRef.current?.id
    if (!chId || !oldestMsgIdRef.current) return

    loadingMoreRef.current = true
    setLoadingMore(true)

    const container = messagesContainerRef.current

    try {
      const { data } = await channelsApi.messages(chId, { before_id: oldestMsgIdRef.current })
      const older = (data.messages || []).map(m => ({ ...m, reactions: m.reactions ?? [] }))

      hasMoreRef.current = data.has_more
      if (older.length > 0) oldestMsgIdRef.current = older[0].id

      // Captura la altura ANTES del re-render; useLayoutEffect la usa para restaurar
      prependScrollRef.current = container?.scrollHeight ?? 0

      setMessages(prev => {
        const merged = [...older, ...prev]
        const key = String(chId)
        messageCache.current.set(key, merged.slice(-MAX_MSG_PER_CH))
        persistCache()
        return merged
      })
    } catch {}

    loadingMoreRef.current = false
    setLoadingMore(false)
  }, [persistCache])

  // Scroll listener: show "↓" button + save per-channel scroll position.
  // Depends on activeChannel so it re-runs after the messages-container appears
  // in the DOM (it's not rendered until a channel is selected).
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distFromBottom = scrollHeight - scrollTop - clientHeight
      setShowScrollBtn(distFromBottom > 300)

      // Trigger pagination when near the top
      if (scrollTop < 200 && !loadingMoreRef.current && hasMoreRef.current) {
        loadMoreMessages()
      }

      // Persist scroll state so we can restore it when coming back to this channel
      if (!suppressScrollSave.current) {
        const chId = activeChannelRef.current?.id
        if (chId) {
          scrollState.current.set(String(chId), {
            atBottom: distFromBottom < 100,
            scrollTop,
          })
          persistScroll()
        }
      }
    }
    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [activeChannel, loadMoreMessages]) // re-run when channel changes so we always have a live listener

  useEffect(() => {
    channelsApi.list().then(({ data }) => {
      setChannelList(data)
      if (data.length === 0) return
      // Restore the last active channel (or fall back to the first one)
      const lastId = lsGet(LS_ACTIVE_KEY)
      const restored = lastId ? data.find(c => String(c.id) === String(lastId)) : null
      setActiveChannel(restored ?? data[0])
    })
    dmApi.list().then(({ data }) => setDmList(data))
    usersApi.list().then(({ data }) => setUserList(data))
  }, [])

  useEffect(() => {
    if (!activeChannel) return
    activeChannelRef.current = activeChannel  // actualizar ANTES de suppressScrollSave
    suppressScrollSave.current = true         // cerrar la ventana de race condition
    isInitialLoad.current = true
    setTypingUsers([])
    setUnread(0)
    setOnlineCount(0)
    setActiveThread(null)

    // Show cached messages immediately (zero-latency switch — may be from localStorage)
    const chKey = String(activeChannel.id)
    const cached = messageCache.current.get(chKey)
    pendingScrollRestore.current = true
    setMessages(cached ?? [])

    // Restore online count from cache immediately
    setOnlineCount(onlineCacheRef.current[chKey] ?? 0)

    // Pagination state: assume there may be more until the server tells us otherwise
    hasMoreRef.current = true
    loadingMoreRef.current = false
    oldestMsgIdRef.current = cached?.[0]?.id ?? null

    // Background refresh — reactions embedded, no N+1 requests
    const applyFreshMessages = (data, key) => {
      const fresh = (data.messages || []).map(m => ({ ...m, reactions: m.reactions ?? [] }))
      hasMoreRef.current = data.has_more
      setMessages(prev => {
        const temps = prev.filter(m => m._temp)
        const nonTemps = prev.filter(m => !m._temp)

        // Preservar mensajes más antiguos cargados por paginación.
        // fresh[0] es el más antiguo del lote fresco (el backend devuelve ASC).
        const oldestFreshTs = fresh[0]?.created_at ?? null
        const oldestFreshId = fresh[0]?.id ?? null
        const olderHistory = oldestFreshTs
          ? nonTemps.filter(m =>
              new Date(m.created_at) < new Date(oldestFreshTs) ||
              (m.created_at === oldestFreshTs && m.id < oldestFreshId))
          : []

        // Solo actualizar oldestMsgIdRef si no hay historial paginado previo
        if (olderHistory.length > 0) {
          oldestMsgIdRef.current = olderHistory[0].id
        } else {
          oldestMsgIdRef.current = fresh[0]?.id ?? null
        }

        const merged = [...olderHistory, ...fresh, ...temps]
        messageCache.current.set(key, merged.slice(-MAX_MSG_PER_CH))
        persistCache()
        return merged
      })
    }

    channelsApi.messages(activeChannel.id)
      .then(({ data }) => applyFreshMessages(data, chKey))
      .catch(() => {
        // Retry once after 2 s (handles CORS-preflight race on first load)
        const retryId = setTimeout(() => {
          if (activeChannelRef.current?.id !== activeChannel.id) return
          channelsApi.messages(activeChannel.id)
            .then(({ data }) => applyFreshMessages(data, chKey))
            .catch(() => {})
        }, 2000)
        return () => clearTimeout(retryId)
      })
  }, [activeChannel, persistCache])

  // Restaura el scroll sincrónicamente tras prepend de mensajes antiguos,
  // antes de que el navegador pinte (evita el salto visual).
  useLayoutEffect(() => {
    if (prependScrollRef.current === null) return
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTop += container.scrollHeight - prependScrollRef.current
    }
    prependScrollRef.current = null
  }, [messages])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || messages.length === 0) return

    if (isInitialLoad.current || pendingScrollRestore.current) {
      // First render after channel switch (or fresh data replacing cache): restore position
      isInitialLoad.current = false
      pendingScrollRestore.current = false
      const chId = activeChannelRef.current?.id
      const state = chId ? scrollState.current.get(String(chId)) : null

      suppressScrollSave.current = true
      if (state && !state.atBottom) {
        // User was reading history — restore their exact position
        container.scrollTop = state.scrollTop
      } else {
        // First visit or was at bottom — jump to end
        container.scrollTop = container.scrollHeight
      }
      setTimeout(() => { suppressScrollSave.current = false }, 100)
      return
    }

    // Subsequent updates (new WS message, typing…): smooth scroll only if near bottom
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distFromBottom < 150) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, typingUsers])

  const sendMessage = async (e) => {
    e.preventDefault()
    const content = input.trim()
    if (!content) return

    // Optimistic: add temp message immediately for instant feedback
    const tempId = `temp_${Date.now()}`
    const tempMsg = {
      id: tempId,
      _temp: true,
      content,
      user_id: user.id,
      username: user.username,
      avatar_color: user.avatar_color || '#5b5ef4',
      created_at: new Date().toISOString(),
      reactions: [],
      reply_count: 0,
      channel_id: activeChannel?.id,
    }
    setInput('')
    setMessages(prev => [...prev, tempMsg])

    try {
      send(content, '', '', 0)
    } catch {
      // Network error — remove optimistic message and restore input
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setInput(content)
    }
  }

  const handleKeyDown = (e) => {
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex].username); return }
      if (e.key === 'Escape') { setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(e)
    }
  }

  const mentionSuggestions = mentionQuery !== null
    ? userList.filter(u => u.username.toLowerCase().startsWith(mentionQuery.toLowerCase()) && u.id !== user.id).slice(0, 6)
    : []

  const insertMention = (username) => {
    const atIndex = input.lastIndexOf('@')
    const newInput = input.slice(0, atIndex) + '@' + username + ' '
    setInput(newInput)
    setMentionQuery(null)
    setMentionIndex(0)
    composerInputRef.current?.focus()
  }

  const handleInputChange = (e) => {
    const val = e.target.value
    setInput(val)
    sendTyping()
    // Detectar mención: buscar @ seguido de texto sin espacios al final
    const match = val.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
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
    lsSet(LS_ACTIVE_KEY, ch.id)
    setActiveDMUser(u)
    setActiveChannel(ch)
    setDmList(prev => prev.find(d => d.channel_id === ch.id)
      ? prev
      : [{ channel_id: ch.id, user_id: u.id, username: u.username, avatar_color: u.avatar_color }, ...prev]
    )
  }

  // Prefetch messages on hover (200ms delay to avoid spurious loads)
  const prefetchChannel = useCallback((channelId) => {
    const key = String(channelId)
    if (messageCache.current.has(key)) return // already cached (memory or localStorage)
    if (hoverTimers.current[key]) return       // already scheduled
    hoverTimers.current[key] = setTimeout(async () => {
      delete hoverTimers.current[key]
      if (messageCache.current.has(key)) return
      try {
        const { data } = await channelsApi.messages(channelId)
        const msgs = (data.messages || []).map(m => ({ ...m, reactions: m.reactions ?? [] }))
        messageCache.current.set(key, msgs)
        persistCache()
      } catch {}
    }, 200)
  }, [persistCache])

  const cancelPrefetch = useCallback((channelId) => {
    const key = String(channelId)
    if (hoverTimers.current[key]) {
      clearTimeout(hoverTimers.current[key])
      delete hoverTimers.current[key]
    }
  }, [])

  const channelHistoryPushed = useRef(false)

  const selectChannel = (ch) => {
    setActiveDMUser(null)
    if (ch && window.innerWidth < 768) {
      window.history.pushState({ level: 'channel' }, '')
      channelHistoryPushed.current = true
    }
    if (ch) lsSet(LS_ACTIVE_KEY, ch.id)
    setActiveChannel(ch)
  }

  const selectDM = (conv) => {
    if (window.innerWidth < 768) {
      window.history.pushState({ level: 'channel' }, '')
      channelHistoryPushed.current = true
    }
    lsSet(LS_ACTIVE_KEY, conv.channel_id)
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
    const { data } = await channelsApi.create({ name: newChannel.trim(), is_private: newChannelPrivate })
    setChannelList(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setActiveChannel(data)
    setNewChannel('')
    setNewChannelPrivate(false)
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

  const jumpToChannel = (channelId, channelName) => {
    const ch = channelList.find(c => c.id === channelId)
    if (ch) {
      selectChannel(ch)
    } else {
      // Channel not in list yet — create a stub to navigate there
      selectChannel({ id: channelId, name: channelName })
    }
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
          <div className="sidebar-header-actions">
            <button className="sidebar-search-btn" onClick={() => setShowGlobalSearch(true)} title="Buscar (Ctrl+K)">🔍</button>
            <button className="logout-btn" onClick={onLogout}>Exit</button>
          </div>
        </div>
        <button className="global-search-bar" onClick={() => setShowGlobalSearch(true)}>
          <span className="global-search-icon">🔍</span>
          <span className="global-search-placeholder">Buscar…</span>
          <span className="global-search-shortcut">⌘K</span>
        </button>

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
              <label className="private-toggle">
                <input
                  type="checkbox"
                  checked={newChannelPrivate}
                  onChange={e => setNewChannelPrivate(e.target.checked)}
                />
                Privado
              </label>
              <button type="submit">Create</button>
            </form>
          )}
          <ul className="channel-list">
            {channelList.map(ch => (
              <li
                key={ch.id}
                className={`channel-item ${activeChannel?.id === ch.id && !activeDMUser ? 'active' : ''}`}
                onClick={() => selectChannel(ch)}
                onMouseEnter={() => prefetchChannel(ch.id)}
                onMouseLeave={() => cancelPrefetch(ch.id)}
              >
                {ch.is_private ? '🔒' : '#'} {ch.name}
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
                onMouseEnter={() => prefetchChannel(conv.channel_id)}
                onMouseLeave={() => cancelPrefetch(conv.channel_id)}
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

      {showGlobalSearch && (
        <GlobalSearch
          onClose={() => setShowGlobalSearch(false)}
          onJumpToChannel={jumpToChannel}
        />
      )}

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
                    <h3>{activeChannel.is_private ? '🔒' : '#'} {activeChannel.name}</h3>
                    <div className="channel-header-meta">
                      {activeChannel.description && <span>{activeChannel.description}</span>}
                      {onlineCount > 0 && <span className="online-badge">● {onlineCount} online</span>}
                    </div>
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
              {loadingMore && (
                <div className="load-more-indicator">Cargando mensajes anteriores…</div>
              )}
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
                      currentUsername={user.username}
                      onReactionUpdate={loadReactions}
                      onEdited={handleMessageEdited}
                      onDeleted={handleMessageDeleted}
                      onOpenThread={setActiveThread}
                      isCompact={!showDateSep && isCompact && !msg.reply_to_id}
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
              {mentionSuggestions.length > 0 && (
                <div className="mention-dropdown">
                  {mentionSuggestions.map((u, i) => (
                    <div
                      key={u.id}
                      className={`mention-item${i === mentionIndex ? ' active' : ''}`}
                      onMouseDown={() => insertMention(u.username)}
                    >
                      <span className="user-avatar-sm" style={{ background: u.avatar_color || '#5b5ef4' }}>
                        {u.username[0].toUpperCase()}
                      </span>
                      @{u.username}
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={composerInputRef}
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

      {activeThread && (
        <Thread
          parentMessage={activeThread}
          currentUserId={user.id}
          currentUserRole={user.role}
          currentUsername={user.username}
          onClose={() => setActiveThread(null)}
          send={send}
          newReply={lastThreadReply}
          onReactionUpdate={loadReactions}
          onEdited={handleMessageEdited}
          onDeleted={handleMessageDeleted}
        />
      )}
    </div>
  )
}
