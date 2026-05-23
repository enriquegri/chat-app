import { useEffect, useRef, useCallback } from 'react'

export function useWebSocket(channelId, onMessage, onTyping) {
  const ws = useRef(null)

  const connect = useCallback(() => {
    if (!channelId) return
    const token = localStorage.getItem('token')
    if (!token) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws/${channelId}?token=${token}`
    ws.current = new WebSocket(url)

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'message') onMessage(data.message)
        if (data.type === 'typing' && onTyping) onTyping(data.username)
      } catch {}
    }

    ws.current.onerror = () => console.error('WebSocket error')
    ws.current.onclose = () => { setTimeout(connect, 3000) }
  }, [channelId, onMessage, onTyping])

  useEffect(() => {
    connect()
    return () => {
      if (ws.current) { ws.current.onclose = null; ws.current.close() }
    }
  }, [connect])

  const send = useCallback((content, fileUrl = '', fileType = '') => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'message', content, file_url: fileUrl, file_type: fileType }))
    }
  }, [])

  const sendTyping = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'typing' }))
    }
  }, [])

  return { send, sendTyping }
}
