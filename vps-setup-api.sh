#!/bin/bash
# ==============================================================================
# Skrip Instalasi Local Telegram Bot API Server
# Menggunakan Docker (Ringan & Cepat, tidak membebani VPS)
# ==============================================================================

echo "=========================================================="
echo "🚀 Memulai Instalasi Local Telegram Bot API Server..."
echo "=========================================================="

# 1. Pastikan Docker sudah terpasang
if ! command -v docker &> /dev/null; then
    echo "⚙️  Docker belum terpasang. Menginstal Docker sekarang..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
    echo "✅ Docker sudah terpasang!"
fi

# 2. Minta API ID dan API Hash dari user
echo ""
echo "⚠️  PENTING: Anda butuh API_ID dan API_HASH unik untuk diri Anda sendiri."
echo "Dapatkan gratis di: https://my.telegram.org (Menu: API development tools)"
echo ""

read -p "Masukkan TELEGRAM_API_ID: " API_ID
read -p "Masukkan TELEGRAM_API_HASH: " API_HASH

if [ -z "$API_ID" ] || [ -z "$API_HASH" ]; then
    echo "❌ API ID dan API HASH tidak boleh kosong! Dibatalkan."
    exit 1
fi

# 3. Menjalankan Docker Container Telegram Bot API
echo ""
echo "🐳 Menyiapkan Container Telegram Bot API..."
# Hapus container lama jika ada
sudo docker rm -f telegram-bot-api &> /dev/null

sudo docker run -d -p 8081:8081 \
  --name telegram-bot-api \
  --restart=always \
  -v telegram-bot-api-data:/var/lib/telegram-bot-api \
  -e TELEGRAM_API_ID="$API_ID" \
  -e TELEGRAM_API_HASH="$API_HASH" \
  aiogram/telegram-bot-api:latest

echo ""
echo "=========================================================="
echo "🎉 BERHASIL! Server Telegram Api lokal Anda sudah menyala di Port 8081."
echo "Untuk menggunakannya di CosTeleBot, buka file .env pada VPS Anda dan tambahkan baris berikut:"
echo ""
echo "LOCAL_API_URL=http://127.0.0.1:8081"
echo ""
echo "Catatan: File R34Video sebesar apapun (hingga 2GB) kini dapat dikirim Bot Tuan tanpa ditolak!"
echo "Jangan lupa restart bot Anda: npx pm2 restart costelebot"
echo "=========================================================="
