# Chat App - Slack Alternative

An open-source, self-hosted chat application built with Go (backend) + React (frontend).

## Features

- ✅ Real-time messaging with WebSockets
- ✅ User authentication (JWT)
- ✅ Multiple channels
- ✅ Message persistence
- ✅ Online status
- 🔄 Coming: Reactions, File uploads, Admin dashboard

## Tech Stack

- **Backend**: Go 1.22 + gorilla/websocket
- **Frontend**: React 19 + Vite
- **Database**: MariaDB 10.5
- **Deployment**: Docker + Docker Compose

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Git

### Running Locally

```bash
git clone https://github.com/yourusername/chat-app.git
cd chat-app
docker-compose up
```

Then open your browser:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8080

### Development

#### Backend (Go)
```bash
cd backend
go mod tidy
go run main.go
```

#### Frontend (React)
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
chat-app/
├── backend/
│   ├── main.go
│   ├── config/
│   ├── models/
│   ├── handlers/
│   ├── services/
│   ├── db/
│   ├── middleware/
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## API Documentation

### Auth Endpoints
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user

### Channel Endpoints
- `GET /channels` - List user's channels
- `POST /channels` - Create new channel
- `GET /channels/:id` - Get channel details

### WebSocket
- `WS /ws` - WebSocket connection for real-time messaging

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Roadmap

- [x] Project setup
- [ ] Backend authentication
- [ ] Backend channels
- [ ] WebSocket implementation
- [ ] Frontend UI
- [ ] Docker deployment
- [ ] Reactions & emoji
- [ ] File uploads
- [ ] Admin dashboard
- [ ] Mobile app (Capacitor)

## Support

For issues and questions, please open a GitHub issue.
