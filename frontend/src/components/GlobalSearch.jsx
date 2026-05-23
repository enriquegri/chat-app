import { useState, useEffect, useRef } from 'react'
import { channels as channelsApi } from '../services/api'

export default function GlobalSearch({ onClose, onJumpToChannel }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSearch = (val) => {
    setQuery(val)
    clearTimeout(timer.current)
    if (val.length < 2) { setResults([]); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const { data } = await channelsApi.globalSearch(val)
        setResults(data || [])
      } catch {}
      setLoading(false)
    }, 300)
  }

  const formatDate = (ts) => {
    const d = new Date(ts)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }

  const highlight = (text, q) => {
    if (!q || !text) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div className="gs-backdrop" onMouseDown={onClose}>
      <div className="gs-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="gs-header">
          <span className="gs-icon">🔍</span>
          <input
            ref={inputRef}
            className="gs-input"
            placeholder="Buscar en todos los canales…"
            value={query}
            onChange={e => handleSearch(e.target.value)}
          />
          {loading && <span className="gs-spinner">⏳</span>}
          <button className="gs-close" onClick={onClose} title="Cerrar (Esc)">✕</button>
        </div>

        {query.length >= 2 && (
          <div className="gs-results">
            {results.length === 0 && !loading && (
              <div className="gs-empty">No se encontraron resultados para «{query}»</div>
            )}
            {results.map(msg => (
              <button
                key={msg.id}
                className="gs-result"
                onClick={() => { onJumpToChannel(msg.channel_id, msg.channel_name); onClose() }}
              >
                <div className="gs-result-meta">
                  <span className="gs-channel">#{msg.channel_name}</span>
                  <span className="gs-author" style={{ color: msg.avatar_color || '#8a8f98' }}>
                    {msg.username}
                  </span>
                  <span className="gs-date">{formatDate(msg.created_at)}</span>
                </div>
                <div className="gs-result-content">
                  {msg.content
                    ? highlight(msg.content, query)
                    : <span className="gs-attachment">📎 archivo adjunto</span>
                  }
                </div>
              </button>
            ))}
          </div>
        )}

        {query.length === 0 && (
          <div className="gs-hint">Escribe al menos 2 caracteres para buscar</div>
        )}
      </div>
    </div>
  )
}
