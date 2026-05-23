FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -o chat-app .
RUN CGO_ENABLED=0 GOOS=linux go build -a -o chatadmin ./cmd/chatadmin

FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata
WORKDIR /root/

COPY --from=builder /app/chat-app .
COPY --from=builder /app/chatadmin /usr/local/bin/chatadmin

EXPOSE 8080
CMD ["./chat-app"]
