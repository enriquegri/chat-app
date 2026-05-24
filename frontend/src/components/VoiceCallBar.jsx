export default function VoiceCallBar({ participants, inCall, onJoin, onLeave }) {
  if (!participants || participants.length === 0) return null

  const MAX_SHOWN = 3
  const shown = participants.slice(0, MAX_SHOWN)
  const extra = participants.length - MAX_SHOWN

  return (
    <div className="voice-call-bar">
      <span className="voice-call-bar-icon">🔊</span>
      <div className="voice-call-bar-avatars">
        {shown.map(p => (
          <span
            key={p.user_id}
            className="voice-call-bar-avatar"
            style={{ background: p.avatar_color || '#5b5ef4' }}
            title={p.username}
          >
            {p.username?.[0]?.toUpperCase()}
          </span>
        ))}
        {extra > 0 && <span className="voice-call-bar-extra">+{extra}</span>}
      </div>
      <span className="voice-call-bar-label">
        {participants.length === 1
          ? `${participants[0].username} está en llamada`
          : `${participants.length} en llamada`}
      </span>
      {inCall
        ? <button className="voice-call-bar-btn leave" onClick={onLeave}>Colgar</button>
        : <button className="voice-call-bar-btn join" onClick={onJoin}>Unirse</button>
      }
    </div>
  )
}
