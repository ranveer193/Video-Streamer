# 🔧 Troubleshooting Guide

This guide covers common issues and their solutions.

## 🚫 Backend Issues

### Backend won't start

**Error: `EADDRINUSE` - Port already in use**

Solution:
```bash
# Find process using port 3001
lsof -i :3001
# or
netstat -nlp | grep 3001

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3002 npm start
```

**Error: Module not found**

Solution:
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Streaming endpoint returns errors

**403/401 - Forbidden/Unauthorized**

Cause: CDN URL expired or requires authentication

Solution:
- Get a fresh URL from your CDN
- Check if CDN requires specific headers
- Verify URL is a direct video file link

**504 - Gateway Timeout**

Cause: CDN is slow or unresponsive

Solution:
- Increase timeout in `server.js`:
```javascript
timeout: 60000, // 60 seconds
```
- Check CDN is accessible directly:
```bash
curl -I "YOUR_CDN_URL"
```

**CORS Error**

Cause: CDN doesn't allow cross-origin requests

Solution:
- This is a CDN limitation
- Request CDN to enable CORS
- Or contact CDN support

## 🎬 Frontend Issues

### Frontend won't build

**Error: `npm ERR! Missing script: "start"`**

Solution:
```bash
cd frontend
npm install react-scripts
```

**Error: Module not found**

Solution:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Video won't play

**Black screen with loading spinner**

Checks:
1. Is backend running? Visit http://localhost:3001/health
2. Check browser console for errors (F12)
3. Is the URL a direct video file?

Test URL directly:
```bash
curl -I "YOUR_VIDEO_URL"
```

Should return:
```
HTTP/1.1 200 OK
Content-Type: video/mp4
Accept-Ranges: bytes
```

**Video plays but no audio/subtitles menu**

This is normal if:
- File only has one audio track
- File has no subtitle tracks
- Browser doesn't support the format

For MKV files:
- Some browsers have limited MKV support
- Consider converting to MP4:
```bash
ffmpeg -i input.mkv -c copy output.mp4
```

**Error: "Network Error"**

Checks:
1. Is REACT_APP_PROXY_URL set correctly in .env?
```bash
# Should be:
REACT_APP_PROXY_URL=http://localhost:3001
```

2. Backend is running on correct port?
```bash
ps aux | grep node
```

### Controls not working

**Keyboard shortcuts don't work**

Solution:
- Click on the video player area first
- Check if you're focused on an input field

**Timeline scrubbing doesn't work**

This can happen if:
- Video doesn't support Range requests
- Browser security restrictions

Check browser console for errors.

## 🚀 Deployment Issues

### Nginx not serving frontend

**404 errors for static files**

Solution:
```bash
# Check build directory exists
ls -la /home/user/video-streaming-system/frontend/build

# Check Nginx config
sudo nginx -t

# Check file permissions
sudo chown -R www-data:www-data /home/user/video-streaming-system/frontend/build

# Or use your user
sudo chown -R $USER:$USER /home/user/video-streaming-system/frontend/build
```

**Blank page after deployment**

Solution:
1. Check browser console (F12) for errors
2. Verify REACT_APP_PROXY_URL in .env points to your server
3. Rebuild frontend:
```bash
cd frontend
echo "REACT_APP_PROXY_URL=http://your-domain.com" > .env
npm run build
```

### PM2 Issues

**PM2 not starting**

Check logs:
```bash
pm2 logs video-proxy
```

Common fixes:
```bash
# Restart
pm2 restart video-proxy

# Full reset
pm2 delete video-proxy
cd backend
pm2 start server.js --name video-proxy
pm2 save
```

**Process keeps crashing**

Check error logs:
```bash
pm2 logs video-proxy --err
```

Increase memory limit:
```bash
pm2 start server.js --name video-proxy --max-memory-restart 500M
```

### SSL/HTTPS Issues

**Certbot fails**

Checks:
1. Domain points to your server IP:
```bash
nslookup your-domain.com
```

2. Port 80 is open:
```bash
sudo ufw status
sudo ufw allow 'Nginx Full'
```

3. Nginx is running:
```bash
sudo systemctl status nginx
```

Retry:
```bash
sudo certbot --nginx -d your-domain.com
```

**Mixed content errors (HTTPS page loading HTTP resources)**

Solution: Update frontend .env:
```bash
REACT_APP_PROXY_URL=https://your-domain.com
```

Rebuild and redeploy.

## 🌐 Network Issues

### Firewall blocking connections

**Ubuntu/Debian:**
```bash
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3001/tcp  # Only if accessing backend directly
```

**CentOS/RHEL:**
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

### Slow streaming

**Possible causes:**
1. VPS bandwidth limitation
2. CDN throttling
3. Large file size

**Solutions:**
- Use a CDN with better bandwidth
- Enable quality switching (lower quality options)
- Check VPS network speed:
```bash
curl -s https://raw.githubusercontent.com/sivel/speedtest-cli/master/speedtest.py | python3 -
```

- Optimize Nginx buffering in nginx.conf:
```nginx
# Add to location /stream
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
```

## 📊 Performance Tuning

### Backend Performance

**Handle more concurrent streams:**

In `server.js`, adjust rate limiting:
```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // Increase from 1000
});
```

**Increase Node.js memory:**
```bash
pm2 start server.js --name video-proxy --node-args="--max-old-space-size=4096"
```

### Frontend Performance

**Reduce bundle size:**
```bash
# Analyze bundle
npm run build
npx source-map-explorer 'build/static/js/*.js'
```

**Enable compression in Nginx:**
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
gzip_proxied any;
```

## 🐛 Debug Mode

### Enable Backend Debug Logging

In `server.js`, add more console logs:
```javascript
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});
```

### Enable Frontend Debug

In browser console:
```javascript
localStorage.setItem('debug', 'true');
```

## 📞 Getting Help

If issues persist:

1. **Check logs:**
   - Backend: `pm2 logs video-proxy`
   - Nginx: `sudo tail -f /var/log/nginx/error.log`
   - Browser: F12 → Console tab

2. **Test components separately:**
   - Backend health: `curl http://localhost:3001/health`
   - Direct streaming: `curl -I "http://localhost:3001/stream?url=TEST_URL"`
   - Frontend build: Check `frontend/build/` exists

3. **Verify prerequisites:**
   - Node.js version: `node --version` (should be 16+)
   - Port availability: `lsof -i :3001`
   - Disk space: `df -h`

4. **Common fixes:**
   ```bash
   # Full restart
   pm2 restart video-proxy
   sudo systemctl restart nginx
   
   # Clear cache
   rm -rf frontend/node_modules frontend/build
   cd frontend && npm install && npm run build
   ```

## ✅ Health Check Checklist

Run these commands to verify everything is working:

```bash
# 1. Backend health
curl http://localhost:3001/health

# 2. Test streaming (use your URL)
curl -I "http://localhost:3001/stream?url=YOUR_VIDEO_URL"

# 3. PM2 status
pm2 status

# 4. Nginx status
sudo systemctl status nginx

# 5. Check ports
sudo netstat -tlnp | grep -E '(80|443|3001)'

# 6. Frontend build exists
ls -la frontend/build/index.html
```

All should return success/OK responses.

---

Still having issues? Check:
- System logs: `journalctl -xe`
- Available memory: `free -h`
- CPU usage: `top`
- Disk space: `df -h`
