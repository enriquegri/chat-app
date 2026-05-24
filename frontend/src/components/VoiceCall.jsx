import { useState } from 'react'

export default function VoiceCall({ participants, isMuted, activeSpeakers, onToggleMute, onLeave, isMobile }) {
  const [showChat, setShowChat] = useState(false)

  if (isMobile && showChat) {
    return (
      <div className="voice-mini-bar">
        <span className="voice-mini-bar-icon">🔊</span>
        <span className="voice-mini-bar-count">{participants.length} en llamada</span>
        <button className="voice-mini-bar-btn" onClick={() => setShowChat(false)}>Volver a llamada</button>
        <button className="voice-mini-bar-btn leave" onClick={onLeave}>Colgar</button>
      </div>
    )
  }

  return (
    <div className={`voice-call-panel${isMobile ? ' voice-call-panel--mobile' : ''}`}>
      <div className="voice-call-participants">
        {participants.map(p => {
          const speaking = activeSpeakers.includes(p.identity)
          return (
            <div
              key={p.identity}
              className={`voice-call-avatar${speaking ? ' speaking' : ''}`}
            >
              <div
                className="voice-call-avatar-circle"
                style={{ background: p.avatarColor || '#5b5ef4' }}
              >
                {(p.name || p.identity)?.[0]?.toUpperCase()}
              </div>
              <span className="voice-call-avatar-name">{p.name || p.identity}</span>
            </div>
          )
        })}
      </div>
      <div className="voice-call-controls">
        <button className="voice-call-btn-ctrl" onClick={onToggleMute} title={isMuted ? 'Activar micro' : 'Silenciar'}>
          {isMuted ? '🔇' : '🎤'}
          <span>{isMuted ? 'Activar' : 'Silenciar'}</span>
        </button>
        {isMobile && (
          <button className="voice-call-btn-ctrl" onClick={() => setShowChat(true)} title="Mostrar chat">
            💬<span>Chat</span>
          </button>
        )}
        <button className="voice-call-btn-ctrl leave" onClick={onLeave} title="Colgar">
          📞<span>Colgar</span>
        </button>
      </div>
    </div>
  )
}
