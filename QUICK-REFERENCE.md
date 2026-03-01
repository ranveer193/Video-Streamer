# ⚡ Quick Reference Card

## 🚀 Quick Start Commands

### Local Development
```bash
# Setup (first time only)
./setup.sh

# Start backend
cd backend && npm start

# Start frontend (new terminal)
cd frontend && npm start

# Visit: http://localhost:3000
```

### Production Deployment
```bash
# Run deployment script
./deploy.sh

# Or manually:
cd frontend && npm run build
# Then follow README.md deployment steps
```

## 🧪 Testing

```bash
# Test backend
./test-backend.sh

# Or manually:
curl http://localhost:3001/health
curl -I "http://localhost:3001/stream?url=YOUR_VIDEO_URL"
```

## 📊 Monitoring

### PM2 Commands
```bash
pm2 status              # Check status
pm2 logs video-proxy    # View logs
pm2 restart video-proxy # Restart
pm2 stop video-proxy    # Stop
pm2 delete video-proxy  # Remove
```

### Nginx Commands
```bash
sudo nginx -t                    # Test config
sudo systemctl restart nginx     # Restart
sudo systemctl status nginx      # Status
sudo tail -f /var/log/nginx/error.log  # Logs
```

## 🔧 Common Fixes

### Port already in use
```bash
lsof -i :3001
kill -9 <PID>
```

### Reset everything
```bash
# Backend
cd backend
rm -rf node_modules package-lock.json
npm install

# Frontend
cd frontend
rm -rf node_modules package-lock.json build
npm install
npm run build
```

### Update environment
```bash
# Backend
cd backend
echo "PORT=3001" > .env

# Frontend
cd frontend
echo "REACT_APP_PROXY_URL=http://localhost:3001" > .env
```

## 🌐 Access URLs

| Service | Local | Production |
|---------|-------|------------|
| Frontend | http://localhost:3000 | http://your-domain.com |
| Backend | http://localhost:3001 | http://your-domain.com:3001 |
| Health | http://localhost:3001/health | http://your-domain.com/health |

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` | Back 10 seconds |
| `→` | Forward 10 seconds |
| `F` | Fullscreen |
| `M` | Mute/Unmute |
| `↑` | Volume up |
| `↓` | Volume down |

## 📁 Important Files

```
video-streaming-system/
├── backend/
│   ├── server.js          # Main server code
│   ├── package.json       # Dependencies
│   └── .env              # Configuration
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main app
│   │   ├── components/       # React components
│   │   └── styles.css        # Styling
│   ├── package.json       # Dependencies
│   └── .env              # Configuration
├── nginx.conf.example     # Nginx config
├── README.md             # Full documentation
└── TROUBLESHOOTING.md    # Problem solving
```

## 🐛 Quick Debug

### Check if services are running
```bash
# Backend
curl http://localhost:3001/health

# Frontend (after build)
ls frontend/build/index.html

# PM2
pm2 list

# Nginx
sudo systemctl status nginx
```

### View logs
```bash
# Backend (PM2)
pm2 logs video-proxy

# Nginx error
sudo tail -f /var/log/nginx/error.log

# Nginx access
sudo tail -f /var/log/nginx/access.log
```

## 🔐 Security

### Setup firewall
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

### Setup SSL
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 📈 Performance

### Check resources
```bash
# Memory
free -h

# CPU
top

# Disk
df -h

# Network speed
curl -s https://raw.githubusercontent.com/sivel/speedtest-cli/master/speedtest.py | python3 -
```

### Optimize PM2
```bash
pm2 start server.js --name video-proxy \
  --max-memory-restart 500M \
  --node-args="--max-old-space-size=4096"
```

## 💡 Tips

1. **Always test backend first** before starting frontend
2. **Use PM2** for production deployments
3. **Enable SSL** for production sites
4. **Monitor logs** regularly with `pm2 logs`
5. **Backup .env files** before making changes

## 📞 Emergency Commands

```bash
# Completely stop everything
pm2 delete all
sudo systemctl stop nginx

# Completely restart everything
pm2 restart all
sudo systemctl restart nginx

# Reset PM2
pm2 kill
pm2 resurrect

# Clear Nginx cache
sudo rm -rf /var/cache/nginx/*
sudo systemctl restart nginx
```

---

**Need more help?** Check:
- README.md - Full documentation
- TROUBLESHOOTING.md - Problem solving guide
