import { useEffect, useRef, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'

export function useWebSocket(channelId, onMessage) {
  const ws = useRef(null)

  const connect = useCallback(() => {
    if (!channelId) return

    const token = localStorage.getItem('token')
    if (!token) return

    const url = `${WS_URL}/ws/${channelId}?token=${token}`
    ws.current = new WebSocket(url)

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'message') onMessage(data.message)
      } catch {}
    }

    ws.current.onerror = () => console.error('WebSocket error')
    ws.current.onclose = () => {
      setTimeout(connect, 3000)
    }
  }, [channelId, onMessage])

  useEffect(() => {
    connect()
    return () => {
      if (ws.current) {
        ws.current.onclose = null
        ws.current.close()
      }
    }
  }, [connect])

  const send = useCallback((content) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'message', content }))
    }
  }, [])

  return { send }
}
