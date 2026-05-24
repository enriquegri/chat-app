# ChatApp — Self-hosted Slack Alternative

Open-source, real-time chat app built with **Go + WebSockets + React**. Deploy it on your own VPS under your own domain.

## Features

- Real-time messaging via WebSockets
- **Voice calls** — up to 50 simultaneous participants via LiveKit SFU
- **Direct messages** (DMs) between users
- **Thread replies** — reply to any message in a side thread
- User authentication with JWT + optional **two-factor authentication** (TOTP)
- Multiple channels (public and private) with full message history (MariaDB)
- File and image uploads
- Emoji reactions
- **Message editing and deletion**
- **Link previews**
- **Global search** across all channels and DMs
- Per-channel search
- Online status per channel
- **Web Push notifications** (PWA / Android)
- Admin dashboard (user management, channel management)
- Mobile-ready — responsive UI + Android APK via Capacitor

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.22 + gorilla/websocket |
| Frontend | React 19 + Vite |
| Database | MariaDB 10.5 |
| Voice calls | LiveKit SFU (self-hosted Docker) |
| Reverse proxy | Nginx |
| Mobile | Capacitor (Android APK) |
| Deploy | Docker + Docker Compose + GitHub Actions |

---

## Architecture

```
[Browser / Android APK]
         │
         │  HTTPS / WSS
         ▼
[Nginx reverse proxy]          ← terminates TLS
    ├── /ws/         → Go backend (WebSocket hub)
    ├── /livekit/    → LiveKit SFU (voice signaling + media)
    └── /api/ /auth/ → Go backend (REST API)
         │
         ▼
[Go backend :8080]
    ├── REST API  (auth, channels, DMs, uploads, search, push, voice token)
    ├── WebSocket hub  (messages, typing, online status, call state)
    └── /uploads/  (user files)
         │
         ▼
[MariaDB]

[LiveKit :7880]                ← SFU: 1 audio upload per user, forwarded to all
    └── UDP 50000-50200        ← RTP media ports (open on firewall)
```

Frontend is served via **GitHub Pages** (or any static host). The VPS runs the backend + LiveKit + nginx.

---

## Self-Hosting Guide

### Requirements

- VPS with Docker + Docker Compose installed
- A domain pointing to your VPS (A record)
- Cloudflare in front (recommended — free TLS + WebSocket proxying)
- UDP ports **50000–50200** open on the VPS firewall (LiveKit media)

### 1. Clone the repo

```bash
git clone https://github.com/enriquegri/chat-app.git /opt/chat-app
cd /opt/chat-app
```

### 2. Configure environment

```bash
cp .env.example .env
$EDITOR .env
```

See the full [Environment Variables](#environment-variables) table below.

### 3. Generate LiveKit credentials

```bash
# Generate a random API key and secret
echo "LIVEKIT_API_KEY=$(openssl rand -hex 12)"
echo "LIVEKIT_API_SECRET=$(openssl rand -hex 32)"
```

Create `livekit.yaml` (this file is **gitignored** because it contains secrets):

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50200
  node_ip: YOUR_VPS_PUBLIC_IP   # required for WebRTC ICE
keys:
  YOUR_API_KEY: YOUR_API_SECRET
logging:
  level: info
```

Add the same key/secret to `.env`:

```env
LIVEKIT_URL=wss://api.your-domain.com/livekit
LIVEKIT_API_KEY=YOUR_API_KEY
LIVEKIT_API_SECRET=YOUR_API_SECRET
```

### 4. Generate Web Push VAPID keys (optional — for push notifications)

```bash
npx web-push generate-vapid-keys
# Copy the output into .env:
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
```

### 5. TLS certificate

**Option A — Cloudflare (recommended)**

1. Set your domain's nameservers to Cloudflare.
2. In Cloudflare → SSL/TLS → Origin Server → Create Certificate.
3. Save the certificate to `ssl/origin.pem` and the key to `ssl/origin.key`.
4. Set SSL/TLS mode to **Full (strict)**.

```bash
mkdir -p ssl
# paste certificate → ssl/origin.pem
# paste private key → ssl/origin.key
```

**Option B — Self-signed (development only)**

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/origin.key -out ssl/origin.pem \
  -subj "/CN=yourdomain.com"
```

### 6. Configure nginx

Edit `nginx.conf` and replace `api.enriquegr.dev` with your API domain.

The key blocks required:

```nginx
# LiveKit voice signaling (WebSocket)
location /livekit/ {
    rewrite ^/livekit/(.*)$ /$1 break;
    proxy_pass http://livekit:7880;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}

# Chat WebSocket
location /ws/ {
    proxy_pass http://backend:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}

# REST API
location ~ ^/(api|auth|health|uploads)/ {
    proxy_pass http://backend:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 10M;
}
```

### 7. Launch

```bash
docker compose up -d --build
```

### 8. Create your first admin user

Registration is **disabled by default**. Create the first admin via the CLI:

```bash
docker compose exec backend chatadmin create-user \
  --username admin \
  --email admin@example.com \
  --password YourStrongPassword \
  --role admin
```

### 9. Deploy the frontend

See the [Frontend Deployment](#frontend-deployment) section below.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_HOST` | yes | `mariadb` | MariaDB host (Docker service name) |
| `DB_PORT` | no | `3306` | MariaDB port |
| `DB_USER` | yes | — | Database user |
| `DB_PASSWORD` | yes | — | Database password |
| `DB_NAME` | no | `chatapp` | Database name |
| `DB_ROOT_PASSWORD` | yes | — | MariaDB root password (Docker init) |
| `JWT_SECRET` | yes | — | Secret for signing JWT tokens (long random string) |
| `ENCRYPTION_KEY` | yes | — | 64-char hex key for encrypting DM content — generate with `openssl rand -hex 32` |
| `PUBLIC_URL` | yes | — | Public base URL of the API, e.g. `https://api.example.com` |
| `REGISTRATION_ENABLED` | no | `false` | Set to `true` to allow public self-registration |
| `ALLOWED_ORIGINS` | no | — | CORS allowed origins, e.g. `https://chat.example.com` |
| `LIVEKIT_URL` | yes* | — | LiveKit WebSocket URL, e.g. `wss://api.example.com/livekit` |
| `LIVEKIT_API_KEY` | yes* | — | LiveKit API key (from `livekit.yaml`) |
| `LIVEKIT_API_SECRET` | yes* | — | LiveKit API secret (from `livekit.yaml`) |
| `VAPID_PUBLIC_KEY` | no | — | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | no | — | Web Push VAPID private key |

*Required if voice calls are enabled.

---

## Voice Calls

Voice calls use **LiveKit** as an SFU (Selective Forwarding Unit): each user uploads one audio stream, and LiveKit forwards it to everyone else. This supports up to 50+ simultaneous participants with no mesh overhead.

- Click the **📞** button in any channel or DM header to join a voice call.
- A compact bar shows who's in the call while you browse the chat.
- On desktop: call panel appears above the message list.
- On Android/mobile: call panel goes full-screen with a toggle button to switch back to the chat without leaving the call.
- Animated border on avatars shows who is currently speaking (VAD via LiveKit).

### Firewall requirement

UDP ports **50000–50200** must be open on the VPS for WebRTC media to flow. Without this, participants will connect but hear no audio.

```bash
# Example: ufw
ufw allow 50000:50200/udp
```

---

## Registration Control

By default, `REGISTRATION_ENABLED=false` — the Register endpoint returns 403 and the frontend hides the register button.

To allow users to sign up:

```env
REGISTRATION_ENABLED=true
```

Admins can always create users via the admin panel or the `chatadmin` CLI.

---

## Two-Factor Authentication

Users can enable TOTP-based 2FA from their **Profile → Security** page. Compatible with any TOTP app (Google Authenticator, Authy, 1Password, etc.).

---

## Admin Tools

### Web Panel

Log in as an admin and click **Admin** in the sidebar footer. From there you can:

- **Users tab**: list, create, delete users; change roles
- **Channels tab**: list, delete channels; manage members

### chatadmin CLI

```bash
docker compose exec backend chatadmin <command> [flags]
```

**Create a user**

```bash
docker compose exec backend chatadmin create-user \
  --username alice \
  --email alice@example.com \
  --password SecurePass123 \
  --role user   # or: admin
```

**Reset a password**

```bash
docker compose exec backend chatadmin reset-password \
  --email alice@example.com \
  --password NewPassword456
```

**Clear chat history**

```bash
# All channels
docker compose exec backend chatadmin clear-chats --all

# Specific channel
docker compose exec backend chatadmin clear-chats --channel general
```

---

## Frontend Deployment

The frontend is a static React app that can be hosted on GitHub Pages, Netlify, Vercel, or any static host.

### Build

```bash
cd frontend
VITE_API_URL=https://api.your-domain.com \
VITE_API_HOST=api.your-domain.com \
npm run build
# Output: frontend/dist/
```

### GitHub Pages (recommended)

1. Fork this repo.
2. In `.github/workflows/deploy-pages.yml`, set the env vars to your API domain.
3. Enable GitHub Pages (Settings → Pages → source: `gh-pages` branch).
4. Add a `CNAME` file in `frontend/public/` with your frontend domain.
5. Add a Cloudflare CNAME record: `chat.your-domain.com` → `<username>.github.io`.

Every push to `main` automatically builds and deploys the frontend.

---

## Android APK

The frontend is wrapped as a native Android app via Capacitor. A debug APK is built automatically on every push to `main` by the included GitHub Actions workflow and published to **GitHub Releases**.

### Build manually

```bash
cd frontend
npm install

VITE_API_URL=https://api.your-domain.com \
VITE_API_HOST=api.your-domain.com \
npm run build

npx cap add android
npx cap sync android
npx cap open android   # open in Android Studio
```

Required Android permissions (injected automatically by CI):
- `RECORD_AUDIO` — microphone for voice calls
- `MODIFY_AUDIO_SETTINGS`
- `BLUETOOTH` / `BLUETOOTH_CONNECT`

---

## Project Structure

```
chat-app/
├── backend/
│   ├── main.go
│   ├── config/             # Env var loading
│   ├── models/             # User, Channel, Message, VoiceParticipant
│   ├── handlers/           # HTTP + WebSocket handlers (voice, push, 2FA…)
│   ├── services/           # Auth, Channel, Push, Hub (broadcast + call state)
│   ├── middleware/         # JWT auth + admin role check
│   ├── db/
│   │   └── migrations/     # SQL schema
│   ├── cmd/
│   │   └── chatadmin/      # Admin CLI tool
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/          # Login, Register, Chat, Admin, Profile
│   │   ├── components/     # Message, Thread, GlobalSearch, VoiceCall, VoiceCallBar, LinkPreview, TwoFASettings
│   │   ├── hooks/          # useAuth, useWebSocket, useVoiceCall, usePushNotifications
│   │   └── services/       # API calls
│   ├── public/             # CNAME, favicon, service worker
│   ├── capacitor.config.json
│   └── package.json
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml    # Auto-deploy frontend to GitHub Pages
│       └── build-apk.yml       # Build Android APK → GitHub Releases
├── livekit.yaml            # LiveKit config — gitignored (contains secrets)
├── nginx.conf
├── docker-compose.yml
└── .env.example
```

---

## API Reference

### Public

```
GET  /health
GET  /registration-status           → { "enabled": bool }
POST /auth/register                 { username, email, password }
POST /auth/login                    { email, password }
POST /auth/2fa/verify               { temp_token, code }
```

### Protected (requires `Authorization: Bearer <token>`)

```
GET  /api/me
GET  /api/profile
PUT  /api/profile                   { username, email }
PUT  /api/profile/password          { current_password, new_password }

GET  /api/channels
GET  /api/channels/:id/messages     ?before=<id>&limit=<n>
GET  /api/channels/:id/search       ?q=<term>
POST /api/channels/:id/join
POST /api/channels/:id/voice/token  → { token, url }

GET  /api/users
GET  /api/dm
POST /api/dm/:userId                → opens or returns DM channel

POST /api/upload                    (multipart/form-data, field: file)

GET  /api/search                    ?q=<term>  (global)
GET  /api/link-preview              ?url=<url>

POST   /api/messages/:id/reactions/:emoji
GET    /api/messages/:id/reactions
GET    /api/messages/:id/thread
PUT    /api/messages/:id            { content }
DELETE /api/messages/:id

GET  /api/2fa/status
GET  /api/2fa/setup                 → { qr_url, secret }
POST /api/2fa/enable                { code }
POST /api/2fa/disable               { code }

GET  /api/push/vapid-key
POST /api/push/subscribe            { subscription }
DELETE /api/push/subscribe
```

### Admin (requires admin role)

```
GET    /api/admin/users
POST   /api/admin/users             { username, email, password, role }
DELETE /api/admin/users/:id
PUT    /api/admin/users/:id/role    { role }

GET    /api/admin/channels
DELETE /api/admin/channels/:id
GET    /api/admin/channels/:id/members
POST   /api/admin/channels/:id/members        { user_id }
DELETE /api/admin/channels/:id/members/:userId
```

### WebSocket — `WS /ws/:channelId?token=<JWT>`

**Client → Server**

```json
{ "type": "message", "content": "Hello!" }
{ "type": "message", "content": "", "file_url": "https://...", "file_type": "image" }
{ "type": "message", "content": "See above", "reply_to_id": 42 }
{ "type": "typing" }
{ "type": "call_join",  "avatar_color": "#5b5ef4" }
{ "type": "call_leave" }
```

**Server → Client**

```json
{ "type": "message",      "message": { id, user_id, username, content, file_url, created_at, reactions, reply_to } }
{ "type": "online_update","channel_id": 1, "count": 3, "users": ["alice", "bob", "charlie"] }
{ "type": "typing",       "channel_id": 1, "username": "alice" }
{ "type": "call_state",   "channel_id": 1, "call_participants": [{ "user_id", "username", "avatar_color" }] }
```

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/something`
3. Commit your changes
4. Open a Pull Request

---

## License

MIT
