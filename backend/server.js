const express    = require('express');
const axios      = require('axios');
const https      = require('https');
const http       = require('http');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const ffmpeg     = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

const app  = express();
const PORT = process.env.PORT || 3001;

const httpAgent  = new http.Agent ({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

const QUALITY_PRESETS = {
  '1080': { scale: '1920:-2', videoBitrate: '4000k', audioBitrate: '192k', crf: 20, preset: 'veryfast' },
  '720':  { scale: '1280:-2', videoBitrate: '2500k', audioBitrate: '128k', crf: 23, preset: 'veryfast' },
  '480':  { scale: '854:-2',  videoBitrate: '1200k', audioBitrate: '96k',  crf: 26, preset: 'veryfast' },
  '360':  { scale: '640:-2',  videoBitrate: '700k',  audioBitrate: '80k',  crf: 28, preset: 'veryfast' },
  '240':  { scale: '426:-2',  videoBitrate: '400k',  audioBitrate: '64k',  crf: 30, preset: 'veryfast' },
};

app.use(cors());
app.use('/stream', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Quality levels info ───────────────────────────────────────────────────
app.get('/qualities', (_req, res) => {
  res.json({
    levels: [
      { quality: 'original', label: 'Original',   description: 'No transcoding, full source quality' },
      { quality: '1080',     label: '1080p HD',    description: '~4 Mbps required' },
      { quality: '720',      label: '720p HD',     description: '~2.5 Mbps required' },
      { quality: '480',      label: '480p SD',     description: '~1.2 Mbps required' },
      { quality: '360',      label: '360p Low',    description: '~700 Kbps required' },
      { quality: '240',      label: '240p Mobile', description: '~400 Kbps required' },
    ],
  });
});

// ─── Main streaming endpoint ───────────────────────────────────────────────
app.get('/stream', async (req, res) => {
  const { url: videoUrl, quality } = req.query;

  if (!videoUrl) return res.status(400).json({ error: 'Missing video URL parameter' });
  try { new URL(videoUrl); }
  catch { return res.status(400).json({ error: 'Invalid URL format' }); }

  // ── FIX: Prewarm fast-path ─────────────────────────────────────────────
  // If this is a speculative bytes=0-0 probe (old frontend code still running,
  // or any other client sending tiny range probes), return immediately with
  // no body. Do NOT relay to CDN — that causes 504 on large files.
  const range = req.headers.range;
  if (range === 'bytes=0-0' && req.headers['x-prewarm-time']) {
    res.setHeader('Content-Length', '0');
    res.setHeader('Accept-Ranges', 'bytes');
    return res.status(200).end();
  }

  const preset       = QUALITY_PRESETS[quality];
  const isTranscoded = !!preset;
  const abortCtrl    = new AbortController();
  let   ffmpegCmd    = null;

  req.on('close', () => {
    if (!res.writableEnded) {
      abortCtrl.abort();
      if (ffmpegCmd) try { ffmpegCmd.kill('SIGKILL'); } catch (_) {}
      if (isTranscoded) console.log(`[${quality}p] Client left, killed transcoder`);
    }
  });

  const cdnHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  try {
    // ── Passthrough ────────────────────────────────────────────────────
    if (!isTranscoded) {
      if (range) cdnHeaders['Range'] = range;

      const response = await axios({
        method:         'GET',
        url:            videoUrl,
        headers:        cdnHeaders,
        responseType:   'stream',
        // FIX: separate connect vs read timeout
        // timeout here applies to connection establishment only;
        // the stream itself is open-ended
        timeout:        15_000,
        maxRedirects:   5,
        httpAgent,
        httpsAgent,
        signal:         abortCtrl.signal,
        validateStatus: (s) => s >= 200 && s < 500,
      });

      if (response.status === 401 || response.status === 403) {
        response.data.destroy();
        return res.status(response.status).json({ error: 'Access denied', code: 'TOKEN_EXPIRED' });
      }
      if (response.status === 404) {
        response.data.destroy();
        return res.status(404).json({ error: 'Video not found' });
      }
      if (response.status >= 400) {
        response.data.destroy();
        return res.status(response.status).json({ error: 'CDN error', status: response.status });
      }

      const contentType   = response.headers['content-type']   || 'video/mp4';
      const contentLength = response.headers['content-length'];

      res.setHeader('Content-Type',  contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Connection',    'keep-alive');

      if (range && response.status === 206) {
        res.status(206);
        res.setHeader('Content-Range', response.headers['content-range']);
        if (contentLength) res.setHeader('Content-Length', contentLength);
        console.log(`[original] Range: ${response.headers['content-range']}`);
      } else {
        if (contentLength) res.setHeader('Content-Length', contentLength);
        console.log(`[original] Full: ${contentLength ?? '?'} bytes`);
      }

      response.data.pipe(res);
      response.data.on('error', (e) => {
        if (e.code === 'ERR_CANCELED' || e.code === 'ECONNRESET') return;
        console.error('[original] Stream error:', e.message);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      return;
    }

    // ── Transcoded ─────────────────────────────────────────────────────
    console.log(`[${quality}p] Starting transcode`);

    const sourceResp = await axios({
      method:         'GET',
      url:            videoUrl,
      headers:        cdnHeaders,
      responseType:   'stream',
      timeout:        15_000,
      maxRedirects:   5,
      httpAgent,
      httpsAgent,
      signal:         abortCtrl.signal,
      validateStatus: (s) => s >= 200 && s < 500,
    });

    if (sourceResp.status >= 400) {
      sourceResp.data.destroy();
      return res.status(sourceResp.status).json({ error: 'Failed to fetch source', status: sourceResp.status });
    }

    res.setHeader('Content-Type',  'video/mp4');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Quality',      quality);

    ffmpegCmd = ffmpeg(sourceResp.data)
      .inputOptions(['-re'])
      .outputOptions([
        '-vf',      `scale=${preset.scale}`,
        '-c:v',     'libx264',
        '-preset',   preset.preset,
        '-crf',      String(preset.crf),
        '-b:v',      preset.videoBitrate,
        '-maxrate',  preset.videoBitrate,
        '-bufsize',  `${parseInt(preset.videoBitrate) * 2}k`,
        '-c:a',     'aac',
        '-b:a',      preset.audioBitrate,
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-f',       'mp4',
      ])
      .on('start',  ()    => console.log(`[${quality}p] FFmpeg started`))
      .on('end',    ()    => { console.log(`[${quality}p] Transcode complete`); res.end(); })
      .on('error', (err) => {
        if (err.message.includes('SIGKILL') || err.message.includes('killed')) return;
        console.error(`[${quality}p] FFmpeg error:`, err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Transcode failed' });
        else res.end();
      });

    ffmpegCmd.pipe(res, { end: true });

  } catch (err) {
    if (axios.isCancel(err) || err.code === 'ERR_CANCELED') return;
    console.error('Streaming error:', err.message);
    if (!res.headersSent) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        return res.status(504).json({ error: 'CDN timeout', code: 'TIMEOUT' });
      }
      return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Streaming proxy on port ${PORT}`);
  console.log(`📺 Stream:    http://localhost:${PORT}/stream?url=URL`);
  console.log(`⚙️  Transcode: http://localhost:${PORT}/stream?url=URL&quality=720`);
  console.log(`❤️  Health:   http://localhost:${PORT}/health`);
});

module.exports = app;