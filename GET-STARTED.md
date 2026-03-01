# 🎬 Video Streaming System - Complete Package

## 📦 What You've Received

A **production-ready, lightweight video streaming platform** for playing large remote video files (MKV/MP4) from direct CDN URLs.

### ✨ Key Features

#### Backend (Node.js + Express)
- ✅ HTTP Range request forwarding for instant seeking
- ✅ Streaming proxy with no transcoding overhead
- ✅ Support for multi-GB files
- ✅ Token expiry handling (401/403 errors)
- ✅ CORS enabled for cross-origin requests
- ✅ Rate limiting for abuse protection
- ✅ Automatic retry on timeout

#### Frontend (React + Video.js)
- ✅ Modern OTT-style dark theme player
- ✅ Instant playback with progressive streaming
- ✅ 10-second skip forward/backward buttons
- ✅ Timeline scrubbing
- ✅ Multiple audio track switching
- ✅ Subtitle/closed caption support
- ✅ Quality selector (720p/1080p)
- ✅ Playback speed control (0.25x - 2x)
- ✅ Volume control with slider
- ✅ Fullscreen support
- ✅ Auto-resume from last playback position
- ✅ Keyboard shortcuts
- ✅ Mobile responsive design

## 📂 Project Structure

```
video-streaming-system/
│
├── 📄 README.md                    # Complete documentation
├── 📄 ARCHITECTURE.md              # Technical architecture details
├── 📄 TROUBLESHOOTING.md           # Problem-solving guide
├── 📄 QUICK-REFERENCE.md           # Command cheat sheet
├── 📄 LICENSE                      # MIT License
├── 🔧 setup.sh                     # Quick local setup script
├── 🚀 deploy.sh                    # VPS deployment script
├── 🧪 test-backend.sh              # Backend testing script
├── 📋 nginx.conf.example           # Nginx configuration template
├── 🚫 .gitignore                   # Git ignore rules
│
├── 🔧 backend/                     # Node.js streaming server
│   ├── server.js                  # Main server code
│   ├── package.json               # Dependencies
│   └── .env.example               # Environment template
│
└── 🎨 frontend/                    # React player application
    ├── package.json               # Dependencies
    ├── .env.example               # Environment template
    ├── public/
    │   └── index.html             # HTML template
    └── src/
        ├── index.jsx              # App entry point
        ├── App.jsx                # Main application
        ├── styles.css             # Complete styling
        └── components/
            ├── VideoPlayer.jsx         # Core video player
            ├── PlayerControls.jsx      # Custom controls
            ├── UrlInput.jsx            # URL input form
            ├── AudioTrackSelector.jsx  # Audio track menu
            ├── SubtitleSelector.jsx    # Subtitle menu
            └── QualitySelector.jsx     # Quality menu
```

## 🚀 Getting Started (3 Minutes)

### Prerequisites
- Node.js 16+ installed
- npm or yarn
- Modern web browser

### Option 1: Quick Setup Script

```bash
cd video-streaming-system
chmod +x setup.sh
./setup.sh
```

The script will:
1. Create .env files
2. Install backend dependencies
3. Install frontend dependencies

Then start the services:
```bash
# Terminal 1 - Backend
cd backend && npm start

# Terminal 2 - Frontend
cd frontend && npm start
```

Visit: **http://localhost:3000**

### Option 2: Manual Setup

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
npm start
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Visit: **http://localhost:3000**

## 🎯 How to Use

1. **Paste your video URL**
   - Direct CDN links work best
   - Supports: MP4, MKV, WebM
   - Example: `https://cdn.example.com/movie.mp4`

2. **Optional: Add multiple quality sources**
   - Check "Add multiple quality sources"
   - Enter 720p and 1080p URLs
   - Switch quality during playback

3. **Click "Start Streaming"**
   - Video plays instantly
   - No waiting for full download
   - Progressive buffering

4. **Use advanced controls**
   - Click timeline to seek
   - Use skip buttons (⏪ ⏩)
   - Switch audio/subtitles if available
   - Adjust playback speed
   - Go fullscreen

5. **Keyboard shortcuts**
   - `Space` - Play/Pause
   - `←` - Back 10s
   - `→` - Forward 10s
   - `F` - Fullscreen
   - `M` - Mute

## 🌐 Production Deployment

### Quick Deploy to VPS

```bash
chmod +x deploy.sh
./deploy.sh
```

Follow the prompts to deploy to your server.

### Manual Deployment Steps

See **README.md** for complete instructions including:
- VPS setup
- Nginx configuration
- PM2 process management
- SSL/HTTPS setup with Let's Encrypt
- Firewall configuration

### One-Command Deploy

After initial VPS setup:
```bash
# Build frontend
cd frontend
echo "REACT_APP_PROXY_URL=http://your-domain.com" > .env
npm run build

# Upload and start
rsync -avz . user@server:~/video-streaming-system/
ssh user@server 'cd video-streaming-system/backend && pm2 restart video-proxy'
```

## 📖 Documentation Guide

### For Quick Setup
→ **QUICK-REFERENCE.md** - Commands cheat sheet

### For Development
→ **README.md** - Complete documentation
→ **ARCHITECTURE.md** - How it works

### For Problems
→ **TROUBLESHOOTING.md** - Solutions to common issues

### For Deployment
→ **README.md** → Production Deployment section
→ **nginx.conf.example** - Server configuration

## 🔧 Configuration

### Backend (.env)
```bash
PORT=3001              # Server port
NODE_ENV=production    # Environment
```

### Frontend (.env)
```bash
# Local development
REACT_APP_PROXY_URL=http://localhost:3001

# Production
REACT_APP_PROXY_URL=http://your-domain.com
```

## 🎨 Customization

### Change Theme Colors
Edit `frontend/src/styles.css`:
```css
/* Primary gradient */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Change to your brand colors */
background: linear-gradient(135deg, #your-color-1, #your-color-2);
```

### Add Custom Features
- Player plugins: Modify `VideoPlayer.jsx`
- UI components: Add to `components/`
- Backend logic: Edit `server.js`

## 🧪 Testing

### Test Backend
```bash
chmod +x test-backend.sh
./test-backend.sh
```

### Manual Testing
```bash
# Health check
curl http://localhost:3001/health

# Test streaming
curl -I "http://localhost:3001/stream?url=YOUR_VIDEO_URL"
```

### Test with Sample Video
Use this public domain video:
```
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
```

## 🔐 Security Notes

1. **CORS**: Currently allows all origins (development friendly)
   - For production, restrict in `server.js`

2. **Rate Limiting**: Default 1000 requests/15min
   - Adjust in `server.js` if needed

3. **HTTPS**: Strongly recommended for production
   - Use Let's Encrypt (free SSL)

4. **Firewall**: Only expose necessary ports
   - 80 (HTTP), 443 (HTTPS)
   - Close 3001 if using Nginx proxy

## 🚀 Performance Tips

1. **Use a CDN** with good bandwidth
2. **Enable quality switching** for adaptive streaming
3. **Setup Nginx caching** for static assets
4. **Use PM2** for process management
5. **Monitor with PM2 logs**: `pm2 logs`

## 🐛 Common Issues & Solutions

### Video won't play
→ Check: Is URL a direct video file?
→ Test: `curl -I "YOUR_VIDEO_URL"`
→ Should return: `Content-Type: video/mp4`

### Backend not accessible
→ Check: `curl http://localhost:3001/health`
→ If fails: Backend not running
→ Solution: `cd backend && npm start`

### Frontend shows blank page
→ Check browser console (F12)
→ Verify: REACT_APP_PROXY_URL in .env
→ Rebuild: `npm run build`

### Token expired errors (403/401)
→ This is normal for CDN links
→ Click "Change URL" button
→ Paste fresh URL
→ Playback resumes from last position

## 💡 Pro Tips

1. **LocalStorage**: Playback position auto-saved
2. **Resume**: Reload page continues from last position
3. **Quality**: Add multiple URLs for quality switching
4. **Audio**: MKV files often have multiple audio tracks
5. **Shortcuts**: Learn keyboard shortcuts for better experience

## 📊 Monitoring (Production)

### PM2 Commands
```bash
pm2 status          # Check status
pm2 logs            # View logs
pm2 monit           # Monitor resources
pm2 restart all     # Restart services
```

### Nginx Logs
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 🤝 Need Help?

1. Check **TROUBLESHOOTING.md** first
2. Review browser console errors (F12)
3. Check backend logs: `pm2 logs`
4. Verify URLs are direct video links
5. Test with sample video first

## 📈 What's Next?

### Immediate
- [ ] Test locally with your videos
- [ ] Customize colors/branding
- [ ] Deploy to VPS

### Optional Enhancements
- [ ] Add video thumbnails on timeline
- [ ] External subtitle file upload
- [ ] Playlist support
- [ ] Download option
- [ ] Chromecast support
- [ ] Picture-in-picture mode

## 🎉 You're Ready!

Your video streaming system is complete and ready to use!

**Start locally:**
```bash
./setup.sh
cd backend && npm start
# New terminal:
cd frontend && npm start
```

**Deploy to production:**
```bash
./deploy.sh
# Or follow README.md deployment guide
```

**Enjoy seamless video streaming! 🍿**

---

**Questions?** Check the comprehensive documentation in README.md

**Issues?** See TROUBLESHOOTING.md for solutions

**Architecture?** Read ARCHITECTURE.md for technical details

**Quick commands?** Use QUICK-REFERENCE.md as a cheat sheet
