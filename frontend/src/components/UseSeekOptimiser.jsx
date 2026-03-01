import { useRef, useCallback, useEffect, useState } from 'react';

const PREFETCH_CHUNK_BYTES       = 1.5 * 1024 * 1024;
const HOVER_PREFETCH_DEBOUNCE_MS = 140;
const PREFETCH_DEDUPE_WINDOW_S   = 4;
const DRAG_THROTTLE_MS           = 80;
const MAX_CONCURRENT_PREFETCHES  = 2;

function useSeekOptimizer(playerRef, proxyUrl, duration) {
  const lastDragSeekRef  = useRef(0);
  const contentLengthRef = useRef(null);
  const prefetchedRef    = useRef([]);
  const inflightRef      = useRef([]);
  const hoverDebounceRef = useRef(null);
  const mountedRef       = useRef(true);

  const [bufferedRegions, setBufferedRegions] = useState([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inflightRef.current.forEach((c) => c.abort());
      if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
    };
  }, []);

  // ── HEAD request to get Content-Length ───────────────────────────────
  // Server now handles HEAD /stream and CORS exposes Content-Length,
  // so this actually resolves in production (was dead code before both fixes).
  useEffect(() => {
    if (!proxyUrl) return;

    contentLengthRef.current = null;
    prefetchedRef.current    = [];
    inflightRef.current.forEach((c) => c.abort());
    inflightRef.current = [];

    const ctrl = new AbortController();

    fetch(proxyUrl, { method: 'HEAD', signal: ctrl.signal })
      .then((res) => {
        const cl = res.headers.get('content-length');
        if (cl && mountedRef.current) {
          contentLengthRef.current = parseInt(cl, 10);
        }
      })
      .catch(() => { /* prefetch simply won't run if HEAD fails */ });

    return () => ctrl.abort();
  }, [proxyUrl]);

  // ── Buffer tracking via native VJS events (replaces rAF polling) ─────
  // 'progress' fires exactly when browser buffer changes — zero polling cost.
  // 'seeked'   fires when seek completes and buffer view may shift.
  useEffect(() => {
    if (!playerRef.current) return;

    const updateBuffered = () => {
      const vjs = playerRef.current;
      if (!vjs || vjs.isDisposed()) return;
      const el = vjs.el()?.querySelector('video');
      if (!el) return;

      const buf     = el.buffered;
      const regions = [];
      for (let i = 0; i < buf.length; i++) {
        regions.push({ start: buf.start(i), end: buf.end(i) });
      }

      setBufferedRegions((prev) => {
        if (
          prev.length === regions.length &&
          prev.every((r, i) =>
            Math.abs(r.start - regions[i].start) < 0.5 &&
            Math.abs(r.end   - regions[i].end)   < 0.5
          )
        ) return prev;
        return regions;
      });
    };

    const vjs = playerRef.current;
    if (!vjs || vjs.isDisposed()) return;

    vjs.on('progress', updateBuffered);
    vjs.on('seeked',   updateBuffered);

    return () => {
      if (!vjs.isDisposed()) {
        vjs.off('progress', updateBuffered);
        vjs.off('seeked',   updateBuffered);
      }
    };
  }, [playerRef]);

  // ── Core prefetch ─────────────────────────────────────────────────────
  const firePrefetch = useCallback((time) => {
    const cl = contentLengthRef.current;
    if (!cl || !proxyUrl || !duration || duration <= 0) return;

    const ratio     = Math.max(0, Math.min(1, time / duration));
    const midByte   = Math.floor(ratio * cl);
    const halfChunk = Math.floor(PREFETCH_CHUNK_BYTES / 2);
    const startByte = Math.max(0, midByte - halfChunk);
    const endByte   = Math.min(cl - 1, midByte + halfChunk);

    const alreadyCovered = prefetchedRef.current.some(
      (w) => w.start <= startByte && w.end >= endByte
    );
    if (alreadyCovered) return;

    if (inflightRef.current.length >= MAX_CONCURRENT_PREFETCHES) {
      inflightRef.current.shift().abort();
    }

    const ctrl = new AbortController();
    inflightRef.current.push(ctrl);

    fetch(proxyUrl, {
      headers: { Range: `bytes=${startByte}-${endByte}` },
      signal:  ctrl.signal,
    })
      .then((res) => {
        if (!mountedRef.current) return;
        if (res.ok || res.status === 206) {
          prefetchedRef.current.push({ start: startByte, end: endByte });
          if (prefetchedRef.current.length > 60) {
            prefetchedRef.current = prefetchedRef.current.slice(-60);
          }
          // FIX (Issue 7): res.blob() buffers the entire 1.5 MB chunk in the
          // JS heap as an ArrayBuffer. The goal is just to drain the body so
          // the browser's HTTP cache stores it — res.body.cancel() signals
          // the stream to stop without allocating any memory in JS-land.
          return res.body?.cancel();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!mountedRef.current) return;
        inflightRef.current = inflightRef.current.filter((c) => c !== ctrl);
      });
  }, [proxyUrl, duration]);

  const hintPosition = useCallback((time) => {
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
    hoverDebounceRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      const cl = contentLengthRef.current;
      if (!cl || !duration) return;

      const ratio     = time / duration;
      const midByte   = Math.floor(ratio * cl);
      const halfChunk = Math.floor(PREFETCH_CHUNK_BYTES / 2);
      const startByte = Math.max(0, midByte - halfChunk);
      const endByte   = Math.min(cl - 1, midByte + halfChunk);

      const nearbyAlreadyFetched = prefetchedRef.current.some((w) => {
        const wMid           = (w.start + w.end) / 2;
        const newMid         = (startByte + endByte) / 2;
        const bytesPerSecond = cl / duration;
        return Math.abs(wMid - newMid) < bytesPerSecond * PREFETCH_DEDUPE_WINDOW_S;
      });

      if (!nearbyAlreadyFetched) firePrefetch(time);
    }, HOVER_PREFETCH_DEBOUNCE_MS);
  }, [firePrefetch, duration]);

  const seekTo = useCallback((time) => {
    const vjs = playerRef.current;
    if (!vjs || vjs.isDisposed()) return;
    vjs.currentTime(time);
  }, [playerRef]);

  const fastSeekTo = useCallback((time) => {
    const vjs = playerRef.current;
    if (!vjs || vjs.isDisposed()) return;
    const now = Date.now();
    if (now - lastDragSeekRef.current < DRAG_THROTTLE_MS) return;
    lastDragSeekRef.current = now;
    const el = vjs.el()?.querySelector('video');
    if (!el) return;
    if (typeof el.fastSeek === 'function') el.fastSeek(time);
    else el.currentTime = time;
  }, [playerRef]);

  return { seekTo, fastSeekTo, hintPosition, bufferedRegions };
}

export default useSeekOptimizer;