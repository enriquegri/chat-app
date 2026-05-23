import { useState, useEffect } from 'react'
import { linkPreview as linkPreviewApi } from '../services/api'

// Detecta la primera URL http(s) en un texto
const URL_RX = /https?:\/\/[^\s<>"']+/

// Cache en memoria para no repetir fetches en la misma sesión
const cache = {}

export default function LinkPreview({ text }) {
  const [preview, setPreview] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  const url = text && URL_RX.exec(text)?.[0]

  useEffect(() => {
    if (!url || dismissed) return
    if (cache[url] !== undefined) { setPreview(cache[url]); return }

    let cancelled = false
    linkPreviewApi.fetch(url).then(({ data }) => {
      const p = data.title ? data : null
      cache[url] = p
      if (!cancelled) setPreview(p)
    }).catch(() => {
      cache[url] = null
    })
    return () => { cancelled = true }
  }, [url, dismissed])

  if (!url || !preview || dismissed) return null

  return (
    <a
      className="link-preview"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={e => e.stopPropagation()}
    >
      {preview.image && (
        <img
          className="link-preview-img"
          src={preview.image}
          alt=""
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <div className="link-preview-body">
        <span className="link-preview-site">{new URL(url).hostname}</span>
        <span className="link-preview-title">{preview.title}</span>
        {preview.description && (
          <span className="link-preview-desc">{preview.description.slice(0, 120)}</span>
        )}
      </div>
      <button
        className="link-preview-dismiss"
        title="Ocultar preview"
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setDismissed(true) }}
      >✕</button>
    </a>
  )
}
