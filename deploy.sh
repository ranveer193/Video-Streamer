#!/bin/bash

echo "🚀 Video Streaming System - VPS Deployment"
echo "==========================================="
echo ""

# Variables - UPDATE THESE
SERVER_IP="your-server-ip"
DOMAIN="your-domain.com"  # Optional, can use IP
SERVER_USER="ubuntu"

read -p "Enter your server IP: " SERVER_IP
read -p "Enter your domain (or leave empty to use IP): " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN=$SERVER_IP
fi

echo ""
echo "Deploying to: $DOMAIN ($SERVER_IP)"
echo "Server user: $SERVER_USER"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Build frontend
echo "📦 Building frontend..."
cd frontend
echo "REACT_APP_PROXY_URL=http://$DOMAIN:3001" > .env
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed"
    exit 1
fi
cd ..
echo "✅ Frontend built successfully"
echo ""

# Upload files to server
echo "📤 Uploading files to server..."
ssh $SERVER_USER@$SERVER_IP "mkdir -p ~/video-streaming-system"

rsync -avz --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'frontend/build' \
    ./backend $SERVER_USER@$SERVER_IP:~/video-streaming-system/

rsync -avz ./frontend/build $SERVER_USER@$SERVER_IP:~/video-streaming-system/frontend/

echo "✅ Files uploaded"
echo ""

# Setup on server
echo "🔧 Setting up on server..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'

# Install dependencies
cd ~/video-streaming-system/backend
npm install --production

# Setup environment
if [ ! -f ".env" ]; then
    echo "PORT=3001" > .env
    echo "NODE_ENV=production" >> .env
fi

# Install PM2 if not installed
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

# Start/restart with PM2
pm2 delete video-proxy 2>/dev/null || true
pm2 start server.js --name video-proxy
pm2 save

echo "✅ Backend started with PM2"

ENDSSH

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Configure Nginx (see README.md)"
echo "2. Setup SSL with Let's Encrypt (optional)"
echo "3. Access your player at http://$DOMAIN"
echo ""
echo "Check status: ssh $SERVER_USER@$SERVER_IP 'pm2 status'"
echo "View logs: ssh $SERVER_USER@$SERVER_IP 'pm2 logs video-proxy'"
