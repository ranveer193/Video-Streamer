# 🏗️ System Architecture

This document explains the technical architecture of the video streaming system.

## 📐 High-Level Architecture

```
┌─────────────┐
│   Browser   │
│   (User)    │
└──────┬──────┘
       │ HTTP/HTTPS
       ▼
┌─────────────────────────────────────┐
│        React Frontend                │
│  ┌─────────────────────────────┐   │
│  │     Video.js Player         │   │
│  │  - Playback controls        │   │
│  │  - Timeline scrubbing       │   │
│  │  - Audio/subtitle switching │   │
│  │  - Quality selection        │   │
│  └─────────────────────────────┘   │
└──────────────┬──────────────────────┘
               │ AJAX Requests
               ▼
┌───────────────────────────────────────┐
│     Node.js Express Server            │
│  ┌──────────────────────────────┐    │
│  │   Streaming Proxy Endpoint   │    │
│  │  - Range request forwarding  │    │
│  │  - Error handling            │    │
│  │  - CORS management           │    │
│  │  - Token validation          │    │
│  └──────────────────────────────┘    │
└──────────────┬────────────────────────┘
               │ HTTP Range Requests
               ▼
┌────────────────────────────────────────┐
│          CDN / Video Host              │
│  - Tokenized URLs                      │
│  - Range request support               │
│  - Video files (MKV/MP4)               │
└────────────────────────────────────────┘
```

## 🔄 Request Flow

### 1. User Interaction Flow

```
User enters URL → Frontend validates → Stores in localStorage
                                    ↓
                        Proxy request created
                                    ↓
                        Backend receives request
                                    ↓
                        CDN connection established
                                    ↓
                        Video stream piped to browser
                                    ↓
                        Video.js begins playback
                                    ↓
                        Progressive buffering continues
```

### 2. HTTP Range Request Flow

```
Browser needs bytes 0-1048576
            ↓
Frontend: GET /stream?url=VIDEO_URL
Header: Range: bytes=0-1048576
            ↓
Backend: Validates URL and Range
            ↓
Backend → CDN: Forward Range request
            ↓
CDN: Returns 206 Partial Content
Content-Range: bytes 0-1048576/total_size
            ↓
Backend: Pipes stream to browser
            ↓
Browser: Receives and plays chunk
            ↓
Process repeats for next chunk...
```

## 🧩 Component Details

### Frontend Components

#### 1. App.jsx (Main Application)
```
├── State Management
│   ├── videoUrl (current video URL)
│   ├── qualitySources (available qualities)
│   ├── isPlaying (playback state)
│   └── error (error state)
│
├── URL Input Component
│   └── Handles URL submission and validation
│
└── Video Player Component
    └── Main playback interface
```

#### 2. VideoPlayer.jsx (Core Player)
```
├── Video.js Initialization
│   ├── Player options configuration
│   ├── Source setup
│   └── Event listeners
│
├── Playback State
│   ├── currentTime tracking
│   ├── duration tracking
│   ├── loading states
│   └── playing/paused state
│
├── Track Management
│   ├── Audio tracks detection
│   ├── Subtitle tracks detection
│   └── Track switching logic
│
├── Storage Management
│   ├── Save playback position
│   ├── Resume on reload
│   └── URL history
│
└── Keyboard Shortcuts
    └── Event handlers for controls
```

#### 3. PlayerControls.jsx (UI Controls)
```
├── Timeline Component
│   ├── Progress bar
│   ├── Seek functionality
│   └── Hover preview (future)
│
├── Playback Controls
│   ├── Play/Pause button
│   ├── Skip forward/back
│   ├── Volume control
│   └── Speed control
│
├── Track Selectors
│   ├── Audio track dropdown
│   ├── Subtitle dropdown
│   └── Quality dropdown
│
└── Additional Controls
    ├── Fullscreen toggle
    └── URL change button
```

#### 4. Selector Components

**AudioTrackSelector**
```
└── Detects audio tracks from Video.js
    ├── Displays track menu
    └── Switches on selection
```

**SubtitleSelector**
```
└── Detects subtitle tracks
    ├── "Off" option
    ├── Track list
    └── Switches on selection
```

**QualitySelector**
```
└── User-provided quality sources
    ├── Quality labels (720p, 1080p)
    ├── Preserves playback position
    └── Switches source on selection
```

### Backend Components

#### 1. Express Server (server.js)

**Middleware Stack:**
```
Request → CORS → Rate Limiter → Router → Response
```

**Streaming Endpoint Logic:**
```javascript
GET /stream?url=VIDEO_URL
    ↓
1. Validate URL parameter
    ↓
2. Parse Range header (if exists)
    ↓
3. Make HEAD request to CDN
   (get file metadata)
    ↓
4. Make GET request with Range header
    ↓
5. Handle CDN response codes:
   - 200: Full file
   - 206: Partial content
   - 401/403: Token expired
   - 404: Not found
   - 5xx: Server error
    ↓
6. Set appropriate response headers:
   - Content-Type
   - Accept-Ranges
   - Content-Range (if 206)
   - Content-Length
    ↓
7. Pipe CDN stream → Browser
    ↓
8. Handle errors and cleanup
```

## 🔐 Security Considerations

### 1. CORS Configuration
```javascript
// Allows requests from any origin
app.use(cors());

// In production, restrict to specific domains:
app.use(cors({
  origin: ['https://your-domain.com'],
  credentials: true
}));
```

### 2. Rate Limiting
```javascript
// Prevents abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // requests per window
});
```

### 3. URL Validation
```javascript
// Ensures valid URLs only
try {
  new URL(videoUrl);
} catch (error) {
  return res.status(400).json({ error: 'Invalid URL' });
}
```

### 4. Token Handling
- Backend detects 401/403 responses
- Returns specific error code to frontend
- Frontend prompts for URL refresh
- User can update URL without losing position

## 🚀 Performance Optimizations

### Backend Optimizations

1. **Stream Piping**
   - No buffering in memory
   - Direct CDN → Browser pipe
   - Minimal server overhead

2. **Connection Reuse**
   - HTTP Keep-Alive enabled
   - Socket keep-alive
   - Connection pooling

3. **Efficient Error Handling**
   - Early validation
   - Proper cleanup
   - Stream destruction on errors

### Frontend Optimizations

1. **Video.js Configuration**
   ```javascript
   preload: 'auto',          // Start buffering immediately
   fluid: true,              // Responsive sizing
   responsive: true,         // Adapt to container
   playbackRates: [...]      // Pre-defined rates
   ```

2. **State Management**
   - Minimal re-renders
   - React hooks for efficiency
   - Local state where possible

3. **LocalStorage Caching**
   - Playback position saved
   - URL history maintained
   - Quick resume on reload

4. **Lazy Loading**
   - Components loaded on demand
   - Video.js loaded only when needed
   - Conditional rendering of menus

## 💾 Data Flow

### Playback Position Persistence

```
Video plays → timeupdate event (every frame)
                    ↓
         currentTime updated in state
                    ↓
         Every 5 seconds → localStorage.setItem()
                    ↓
         On page reload → localStorage.getItem()
                    ├─ Found → player.currentTime(savedTime)
                    └─ Not found → Start from 0
```

### Error Handling Flow

```
Error occurs (CDN, network, format)
            ↓
Backend catches error
            ↓
Returns structured error:
{
  error: "Error message",
  code: "ERROR_CODE",
  status: HTTP_STATUS
}
            ↓
Frontend receives error
            ↓
Updates error state
            ↓
Shows error banner with:
- Error message
- Retry button
- Change URL button
            ↓
User action → Retry or new URL
```

## 🌐 Network Protocol

### HTTP Range Requests

The system relies heavily on HTTP Range requests for efficient streaming:

**Request:**
```http
GET /stream?url=https://cdn.example.com/video.mp4 HTTP/1.1
Range: bytes=0-1048575
```

**Response:**
```http
HTTP/1.1 206 Partial Content
Content-Type: video/mp4
Content-Range: bytes 0-1048575/104857600
Content-Length: 1048576
Accept-Ranges: bytes

[Binary video data]
```

**Benefits:**
- Seek to any position instantly
- No need to download entire file
- Bandwidth efficient
- Better user experience

## 📊 Scalability Considerations

### Current Capacity
- Single VPS deployment
- Suitable for: 10-100 concurrent users
- Limited by: VPS bandwidth and CPU

### Scaling Options

1. **Horizontal Scaling**
   ```
   Load Balancer
        ├─ Backend Server 1
        ├─ Backend Server 2
        └─ Backend Server 3
   ```

2. **Caching Layer**
   ```
   Browser → CDN Edge → Origin CDN
   ```

3. **Database for Users** (future)
   ```
   Backend → Redis → User sessions/preferences
   ```

## 🔄 Alternative Architectures

### Option 1: Direct CDN (No Proxy)
```
Browser → CDN (CORS enabled)
```
**Pros:** Simpler, faster
**Cons:** No token handling, no custom logic

### Option 2: HLS/DASH Streaming
```
Browser → Adaptive Streaming → CDN
```
**Pros:** Better quality adaptation
**Cons:** Requires transcoding

### Option 3: WebRTC P2P
```
Browser ← WebRTC → Other Browsers
```
**Pros:** Distributed load
**Cons:** Complex, not suitable for VOD

## 🎯 Why This Architecture?

**Chosen Architecture: Proxy-based Progressive Streaming**

**Advantages:**
✅ Simple to deploy (single server)
✅ No transcoding overhead
✅ Handles tokenized URLs
✅ Custom error handling
✅ Works with any CDN
✅ Low latency
✅ Cost-effective

**Trade-offs:**
⚠️ Single point of failure (mitigated by PM2)
⚠️ Limited to single server capacity
⚠️ Requires CDN with Range support

**Perfect for:**
- Personal/small team use
- Internal video libraries
- Prototype/MVP
- CDN-backed content

---

This architecture balances simplicity, performance, and functionality for a lightweight, production-ready streaming solution.
