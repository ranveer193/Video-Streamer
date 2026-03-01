import { useEffect, useRef, useCallback, useState } from 'react';

export const THUMB_WIDTH  = 160;
export const THUMB_HEIGHT = 90;

const MAX_CACHE      = 150;   // LRU cap
const SEEK_TIMEOUT_MS = 8000; // give up on a seek after 8 s (large files are slow)
const CONCURRENT_MAX  = 1;    // one seek at a time — seeking is not parallelisable

/**
 * useVideoThumbnails
 *
 * WHAT CHANGED vs previous version:
 *
 *  ✅  SEEK TIMEOUT — each captureFrame() now races a 8 s timeout against the
 *      'seeked' event. For a large file (8 GB) the hidden video sometimes
 *      hangs waiting for the CDN to deliver the right byte range. Without a
 *      timeout the queue would permanently stall on the first failed seek.
 *
 *  ✅  PER-SEEK ABORT — each seek listener is registered with { once: true }
 *      and cleaned up in the timeout branch, preventing ghost listeners
 *      piling up when seeks time out.
 *
 *  ✅  CANVAS TAINT GUARD — drawImage is wrapped in try/catch. If the video
 *      element becomes tainted (cross-origin policy tightened mid-session)
 *      we silently skip that frame instead of crashing the whole queue.
 *
 *  ✅  BACKGROUND QUEUE RATE-LIMIT — background fill inserts one frame at a
 *      time with requestIdleCallback (or a 200 ms setTimeout fallback) so
 *      thumbnail generation never competes with main-video playback for CPU.
 *
 *  ✅  QUEUE DEDUP — hintPosition and background fill both check the queue
 *      before inserting, so rapid hover movement can't bloat the queue.
 *
 * @param {string} proxyUrl  Full proxy URL for the video (the main stream URL)
 * @param {number} duration  Video duration in seconds (0 until metadata loads)
 * @param {object} opts
 * @param {number} [opts.interval=5]  Seconds between background thumbnails
 */
function useVideoThumbnails(proxyUrl, duration, { interval = 5 } = {}) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const ctxRef     = useRef(null);
  const cacheRef   = useRef(new Map());      // LRU: rounded-second → dataURL
  const queueRef   = useRef([]);             // pending timestamps (priority first)
  const busyRef    = useRef(false);
  const mountedRef = useRef(true);
  const idleHandle = useRef(null);

  const [ready, setReady] = useState(false);

  // ── Create hidden video + canvas once ────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const video           = document.createElement('video');
    video.muted           = true;
    video.preload         = 'metadata';
    video.crossOrigin     = 'anonymous';
    video.playsInline     = true;
    video.style.cssText   =
      'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;visibility:hidden;';
    document.body.appendChild(video);

    const canvas  = document.createElement('canvas');
    canvas.width  = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;

    videoRef.current  = video;
    canvasRef.current = canvas;
    ctxRef.current    = canvas.getContext('2d', { willReadFrequently: false });

    video.addEventListener('loadedmetadata', () => {
      if (mountedRef.current) setReady(true);
    });

    return () => {
      mountedRef.current = false;
      video.src = '';
      video.load();
      document.body.removeChild(video);
      cacheRef.current.clear();
      queueRef.current = [];
      if (idleHandle.current) cancelIdleOrTimeout(idleHandle.current);
    };
  }, []);

  // ── Update source when proxyUrl changes ──────────────────────────────
  useEffect(() => {
    if (!videoRef.current || !proxyUrl) return;
    setReady(false);
    cacheRef.current.clear();
    queueRef.current = [];
    busyRef.current  = false;
    videoRef.current.src = proxyUrl;
    videoRef.current.load();
  }, [proxyUrl]);

  // ── LRU eviction ─────────────────────────────────────────────────────
  const evict = () => {
    if (cacheRef.current.size <= MAX_CACHE) return;
    const oldest = cacheRef.current.keys().next().value;
    cacheRef.current.delete(oldest);
  };

  // ── Capture one frame — returns dataURL or null on failure/timeout ───
  const captureFrame = useCallback((time) => {
    return new Promise((resolve) => {
      const video  = videoRef.current;
      const ctx    = ctxRef.current;
      const canvas = canvasRef.current;
      if (!video || !ctx) return resolve(null);

      const key = Math.round(time);

      // Cache hit — refresh LRU position and return
      if (cacheRef.current.has(key)) {
        const val = cacheRef.current.get(key);
        cacheRef.current.delete(key);
        cacheRef.current.set(key, val);
        return resolve(val);
      }

      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.removeEventListener('seeked', onSeeked);
        resolve(result);
      };

      const onSeeked = () => {
        try {
          ctx.drawImage(video, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
          cacheRef.current.delete(key);  // ensure LRU re-insert
          cacheRef.current.set(key, dataUrl);
          evict();
          finish(dataUrl);
        } catch {
          // Canvas tainted (CORS) — skip silently
          finish(null);
        }
      };

      // Timeout: don't stall the queue forever on a large file seek
      const timer = setTimeout(() => {
        console.warn(`[thumbnails] seek to ${time.toFixed(1)}s timed out`);
        finish(null);
      }, SEEK_TIMEOUT_MS);

      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = time;
    });
  }, []);

  // ── Process queue — one at a time, yielding between frames ───────────
  const processQueue = useCallback(async () => {
    if (busyRef.current || !ready || !mountedRef.current) return;
    if (queueRef.current.length === 0) return;

    busyRef.current = true;
    const time = queueRef.current.shift();
    await captureFrame(time);
    busyRef.current = false;

    if (!mountedRef.current) return;

    // Yield to the browser between frames so we don't block the main thread
    idleHandle.current = scheduleIdleOrTimeout(() => {
      if (mountedRef.current) processQueue();
    }, 50);
  }, [ready, captureFrame]);

  // ── Schedule background fill once video is ready ─────────────────────
  useEffect(() => {
    if (!ready || duration <= 0) return;

    const positions = [];
    for (let t = 0; t <= duration; t += interval) {
      const key = Math.round(t);
      if (!cacheRef.current.has(key) && !queueRef.current.includes(key)) {
        positions.push(t);
      }
    }

    // Shuffle so coverage spreads evenly rather than always starting at t=0
    positions.sort(() => Math.random() - 0.5);

    // Only queue up to 30 at a time — prevents massive queues on long videos
    queueRef.current.push(...positions.slice(0, 30));
    processQueue();
  }, [ready, duration, interval, processQueue]);

  // ── Public: prioritise a specific position (called on hover) ─────────
  const hintPosition = useCallback((time) => {
    if (!ready || !mountedRef.current) return;
    const key = Math.round(time);
    if (cacheRef.current.has(key)) return;
    if (queueRef.current[0] === key) return; // already at front
    // Remove from anywhere in queue, then unshift to front
    queueRef.current = queueRef.current.filter((t) => Math.round(t) !== key);
    queueRef.current.unshift(time);
    processQueue();
  }, [ready, processQueue]);

  // ── Public: get cached thumbnail ─────────────────────────────────────
  const getThumbnail = useCallback((time) => {
    return cacheRef.current.get(Math.round(time)) ?? null;
  }, []);

  return { getThumbnail, hintPosition, ready };
}

// ── rIC shim (requestIdleCallback not in Safari) ─────────────────────────
function scheduleIdleOrTimeout(fn, fallbackMs) {
  if (typeof requestIdleCallback === 'function') {
    return { type: 'ric', id: requestIdleCallback(fn, { timeout: 500 }) };
  }
  return { type: 'timeout', id: setTimeout(fn, fallbackMs) };
}

function cancelIdleOrTimeout(handle) {
  if (!handle) return;
  if (handle.type === 'ric') cancelIdleCallback(handle.id);
  else clearTimeout(handle.id);
}

export default useVideoThumbnails;