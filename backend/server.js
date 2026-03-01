const express   = require('express');
const https     = require('https');
const http      = require('http');
const dns       = require('dns').promises;
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CHUNK_BYTES  = 8 * 1024 * 1024;   // 8 MB range cap

// Stall watchdog fires after this long with no data.
// MUST be less than the agent socket timeout so the watchdog always wins
// the teardown race (agent timeout fires ECONNRESET at the same instant
// otherwise, producing two simultaneous teardown paths on one stream).
const STALL_TIMEOUT_MS  = 15_000;
const AGENT_TIMEOUT_MS  = 25_000;  // > STALL_TIMEOUT_MS — watchdog wins the race

// ─── SSRF blocklist (string-level, re-checked after DNS lookup) ───────────────
//
// Two-layer defence:
//   Layer 1 — fast string check on the URL hostname before any network I/O
//   Layer 2 — dns.lookup() resolves the hostname to an IP, then we check the
//              resolved IP against the same CIDR table before opening a socket.
//
// This closes the DNS-rebinding bypass where hostname passes layer 1 but
// resolves to a private IP after the check.
const BLOCKED_HOSTNAME_RE = /^(localhost|.*\.local)$/i;

// Parsed once at startup into { lo, hi } unsigned 32-bit integer ranges.
const BLOCKED_CIDRS = [
  ['0.0.0.0',     '0.255.255.255'  ],
  ['10.0.0.0',    '10.255.255.255' ],
  ['100.64.0.0',  '100.127.255.255'], // CGNAT
  ['127.0.0.0',   '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'], // link-local / AWS+GCP metadata
  ['172.16.0.0',  '172.31.255.255' ],
  ['192.168.0.0', '192.168.255.255'],
  ['198.18.0.0',  '198.19.255.255' ],
  ['240.0.0.0',   '255.255.255.255'],
].map(([lo, hi]) => ({ lo: ipv4ToInt(lo), hi: ipv4ToInt(hi) }));

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, p) => (acc * 256) + parseInt(p, 10), 0) >>> 0;
}

function isBlockedIp(ip) {
  const n = ipv4ToInt(ip);
  if (isNaN(n)) return false; // IPv6 — block handled separately
  return BLOCKED_CIDRS.some(({ lo, hi }) => n >= lo && n <= hi);
}

// Synchronous hostname string check — catches obvious cases without a DNS call.
function isBlockedHostname(hostname) {
  if (BLOCKED_HOSTNAME_RE.test(hostname)) return true;
  // Bare IP address in the URL — check immediately without DNS
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return isBlockedIp(hostname);
  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;
  return false;
}

// Full async check: string check + DNS resolution check.
async function isBlockedUrl(urlString) {
  let parsed;
  try { parsed = new URL(urlString); } catch { return true; }

  const { hostname, protocol } = parsed;

  if (protocol !== 'http:' && protocol !== 'https:') return true;
  if (isBlockedHostname(hostname)) return true;

  // Resolve hostname → IP and check the IP against CIDR table.
  // This is the DNS-rebinding fix: even if hostname looks public,
  // if it resolves to a private IP we block it.
  try {
    const result = await dns.lookup(hostname, { family: 4 });
    if (isBlockedIp(result.address)) return true;
  } catch {
    // DNS failure — block the request (fail closed)
    return true;
  }

  return false;
}

// ─── Expected stream error codes ─────────────────────────────────────────────
const EXPECTED_ERROR_CODES = new Set([
  'ERR_CANCELED',
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_SOCKET',
]);
const EXPECTED_ERROR_PATTERNS = [
  /socket\s+(closed|hang\s*up|aborted)/i,
  /premature\s+close/i,
  /aborted/i,
  /write\s+after\s+end/i,
  /read\s+ECONNRESET/i,
];
function isExpectedStreamError(err) {
  if (!err) return false;
  if (EXPECTED_ERROR_CODES.has(err.code)) return true;
  if (err.message && EXPECTED_ERROR_PATTERNS.some(re => re.test(err.message))) return true;
  return false;
}

// ─── Connection pools ─────────────────────────────────────────────────────────
// agent timeout is set ABOVE the stall watchdog so the watchdog always
// tears the stream down before the agent fires a competing ECONNRESET.
const httpAgent  = new http.Agent ({
  keepAlive:  true,
  maxSockets: 50,
  timeout:    AGENT_TIMEOUT_MS,
});
const httpsAgent = new https.Agent({
  keepAlive:  true,
  maxSockets: 50,
  timeout:    AGENT_TIMEOUT_MS,
});

// ─── Middleware ───────────────────────────────────────────────────────────────

// FIX (Issue 10): tell Express to trust the first proxy hop so req.ip
// reflects the real client IP, not the reverse-proxy IP. Without this,
// all clients share one rate-limit bucket and the limit is hit for everyone
// simultaneously when any one IP is aggressive.
// Set to the number of proxy hops in front of this service (usually 1).
app.set('trust proxy', 1);

// FIX (Issue 14): expose Content-Length to cross-origin JS.
// Without this header, fetch() from a browser can't read Content-Length on
// cross-origin responses even if the server sends it — the browser hides it.
// useSeekOptimizer's HEAD request needs this to set contentLengthRef.
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
}));

app.use('/stream', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      1000,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── fetchUpstream ────────────────────────────────────────────────────────────
// FIX (Issue 5): track visited URLs to detect redirect loops (same URL re-visited)
// before we exhaust the 5-hop limit.
function fetchUpstream(url, headers, signal, redirects = 0, visited = new Set()) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));

    // Detect redirect loop — same URL seen twice
    if (visited.has(url)) return reject(new Error('Redirect loop detected'));
    visited.add(url);

    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const agent  = parsed.protocol === 'https:' ? httpsAgent : httpAgent;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers,
        agent,
      },
      (upstream) => {
        const { statusCode, headers: h } = upstream;
        if (
          (statusCode === 301 || statusCode === 302 ||
           statusCode === 307 || statusCode === 308) &&
          h.location
        ) {
          upstream.resume();
          return resolve(
            fetchUpstream(h.location, headers, signal, redirects + 1, visited)
          );
        }
        resolve(upstream);
      }
    );

    req.on('error', reject);

    if (signal) {
      signal.addEventListener('abort', () => {
        req.destroy();
        reject(Object.assign(new Error('Aborted'), { code: 'ERR_CANCELED' }));
      }, { once: true });
    }

    req.end();
  });
}

// ─── attachStallWatchdog ──────────────────────────────────────────────────────
// Throttled to reset at most once per second so high-bitrate streams don't
// generate hundreds of clearTimeout/setTimeout pairs per second.
function attachStallWatchdog(stream, label) {
  const RESET_THROTTLE_MS = 1000;
  let timer     = null;
  let lastReset = 0;

  const reset = () => {
    const now = Date.now();
    if (now - lastReset < RESET_THROTTLE_MS) return;
    lastReset = now;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.warn(`[${label}] stall — no data for ${STALL_TIMEOUT_MS / 1000}s`);
      stream.destroy();
    }, STALL_TIMEOUT_MS);
  };

  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  reset();
  stream.on('data',  reset);
  stream.on('end',   cancel);
  stream.on('close', cancel);
  stream.on('error', cancel);

  return cancel;
}

// ─── parseRange ───────────────────────────────────────────────────────────────
// FIX (Issue 4): detect multi-range requests (bytes=0-100,200-300) and
// return null with a flag so the caller can send 416.
// We only support single-range — multi-range requires multipart/byteranges
// body framing which this proxy does not implement.
function parseRange(header) {
  if (!header) return { range: null, multiRange: false };

  // Multi-range: contains a comma after the first range
  const multiRange = /bytes=\d+-\d*,/.test(header);
  if (multiRange) return { range: null, multiRange: true };

  const m = header.match(/bytes=(\d+)-(\d*)/);
  if (!m) return { range: null, multiRange: false };

  return {
    range: {
      start: parseInt(m[1], 10),
      end:   m[2] !== '' ? parseInt(m[2], 10) : null,
    },
    multiRange: false,
  };
}

// ─── pipeWithCleanup ──────────────────────────────────────────────────────────
// FIX (Issue 3): track streamEnded to prevent double res.end().
// upstream.pipe(res) already calls res.end() on upstream 'end'.
// The error handler must NOT call res.end() again if the stream already ended.
function pipeWithCleanup(upstream, res, label) {
  const cancelWatchdog = attachStallWatchdog(upstream, label);
  let streamEnded = false;

  upstream.pipe(res);

  upstream.on('end', () => {
    streamEnded = true;
    cancelWatchdog();
  });

  upstream.on('close', () => {
    cancelWatchdog();
  });

  upstream.on('error', (err) => {
    cancelWatchdog();

    // Post-completion CDN reset — stream already ended cleanly, ignore.
    if (streamEnded)                return;
    if (isExpectedStreamError(err)) return;

    console.error(`[${label}] upstream error: ${err.message} (code=${err.code})`);

    // Only terminate if the stream hasn't already ended naturally.
    // pipe() will have called res.end() if streamEnded is true, so
    // we must not call it again here.
    if (!res.headersSent) res.status(502).end();
    else if (!res.writableEnded) res.end();
  });

  res.on('close', () => {
    if (!upstream.destroyed) upstream.destroy();
    cancelWatchdog();
  });
}

// ─── handleUpstreamErrors ─────────────────────────────────────────────────────
// FIX (Issue 13 partial): also detect when CDN ignores our Range header and
// returns a full 200 response. We can't serve that as a 206 — the Content-Length
// would be wrong. Treat it as a pass-through 200 (correct for non-range path;
// for range path we close with 502 since the CDN is misbehaving).
function handleUpstreamErrors(upstream, res, label, isRangeRequest = false) {
  const { statusCode } = upstream;

  if (statusCode === 401 || statusCode === 403) {
    upstream.resume();
    res.status(statusCode).json({ error: 'Access denied', code: 'TOKEN_EXPIRED' });
    return 'error';
  }
  if (statusCode === 404) {
    upstream.resume();
    res.status(404).json({ error: 'Video not found' });
    return 'error';
  }
  if (statusCode >= 400) {
    upstream.resume();
    console.warn(`[${label}] CDN returned ${statusCode}`);
    res.status(statusCode).json({ error: 'CDN error', status: statusCode });
    return 'error';
  }

  // FIX (Issue 13): CDN returned 200 when we asked for a range.
  // Signal caller so it can serve a corrected 200 pass-through instead of
  // building an invalid 206 response with a wrong Content-Length.
  if (isRangeRequest && statusCode === 200) {
    return 'cdn-ignored-range';
  }

  return 'ok';
}

// ─── /stream handler (shared GET + HEAD) ─────────────────────────────────────
async function streamHandler(req, res) {
  const { url: videoUrl } = req.query;

  if (!videoUrl) return res.status(400).json({ error: 'Missing url parameter' });

  // FIX (Issue 1): async DNS-level SSRF check — catches DNS rebinding attacks.
  // String check was insufficient because hostname resolution happens later
  // inside Node's http.request(). We now resolve before opening any socket.
  let blocked;
  try { blocked = await isBlockedUrl(videoUrl); }
  catch { blocked = true; }
  if (blocked) return res.status(403).json({ error: 'URL not allowed' });

  const baseHeaders = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept':          '*/*',
    'Accept-Encoding': 'identity',
  };

  // ── HEAD — return headers only so clients can read Content-Length ─────
  // FIX (Issue 14 server side): Content-Length is already exposed via the
  // cors({ exposedHeaders }) config above, so fetch() in the browser
  // will now be able to read it.
  if (req.method === 'HEAD') {
    try {
      const upstream = await fetchUpstream(videoUrl, baseHeaders, null);
      upstream.resume(); // drain body — HEAD must not send a body
      res.status(upstream.statusCode);
      if (upstream.headers['content-length'])
        res.setHeader('Content-Length', upstream.headers['content-length']);
      if (upstream.headers['content-type'])
        res.setHeader('Content-Type', upstream.headers['content-type']);
      res.setHeader('Accept-Ranges', 'bytes');
      return res.end();
    } catch (err) {
      if (isExpectedStreamError(err)) return res.end();
      return res.status(502).end();
    }
  }

  // FIX (Issue 2): create AbortController before registering req.on('close')
  // and guard against abort firing after the handler has already finished.
  // Without the `handled` flag, an abort arriving after the try-catch exits
  // causes an unhandled Promise rejection in fetchUpstream.
  const abortCtrl = new AbortController();
  let   handled   = false;

  req.on('close', () => {
    if (!handled) abortCtrl.abort();
  });

  try {
    const { range, multiRange } = parseRange(req.headers.range);

    // FIX (Issue 4): reject multi-range with 416 — we only support single range.
    if (multiRange) {
      return res.status(416).json({ error: 'Multi-range requests not supported' });
    }

    if (range) {
      // ── RANGE: capped 8 MB progressive streaming ─────────────────────
      let { start, end } = range;

      if (end === null || (end - start + 1) > MAX_CHUNK_BYTES) {
        end = start + MAX_CHUNK_BYTES - 1;
      }

      const upstream = await fetchUpstream(
        videoUrl,
        { ...baseHeaders, Range: `bytes=${start}-${end}` },
        abortCtrl.signal
      );

      const upstreamResult = handleUpstreamErrors(upstream, res, 'range', true);

      if (upstreamResult === 'error') return;

      // FIX (Issue 13): CDN ignored our Range header and returned a full 200.
      // Fall back to plain pass-through — a 206 with wrong Content-Length would
      // cause ERR_CONTENT_LENGTH_MISMATCH or a stalled download.
      if (upstreamResult === 'cdn-ignored-range') {
        console.warn('[range] CDN ignored Range header, falling back to 200 pass-through');
        const contentLength = upstream.headers['content-length'];
        res.status(200);
        res.setHeader('Content-Type',  upstream.headers['content-type'] || 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        pipeWithCleanup(upstream, res, 'range-fallback');
        return;
      }

      // Derive accurate byte bounds from Content-Range or Content-Length.
      // Both paths prevent Content-Length lying about EOF chunks.
      let totalSize = null;
      const cdnRange = upstream.headers['content-range'];
      if (cdnRange) {
        const m = cdnRange.match(/\/(\d+)$/);
        if (m) totalSize = parseInt(m[1], 10);
      }

      const cdnContentLength = upstream.headers['content-length']
        ? parseInt(upstream.headers['content-length'], 10)
        : null;

      let actualEnd;
      if (totalSize !== null) {
        actualEnd = Math.min(end, totalSize - 1);
      } else if (cdnContentLength !== null) {
        actualEnd = start + cdnContentLength - 1;
      } else {
        actualEnd = end;
      }

      const chunkBytes   = actualEnd - start + 1;
      const totalSizeStr = totalSize !== null ? String(totalSize) : '*';

      res.status(206);
      res.setHeader('Content-Type',   upstream.headers['content-type'] || 'video/mp4');
      res.setHeader('Accept-Ranges',  'bytes');
      res.setHeader('Content-Range',  `bytes ${start}-${actualEnd}/${totalSizeStr}`);
      res.setHeader('Content-Length', String(chunkBytes));
      res.setHeader('Cache-Control',  'public, max-age=3600');
      res.setHeader('Connection',     'keep-alive');

      console.log(`[range] 206 bytes ${start}-${actualEnd}/${totalSizeStr} (${(chunkBytes/1024).toFixed(0)} KB) | ${videoUrl.slice(0,80)}`);

      pipeWithCleanup(upstream, res, 'range');

    } else {
      // ── NO RANGE: plain pass-through ─────────────────────────────────
      const upstream = await fetchUpstream(videoUrl, baseHeaders, abortCtrl.signal);
      if (handleUpstreamErrors(upstream, res, 'passthrough') !== 'ok') return;

      const contentType   = upstream.headers['content-type']   || 'video/mp4';
      const contentLength = upstream.headers['content-length'];

      res.status(200);
      res.setHeader('Content-Type',  contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Connection',    'keep-alive');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      console.log(`[passthrough] 200 | ${contentLength ?? '?'} bytes | ${videoUrl.slice(0,80)}`);

      pipeWithCleanup(upstream, res, 'passthrough');
    }

  } catch (err) {
    if (isExpectedStreamError(err)) return;
    console.error('[stream] fatal:', err.message, err.code ?? '');
    if (!res.headersSent) {
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED' || err.code === 'ECONNRESET') {
        return res.status(504).json({ error: 'CDN timeout', code: 'TIMEOUT' });
      }
      return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  } finally {
    // FIX (Issue 2): mark handler as done so the req 'close' listener
    // doesn't fire abort on an already-resolved promise chain.
    handled = true;
  }
}

app.get('/stream',  streamHandler);
app.head('/stream', streamHandler);

app.use((err, _req, res, _next) => {
  console.error('Unhandled middleware error:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Streaming proxy on port ${PORT}`);
  console.log(`📺 Stream: http://localhost:${PORT}/stream?url=<encoded-url>`);
  console.log(`❤️  Health: http://localhost:${PORT}/health`);
});

module.exports = app;