import { useState, useRef, useCallback, useEffect } from 'react'
import { Room, RoomEvent } from 'livekit-client'

const API_BASE = import.meta.env.VITE_API_URL || ''

export function useVoiceCall(sendSignal, user) {
  const [inCall, setInCall] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [activeSpeakers, setActiveSpeakers] = useState([])
  const [lkParticipants, setLkParticipants] = useState([])
  const roomRef = useRef(null)
  const audioEls = useRef([])

  const updateParticipants = useCallback((room) => {
    const remote = Array.from(room.remoteParticipants.values()).map(p => ({
      identity: p.identity,
      name: p.name || p.identity,
    }))
    const local = { identity: room.localParticipant.identity, name: room.localParticipant.name || room.localParticipant.identity }
    setLkParticipants([local, ...remote])
  }, [])

  const joinCall = useCallback(async (channelId, avatarColor) => {
    if (roomRef.current) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/api/channels/${channelId}/voice/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('token error')
      const { token: lkToken, url } = await res.json()

      const room = new Room()
      roomRef.current = room

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === 'audio') {
          const el = track.attach()
          el.autoplay = true
          document.body.appendChild(el)
          audioEls.current.push(el)
        }
      })

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(el => el.remove())
      })

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeakers(speakers.map(s => s.identity))
      })

      room.on(RoomEvent.ParticipantConnected, () => updateParticipants(room))
      room.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room))

      room.on(RoomEvent.Disconnected, () => {
        audioEls.current.forEach(el => el.remove())
        audioEls.current = []
        roomRef.current = null
        setInCall(false)
        setIsMuted(false)
        setActiveSpeakers([])
        setLkParticipants([])
      })

      await room.connect(url, lkToken)
      await room.localParticipant.setMicrophoneEnabled(true)
      updateParticipants(room)
      setInCall(true)
      setIsMuted(false)

      sendSignal?.({ type: 'call_join', avatar_color: avatarColor || '' })
    } catch (err) {
      console.error('joinCall failed', err)
      if (roomRef.current) {
        roomRef.current.disconnect()
        roomRef.current = null
      }
    }
  }, [sendSignal, updateParticipants])

  const leaveCall = useCallback(() => {
    sendSignal?.({ type: 'call_leave' })
    roomRef.current?.disconnect()
  }, [sendSignal])

  const toggleMute = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    const enabled = room.localParticipant.isMicrophoneEnabled
    room.localParticipant.setMicrophoneEnabled(!enabled)
    setIsMuted(enabled)
  }, [])

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect()
    }
  }, [])

  return { inCall, isMuted, activeSpeakers, lkParticipants, joinCall, leaveCall, toggleMute }
}
