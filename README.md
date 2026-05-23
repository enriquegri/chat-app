# ChatApp — Self-hosted Slack Alternative

Open-source, real-time chat app built with **Go + WebSockets + React**. Deploy it on your own VPS under your own domain.

## Features

- Real-time messaging via WebSockets
- User authentication (JWT)
- Multiple channels with message history (MariaDB)
- File and image uploads
- Emoji reactions
- Message search
- Online status per channel
- Admin dashboard (user management, channel management)
- Mobile-ready — responsive UI + Android APK via Capacitor
- Registration control (enable/disable self-registration via env var)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.22 + gorilla/websocket |
| Frontend | React 19 + Vite |
| Database | MariaDB 10.5 |
| Reverse proxy | Nginx |
| Deploy | Docker + Docker Compose |

---

## Architecture

```
[Client (browser / Android APK)]
         │
         │  HTTPS / WSS
         ▼
[Nginx reverse proxy]   ← terminates TLS
         │
         │  HTTP (internal Docker network)
         ▼
[Go backend :8080]
    ├── REST API  (auth, channels, uploads, admin)
    ├── WebSocket (/ws/:channelId)
    └── Static file serving (/uploads/)
         │
         ▼
[MariaDB]
```

Frontend is served separately via **GitHub Pages** (or any static host). The VPS only runs the backend + nginx proxy.

---

## Self-Hosting Guide

### Requirements

- VPS with Docker + Docker Compose installed
- A domain pointing to your VPS (A record)
- (Recommended) Cloudflare in front for free TLS

### 1. Clone the repo

```bash
git clone https://github.com/enriquegri/chat-app.git /opt/chat-app
cd /opt/chat-app
```

### 2. Configure environment

Copy the example and edit it:

```bash
cp .env.example .env
```

Key variables — see full table below.

### 3. TLS certificate

**Option A — Cloudflare (recommended)**

1. Set your domain's nameservers to Cloudflare.
2. In Cloudflare → SSL/TLS → Origin Server → Create Certificate.
3. Copy the certificate to `ssl/origin.pem` and the key to `ssl/origin.key`.
4. Set SSL/TLS mode to **Full (strict)**.

```bash
mkdir -p ssl
# paste certificate content into ssl/origin.pem
# paste private key content  into ssl/origin.key
```

**Option B — Self-signed (development only)**

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/origin.key -out ssl/origin.pem \
  -subj "/CN=yourdomain.com"
```

### 4. Configure nginx

Edit `nginx.conf` and replace `api.enriquegr.dev` with your API domain:

```nginx
server {
    listen 80;
    return 301 https://your-api-domain.com$request_uri;
}

server {
    listen 443 ssl;
    ssl_certificate     /etc/nginx/ssl/origin.pem;
    ssl_certificate_key /etc/nginx/ssl/origin.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    resolver 127.0.0.11 valid=30s;
    set $backend backend:8080;

    location /ws/ {
        proxy_pass http://$backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location = /registration-status {
        proxy_pass http://$backend;
        proxy_set_header Host $host;
    }

    location ~ ^/(api|auth|health|uploads)/ {
        proxy_pass http://$backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 10M;
    }
}
```

### 5. Launch

```bash
docker compose up -d --build
```

### 6. Create your first admin user

Registration is **disabled by default**. Create the first admin via the CLI tool:

```bash
docker compose exec backend chatadmin create-user \
  --username admin \
  --email admin@example.com \
  --password YourStrongPassword \
  --role admin
```

### 7. Deploy the frontend

See the [Frontend Deployment](#frontend-deployment) section below.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_PORT` | `8080` | Backend listen port |
| `DB_HOST` | `db` | MariaDB host (Docker service name) |
| `DB_PORT` | `3306` | MariaDB port |
| `DB_USER` | — | Database user |
| `DB_PASSWORD` | — | Database password |
| `DB_NAME` | `chatapp` | Database name |
| `DB_ROOT_PASSWORD` | — | MariaDB root password (for Docker init) |
| `JWT_SECRET` | — | Secret for signing JWT tokens (keep long and random) |
| `PUBLIC_URL` | — | Public base URL of the API, e.g. `https://api.example.com` — used for building absolute upload URLs |
| `REGISTRATION_ENABLED` | `false` | Set to `true` to allow public self-registration |

---

## Registration Control

By default, `REGISTRATION_ENABLED=false` — the Register endpoint returns 403 and the frontend hides the register button.

To allow users to sign up themselves:

```env
REGISTRATION_ENABLED=true
```

Even when registration is disabled, admins can still create users via the admin panel or the `chatadmin` CLI.

---

## Admin Tools

### Web Panel

Log in as an admin and click **Admin** in the sidebar footer. From there you can:

- **Users tab**: list all users, create new users (any role), delete users, change user roles
- **Channels tab**: list all channels, delete channels

### chatadmin CLI

The `chatadmin` tool runs inside the backend container and connects directly to the database.

```bash
docker compose exec backend chatadmin <command> [flags]
```

#### Create a user

```bash
docker compose exec backend chatadmin create-user \
  --username alice \
  --email alice@example.com \
  --password SecurePass123 \
  --role user        # or: admin
```

#### Reset a password

```bash
docker compose exec backend chatadmin reset-password \
  --email alice@example.com \
  --password NewPassword456
```

#### Clear chat history

Clear all messages in every channel:

```bash
docker compose exec backend chatadmin clear-chats --all
# You will be prompted to type YES to confirm
```

Clear messages in a specific channel (by ID or name):

```bash
docker compose exec backend chatadmin clear-chats --channel general
```

---

## Frontend Deployment

The frontend is a static React app and can be hosted anywhere (GitHub Pages, Netlify, Vercel, your own nginx, etc.).

### Build

```bash
cd frontend
VITE_API_URL=https://api.your-domain.com \
VITE_API_HOST=api.your-domain.com \
npm run build
# Output in frontend/dist/
```

### GitHub Pages (recommended)

1. Fork this repo.
2. In `.github/workflows/deploy-pages.yml`, set the env vars to your API domain.
3. Enable GitHub Pages on your repo (Settings → Pages → source: `gh-pages` branch).
4. Add a `CNAME` file in `frontend/public/` with your frontend domain, e.g. `chat.your-domain.com`.
5. In Cloudflare (or your DNS), add a CNAME record pointing `chat.your-domain.com` → `<username>.github.io`.

Every push to `main` automatically builds and deploys the frontend.

---

## Android APK

The frontend can be wrapped as a native Android app via Capacitor.

### Build prerequisites

- Node.js, Android Studio, Java 17+

### Steps

```bash
cd frontend

# Install dependencies
npm install

# Build for your API endpoint
VITE_API_URL=https://api.your-domain.com \
VITE_API_HOST=api.your-domain.com \
npm run build

# Sync to Android project
npx cap sync android

# Open in Android Studio and build / run
npx cap open android
```

Or use the included GitHub Actions workflow (`.github/workflows/build-apk.yml`) which builds a debug APK on every push.

---

## Project Structure

```
chat-app/
├── backend/
│   ├── main.go
│   ├── config/           # Env var loading
│   ├── models/           # User, Channel, Message
│   ├── handlers/         # HTTP + WebSocket handlers
│   ├── services/         # Auth, Channel, Admin, Hub (broadcast)
│   ├── middleware/        # JWT auth + admin role check
│   ├── db/
│   │   └── migrations/   # SQL schema
│   ├── cmd/
│   │   └── chatadmin/    # Admin CLI tool
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/        # Login, Register, Chat, Admin, Profile
│   │   ├── components/   # Message
│   │   ├── hooks/        # useAuth, useWebSocket
│   │   └── services/     # API calls (axios)
│   ├── public/           # CNAME, favicon
│   ├── capacitor.config.json
│   └── Dockerfile
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml  # Auto-deploy frontend to GitHub Pages
│       └── build-apk.yml     # Build Android APK
├── nginx.conf
├── docker-compose.yml
└── .env.example
```

---

## API Reference

### Public

```
GET  /health
GET  /registration-status    → { "enabled": bool }
POST /auth/register           { username, email, password }
POST /auth/login              { email, password }
```

### Protected (requires `Authorization: Bearer <token>`)

```
GET  /api/me
GET  /api/profile
PUT  /api/profile             { username, email }
PUT  /api/profile/password    { current_password, new_password }
GET  /api/channels
GET  /api/channels/:id/messages
GET  /api/channels/:id/search?q=term
POST /api/channels/:id/join
POST /api/upload              (multipart/form-data, field: file)
POST /api/messages/:id/reactions/:emoji
GET  /api/messages/:id/reactions
```

### Admin (requires admin role)

```
POST /api/channels
GET  /api/admin/users
POST /api/admin/users         { username, email, password, role }
DELETE /api/admin/users/:id
PUT  /api/admin/users/:id/role { role }
GET  /api/admin/channels
DELETE /api/admin/channels/:id
```

### WebSocket

```
WS  /ws/:channelId?token=JWT_TOKEN

Send:    { "type": "message", "content": "Hello!" }
         { "type": "message", "content": "", "file_url": "https://...", "file_name": "photo.jpg" }
Receive: { "type": "message",   "message": { id, user_id, username, content, file_url, file_name, created_at, reactions } }
         { "type": "online",    "users": ["alice", "bob"] }
         { "type": "typing",    "username": "alice" }
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
