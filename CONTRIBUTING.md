# Contributing to ChatApp

Thanks for your interest in contributing. Here's everything you need to get started.

## Ways to contribute

- **Bug reports** — open an issue with steps to reproduce
- **Feature requests** — open an issue describing the use case
- **Code** — bug fixes, new features, performance improvements
- **Documentation** — typos, missing info, better explanations

## Before opening a PR

For anything beyond a small fix, open an issue first so we can discuss the approach. This avoids wasted effort on PRs that go in a different direction than the project.

## Development setup

### Backend (Go)

```bash
cd backend
go mod download
go run .
```

Requires: Go 1.22+, a MariaDB instance, a `.env` file (see `.env.example`).

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Requires: Node.js 20+. Set `VITE_API_URL` to your backend URL.

### Docker (full stack)

```bash
cp .env.example .env  # fill in values
docker compose up -d --build
```

## Code style

- **Go**: standard `gofmt` formatting. No external linters required, but keep it idiomatic.
- **React**: functional components, hooks. No UI framework — plain CSS.
- **No comments** unless the *why* is non-obvious (a hidden constraint, a workaround for a specific bug).

## Commit messages

Short imperative subject line, present tense:

```
fix: voice call bar not shown on channel entry
feat: add thread reply notifications
```

## What belongs in this project

ChatApp is intentionally minimal — two containers, one binary, one database. Contributions that add required services (Redis, Elasticsearch, S3, etc.) are out of scope. Contributions that improve the existing feature set without adding operational complexity are very welcome.

## Security issues

Please do not open public issues for security vulnerabilities. Send details privately via the contact in the GitHub profile.
