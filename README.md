# 🎬 Video Streaming System

A lightweight, production-ready video streaming platform for playing large remote video files (MKV/MP4) from CDN URLs. Features a modern OTT-style player with advanced controls, multi-audio/subtitle support, and instant progressive streaming.

## ✨ Features

### Backend
- ✅ HTTP Range request forwarding
- ✅ CDN streaming proxy
- ✅ Support for large files (multi-GB)
- ✅ Automatic retry on timeout
- ✅ Token expiry handling (401/403)
- ✅ CORS enabled
- ✅ Rate limiting protection
- ✅ No transcoding overhead

### Frontend Player
- ✅ Video.js based player
- ✅ Instant playback with progressive streaming
- ✅ 10-second skip forward/backward
- ✅ Timeline scrubbing with preview
- ✅ Multiple audio track switching
- ✅ Subtitle track support
- ✅ Quality selector (720p/1080p)
- ✅ Playback speed control (0.25x - 2x)
- ✅ Volume control with slider
- ✅ Fullscreen support
- ✅ Auto-resume from last position
- ✅ Modern OTT-style dark UI
- ✅ Keyboard shortcuts
- ✅ Mobile responsive

### Keyboard Shortcuts
- `Space` / `K` - Play/Pause
- `←` - Rewind 10 seconds
- `→` - Forward 10 seconds
- `F` - Toggle fullscreen
- `M` - Mute/Unmute
- `↑` - Increase volume
- `↓` - Decrease volume

## 🏗️ Architecture

```
User Browser
    ↓
React Frontend (Video.js Player)
    ↓
Node.js Express Proxy (HTTP Range forwarding)
    ↓
CDN (Video Files)
```

**Flow:**
1. User pastes CDN video URL
2. Frontend requests video through proxy
3. Proxy forwards Range requests to CDN
4. Video streams directly to browser
5. Player buffers and plays progressively

## 📋 Prerequisites

- Node.js 16+ 
- npm or yarn
- Modern web browser with HTML5 video support

## 🚀 Quick Start (Local Development)

### 1. Clone or Download

```bash
cd video-streaming-system
```

### 2. Setup Backend

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Backend will start on `http://localhost:3001`

### 3. Setup Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Frontend will start on `http://localhost:3000`

### 4. Open Browser

Navigate to `http://localhost:3000` and paste your video URL!

## 📦 Production Deployment (Single VPS)

### Method 1: Manual Deployment

#### 1. Prepare Your VPS

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx

# Install PM2 (process manager)
sudo npm install -g pm2
```

#### 2. Upload Code to VPS

```bash
# On your local machine
scp -r video-streaming-system user@your-server-ip:/home/user/

# Or use git
ssh user@your-server-ip
cd /home/user
git clone your-repo-url video-streaming-system
```

#### 3. Setup Backend

```bash
cd /home/user/video-streaming-system/backend
npm install --production
cp .env.example .env

# Edit .env if needed
nano .env

# Start with PM2
pm2 start server.js --name video-proxy
pm2 save
pm2 startup
```

#### 4. Build Frontend

```bash
cd /home/user/video-streaming-system/frontend

# Update proxy URL for production
echo "REACT_APP_PROXY_URL=http://your-server-ip:3001" > .env

npm install
npm run build
```

#### 5. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/video-streaming
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or your-server-ip

    # Frontend (React build)
    location / {
        root /home/user/video-streaming-system/frontend/build;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API proxy
    location /stream {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Important for streaming
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_connect_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /health {
        proxy_pass http://localhost:3001;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/video-streaming /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 6. Setup Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

#### 7. Access Your Player

Visit `http://your-server-ip` or `http://your-domain.com`

### Method 2: Docker Deployment (Optional)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    environment:
      - REACT_APP_PROXY_URL=http://backend:3001
    restart: unless-stopped
```

Deploy:

```bash
docker-compose up -d
```

## 🔐 HTTPS Setup (Optional but Recommended)

### Using Let's Encrypt (Certbot)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically configure SSL and update your Nginx config.

## 📖 Usage

### Basic Usage

1. Open the player in your browser
2. Paste a direct CDN video URL (e.g., `https://cdn.example.com/movie.mp4`)
3. Click "Start Streaming"
4. Video plays instantly with all controls

### Multiple Quality Sources

1. Check "Add multiple quality sources"
2. Enter URLs for different qualities:
   - Main URL: Auto/Original
   - 720p URL: Lower quality
   - 1080p URL: High quality
3. Use the quality selector during playback to switch

### Resume Playback

The player automatically saves your playback position every 5 seconds. When you reload the same URL, it will resume from where you left off.

### Handle Expired URLs

If your CDN URL expires (403/401 error):
1. Click "Change URL" button
2. Paste a new/refreshed URL
3. Player will resume from your last position

## 🛠️ Configuration

### Backend Environment Variables

```bash
PORT=3001                    # Server port
NODE_ENV=production         # Environment mode
```

### Frontend Environment Variables

```bash
REACT_APP_PROXY_URL=http://localhost:3001  # Backend proxy URL
```

## 📊 Performance Optimization

### Backend
- Uses streaming (no full file buffering)
- Efficient HTTP Range forwarding
- Connection pooling for CDN requests
- Rate limiting to prevent abuse

### Frontend
- Lazy loading components
- Video.js optimized buffering
- LocalStorage for playback position
- Minimal re-renders with React hooks

## 🐛 Troubleshooting

### Video won't play

**Check:**
1. Is the URL a direct video file link?
2. Does the URL support HTTP Range requests?
3. Is CORS enabled on the CDN?
4. Check browser console for errors

**Test the proxy directly:**
```bash
curl -I "http://localhost:3001/stream?url=YOUR_VIDEO_URL"
```

### Slow buffering

**Possible causes:**
1. CDN bandwidth limitations
2. Large file size
3. Network congestion

**Solutions:**
- Use a CDN with better bandwidth
- Enable lower quality sources
- Check your VPS network speed

### Token expired errors

This is normal for tokenized CDN links. Simply:
1. Get a fresh URL
2. Click "Change URL"
3. Paste new URL
4. Playback resumes automatically

### Audio/Subtitles not showing

**MKV files:** 
- Audio tracks usually detected automatically
- Subtitle tracks depend on browser support
- Some formats may need conversion

**MP4 files:**
- Multiple audio tracks supported
- External subtitle files not currently supported
- Use embedded subtitles

## 🔧 Advanced Configuration

### Increase File Size Limit

Edit `backend/server.js`:

```javascript
// Increase timeout for very large files
timeout: 60000, // 60 seconds
```

### Custom Video.js Plugins

Add to `frontend/src/components/VideoPlayer.jsx`:

```javascript
// After player initialization
vjsPlayer.somePlugin();
```

### Add Custom Themes

Edit `frontend/src/styles.css` to customize colors, fonts, etc.

## 📝 API Reference

### Backend Endpoints

#### GET /stream

Stream video with Range support.

**Query Parameters:**
- `url` (required): CDN video URL

**Headers:**
- `Range`: Byte range (optional)

**Response:**
- Status: 200 (full file) or 206 (partial)
- Headers: Content-Type, Accept-Ranges, Content-Range
- Body: Video stream

**Example:**
```bash
curl "http://localhost:3001/stream?url=https://cdn.example.com/video.mp4" \
  -H "Range: bytes=0-1023"
```

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-03-01T12:00:00.000Z"
}
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 🙏 Acknowledgments

- Video.js - Excellent HTML5 video player
- Express.js - Fast Node.js framework
- React - UI library
- Axios - HTTP client

## 📞 Support

For issues and questions:
- Check troubleshooting section above
- Review browser console errors
- Ensure URLs are direct video links
- Test with sample videos first

## 🎯 Roadmap

Future enhancements:
- [ ] External subtitle file upload
- [ ] Video thumbnails preview on timeline
- [ ] Chromecast support
- [ ] Download option
- [ ] Playlist support
- [ ] Watch party mode
- [ ] Picture-in-picture
- [ ] Video filters/effects

---

**Built with ❤️ for seamless video streaming**
