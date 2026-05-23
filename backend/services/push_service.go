package services

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"log"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// PushSubscription almacena los datos de suscripción Web Push de un usuario.
type PushSubscription struct {
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

// PushService gestiona suscripciones y envío de notificaciones Web Push.
type PushService struct {
	db           *sql.DB
	vapidPublic  string
	vapidPrivate string
}

func NewPushService(db *sql.DB, vapidPublic, vapidPrivate string) *PushService {
	return &PushService{db: db, vapidPublic: vapidPublic, vapidPrivate: vapidPrivate}
}

// Enabled devuelve true si las claves VAPID están configuradas.
func (s *PushService) Enabled() bool {
	return s.vapidPublic != "" && s.vapidPrivate != ""
}

// VAPIDPublicKey devuelve la clave pública VAPID para el frontend.
func (s *PushService) VAPIDPublicKey() string {
	return s.vapidPublic
}

// SaveSubscription guarda (o actualiza) la suscripción de un usuario.
func (s *PushService) SaveSubscription(userID int, sub PushSubscription) error {
	_, err := s.db.Exec(`
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		VALUES (?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)`,
		userID, sub.Endpoint, sub.P256dh, sub.Auth,
	)
	return err
}

// RemoveSubscription elimina la suscripción de un usuario.
func (s *PushService) RemoveSubscription(userID int, endpoint string) error {
	_, err := s.db.Exec(
		"DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
		userID, endpoint,
	)
	return err
}

// SendToChannelMembers envía una notificación push a todos los suscriptores
// del canal excepto al propio remitente.
func (s *PushService) SendToChannelMembers(channelID, senderID int, title, body string) {
	if !s.Enabled() {
		return
	}

	rows, err := s.db.Query(`
		SELECT ps.endpoint, ps.p256dh, ps.auth
		FROM push_subscriptions ps
		JOIN channel_members cm ON ps.user_id = cm.user_id
		WHERE cm.channel_id = ? AND ps.user_id != ?`,
		channelID, senderID,
	)
	if err != nil {
		log.Printf("[push] query error: %v", err)
		return
	}
	defer rows.Close()

	payload, _ := json.Marshal(map[string]string{
		"title": title,
		"body":  body,
		"tag":   "chat-message",
	})

	for rows.Next() {
		var endpoint, p256dh, auth string
		if err := rows.Scan(&endpoint, &p256dh, &auth); err != nil {
			continue
		}
		sub := &webpush.Subscription{
			Endpoint: endpoint,
			Keys: webpush.Keys{
				P256dh: p256dh,
				Auth:   auth,
			},
		}
		go func(sub *webpush.Subscription) {
			resp, err := webpush.SendNotification(bytes.Clone(payload), sub, &webpush.Options{
				VAPIDPublicKey:  s.vapidPublic,
				VAPIDPrivateKey: s.vapidPrivate,
				Subscriber:      "mailto:admin@chatapp.local",
				TTL:             60,
			})
			if err != nil {
				log.Printf("[push] send error: %v", err)
				return
			}
			resp.Body.Close()
			if resp.StatusCode >= 400 {
				log.Printf("[push] server returned %d for %s", resp.StatusCode, sub.Endpoint)
			}
		}(sub)
	}
}
