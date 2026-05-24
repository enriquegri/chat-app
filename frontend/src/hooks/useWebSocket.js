import { useEffect, useRef, useCallback } from 'react'

export function useWebSocket(channelId, onMessage, onTyping, onReactionUpdate, onMessageEdited, onMessageDeleted, onOnlineUpdate, onCallState) {
  const ws = useRef(null)

  const connect = useCallback(() => {
    if (!channelId) return
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp && payload.exp * 1000 < Date.now()) return
    } catch { return }

    const apiHost = import.meta.env.VITE_API_HOST || window.location.host
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${apiHost}/ws/${channelId}?token=${token}`
    ws.current = new WebSocket(url)

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'message') onMessage(data.message)
        if (data.type === 'typing' && onTyping) onTyping(data.username)
        if (data.type === 'reaction_update' && onReactionUpdate) onReactionUpdate(data.message_id)
        if (data.type === 'message_edited' && onMessageEdited) onMessageEdited(data.message_id, data.content)
        if (data.type === 'message_deleted' && onMessageDeleted) onMessageDeleted(data.message_id)
        if (data.type === 'online_update' && onOnlineUpdate) onOnlineUpdate(data.count, data.users)
        if (data.type === 'call_state' && onCallState) onCallState(data.call_participants || [])
      } catch {}
    }

    ws.current.onerror = () => console.error('WebSocket error')
    ws.current.onclose = () => { setTimeout(connect, 3000) }
  }, [channelId, onMessage, onTyping, onReactionUpdate, onMessageEdited, onMessageDeleted, onOnlineUpdate])

  useEffect(() => {
    connect()
    return () => {
      if (ws.current) { ws.current.onclose = null; ws.current.close() }
    }
  }, [connect])

  const send = useCallback((content, fileUrl = '', fileType = '', replyToId = 0) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'message', content, file_url: fileUrl, file_type: fileType, reply_to_id: replyToId }))
    }
  }, [])

  const sendTyping = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'typing' }))
    }
  }, [])

  const sendCallSignal = useCallback((payload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ channel_id: channelId, ...payload }))
    }
  }, [channelId])

  return { send, sendTyping, sendCallSignal }
}
