package services

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/yourusername/chat-app/models"
)

// Client representa una conexión WebSocket activa
type Client struct {
	ID        int
	Username  string
	ChannelID int
	Conn      *websocket.Conn
	Send      chan []byte
}

// Hub gestiona todas las conexiones activas y el broadcast de mensajes
type Hub struct {
	clients     map[*Client]bool
	broadcast   chan []byte
	register    chan *Client
	unregister  chan *Client
	mu          sync.RWMutex
	voiceCalls  map[int][]models.VoiceParticipant
	voiceMu     sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		voiceCalls: make(map[int][]models.VoiceParticipant),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client %s connected (channel %d)", client.Username, client.ChannelID)
			h.sendOnlineUpdate(client.ChannelID)
			h.sendCallStateToClient(client)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("Client %s disconnected", client.Username)
			h.removeFromVoiceCall(client.ChannelID, client.ID)
			h.sendOnlineUpdate(client.ChannelID)

		case message := <-h.broadcast:
			h.mu.RLock()
			var wsMsg models.WSMessage
			json.Unmarshal(message, &wsMsg)

			// ChannelID viene de Message.ChannelID para mensajes, o de ChannelID para typing
			channelID := wsMsg.Message.ChannelID
			if channelID == 0 {
				channelID = wsMsg.ChannelID
			}

			for client := range h.clients {
				if client.ChannelID != channelID {
					continue
				}
				// typing no se envía al propio remitente
				if wsMsg.Type == "typing" && client.Username == wsMsg.Username {
					continue
				}
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

func (h *Hub) Broadcast(msg []byte) {
	h.broadcast <- msg
}

// sendOnlineUpdate envía la lista de usuarios online en un canal a todos sus miembros.
// Se llama desde Run(), por lo que se puede leer h.clients directamente (mismo goroutine).
func (h *Hub) sendOnlineUpdate(channelID int) {
	h.mu.RLock()
	var users []string
	for client := range h.clients {
		if client.ChannelID == channelID {
			users = append(users, client.Username)
		}
	}
	data, _ := json.Marshal(map[string]interface{}{
		"type":       "online_update",
		"channel_id": channelID,
		"count":      len(users),
		"users":      users,
	})
	for client := range h.clients {
		if client.ChannelID == channelID {
			select {
			case client.Send <- data:
			default:
			}
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) OnlineUsers(channelID int) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var users []string
	for client := range h.clients {
		if client.ChannelID == channelID {
			users = append(users, client.Username)
		}
	}
	return users
}

func (h *Hub) sendCallStateToClient(client *Client) {
	h.voiceMu.RLock()
	participants := h.voiceCalls[client.ChannelID]
	if len(participants) == 0 {
		h.voiceMu.RUnlock()
		return
	}
	snapshot := make([]models.VoiceParticipant, len(participants))
	copy(snapshot, participants)
	h.voiceMu.RUnlock()

	out := models.WSMessage{
		Type:             "call_state",
		ChannelID:        client.ChannelID,
		CallParticipants: snapshot,
	}
	data, _ := json.Marshal(out)
	select {
	case client.Send <- data:
	default:
	}
}

func (h *Hub) voiceJoin(channelID int, p models.VoiceParticipant) {
	h.voiceMu.Lock()
	participants := h.voiceCalls[channelID]
	for _, existing := range participants {
		if existing.UserID == p.UserID {
			h.voiceMu.Unlock()
			return
		}
	}
	h.voiceCalls[channelID] = append(participants, p)
	h.voiceMu.Unlock()
	h.broadcastCallState(channelID)
}

func (h *Hub) removeFromVoiceCall(channelID, userID int) {
	h.voiceMu.Lock()
	participants := h.voiceCalls[channelID]
	filtered := participants[:0]
	for _, p := range participants {
		if p.UserID != userID {
			filtered = append(filtered, p)
		}
	}
	if len(filtered) == 0 {
		delete(h.voiceCalls, channelID)
	} else {
		h.voiceCalls[channelID] = filtered
	}
	h.voiceMu.Unlock()
	h.broadcastCallState(channelID)
}

func (h *Hub) broadcastCallState(channelID int) {
	h.voiceMu.RLock()
	participants := make([]models.VoiceParticipant, len(h.voiceCalls[channelID]))
	copy(participants, h.voiceCalls[channelID])
	h.voiceMu.RUnlock()

	out := models.WSMessage{
		Type:             "call_state",
		ChannelID:        channelID,
		CallParticipants: participants,
	}
	data, _ := json.Marshal(out)
	h.Broadcast(data)
}

// WritePump envía mensajes del canal Send al WebSocket
func (c *Client) WritePump() {
	defer c.Conn.Close()
	for msg := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

// ReadPump lee mensajes del WebSocket y los envía al hub
func (c *Client) ReadPump(hub *Hub, channelSvc *ChannelService, pushSvc *PushService) {
	defer func() {
		hub.Unregister(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(64 * 1024) // 64 KB por mensaje

	for {
		_, rawMsg, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var wsMsg models.WSMessage
		if err := json.Unmarshal(rawMsg, &wsMsg); err != nil {
			continue
		}

		switch wsMsg.Type {
		case "typing":
			out := models.WSMessage{
				Type:      "typing",
				ChannelID: c.ChannelID,
				Username:  c.Username,
			}
			data, _ := json.Marshal(out)
			hub.Broadcast(data)

		case "call_join":
			hub.voiceJoin(c.ChannelID, models.VoiceParticipant{
				UserID:      c.ID,
				Username:    c.Username,
				AvatarColor: wsMsg.AvatarColor,
			})

		case "call_leave":
			hub.removeFromVoiceCall(c.ChannelID, c.ID)

		default: // "message"
			msg := models.Message{
				ChannelID: c.ChannelID,
				UserID:    c.ID,
				Username:  c.Username,
				Content:   wsMsg.Content,
				FileURL:   wsMsg.FileURL,
				FileType:  wsMsg.FileType,
			}
			if wsMsg.ReplyToID != 0 {
				id := wsMsg.ReplyToID
				msg.ReplyToID = &id
			}
			if err := channelSvc.SaveMessage(&msg); err != nil {
				log.Printf("Error saving message: %v", err)
				continue
			}
			// Si es una respuesta, incluir el snippet del mensaje original
			if msg.ReplyToID != nil {
				msg.ReplyTo = channelSvc.GetReplySnippet(*msg.ReplyToID)
			}
			out := models.WSMessage{Type: "message", Message: msg}
			data, _ := json.Marshal(out)
			hub.Broadcast(data)

			// Enviar push notification a suscriptores del canal (sin bloquear)
			if pushSvc != nil {
				chName := channelSvc.GetChannelName(msg.ChannelID)
				if chName == "" {
					chName = fmt.Sprintf("canal %d", msg.ChannelID)
				}
				preview := msg.Content
				if preview == "" {
					preview = "📎 archivo adjunto"
				}
				if len([]rune(preview)) > 120 {
					preview = string([]rune(preview)[:120]) + "…"
				}
				go pushSvc.SendToChannelMembers(msg.ChannelID, msg.UserID, "#"+chName, msg.Username+": "+preview)
			}
		}
	}
}
