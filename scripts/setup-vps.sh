#!/bin/bash
set -e

echo "=== Chat App - VPS Setup ==="

# 1. Actualizar sistema
apt-get update -y && apt-get upgrade -y

# 2. Instalar Docker
if ! command -v docker &> /dev/null; then
    echo "Instalando Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# 3. Instalar Docker Compose
if ! command -v docker compose &> /dev/null; then
    echo "Instalando Docker Compose..."
    apt-get install -y docker-compose-plugin
fi

# 4. Crear usuario para la app (opcional, mejor que root)
if ! id "chatapp" &>/dev/null; then
    useradd -m -s /bin/bash chatapp
    usermod -aG docker chatapp
    echo "Usuario 'chatapp' creado. Añadido al grupo docker."
fi

# 5. Crear directorio y copiar app
APP_DIR="/opt/chat-app"
mkdir -p "$APP_DIR"

echo ""
echo "=== Setup completado ==="
echo ""
echo "Próximos pasos:"
echo "  1. Clona el repo: git clone https://github.com/TU_USUARIO/chat-app $APP_DIR"
echo "  2. Configura variables: cp $APP_DIR/.env.example $APP_DIR/.env && nano $APP_DIR/.env"
echo "  3. Levanta la app: cd $APP_DIR && docker compose up -d"
echo ""
echo "La app estará disponible en http://TU_IP:80"
