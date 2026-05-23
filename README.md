# ChatApp — Self-hosted Slack Alternative

Open-source, real-time chat app built with **Go + WebSockets + React**. Deploy it on your own VPS under your own brand.

## Features

- Real-time messaging via WebSockets
- User authentication (JWT)
- Multiple channels
- Message history (MariaDB)
- Online status per channel
- Docker one-command deploy
- Mobile-ready (Capacitor wrapper, coming soon)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.22 + gorilla/websocket |
| Frontend | React 19 + Vite |
| Database | MariaDB 10.5 |
| Reverse proxy | Nginx (built into frontend container) |
| Deploy | Docker + Docker Compose |

---

## Quick Start (Local)

```bash
git clone https://github.com/YOUR_USERNAME/chat-app.git
cd chat-app
cp .env.example .env       # edit JWT_SECRET and passwords
docker compose up --build
```

Open http://localhost — register an account and start chatting.

---

## Deploy to VPS

### 1. Prepare the server

```bash
# On your VPS (Ubuntu/Debian)
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/chat-app/master/scripts/setup-vps.sh | bash
```

### 2. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/chat-app.git /opt/chat-app
cd /opt/chat-app
cp .env.example .env
nano .env   # Set strong JWT_SECRET and DB passwords
```

### 3. Launch

```bash
docker compose up -d --build
```

App runs on **port 80**. Point your domain's DNS A record to the VPS IP and it's live.

### Optional: HTTPS with Let's Encrypt

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d yourdomain.com
```

---

## Environment Variables (.env)

```env
APP_PORT=80
DB_ROOT_PASSWORD=strongpassword
DB_USER=chatapp
DB_PASSWORD=strongpassword
DB_NAME=chatapp
JWT_SECRET=a-very-long-random-secret-string
```

---

## Project Structure

```
chat-app/
├── backend/
│   ├── main.go
│   ├── config/          # Env vars
│   ├── models/          # User, Channel, Message
│   ├── handlers/        # HTTP + WebSocket handlers
│   ├── services/        # Auth, Channel, Broadcast (Hub)
│   ├── middleware/       # JWT auth middleware
│   ├── db/
│   │   └── migrations/  # SQL schema
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/       # Login, Register, Chat
│   │   ├── components/  # Message
│   │   ├── hooks/       # useAuth, useWebSocket
│   │   └── services/    # API calls (axios)
│   ├── nginx.conf       # SPA + proxy config
│   └── Dockerfile
├── scripts/
│   └── setup-vps.sh     # One-shot VPS setup
├── docker-compose.yml
└── .env.example
```

---

## API Reference

### Auth
```
POST /auth/register   { username, email, password }
POST /auth/login      { email, password }
```

### Channels (requires Bearer token)
```
GET  /api/channels
POST /api/channels         { name, description }
GET  /api/channels/:id/messages
POST /api/channels/:id/join
```

### WebSocket
```
WS /ws/:channelId?token=JWT_TOKEN

Send:    { "type": "message", "content": "Hello!" }
Receive: { "type": "message", "message": { id, username, content, created_at, ... } }
```

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/something`
3. Commit your changes
4. Open a Pull Request

---

## Roadmap

- [x] Real-time messaging
- [x] Auth + channels
- [x] Docker deploy
- [ ] Typing indicators
- [ ] Emoji reactions
- [ ] File uploads
- [ ] Admin dashboard
- [ ] Mobile app (Capacitor → APK)

---

## License

MIT
