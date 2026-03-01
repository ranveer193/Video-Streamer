import { useRef, useCallback, useEffect, useState } from 'react';

const DRAG_THROTTLE_MS = 80; // max seek rate during drag

/**
 * useSeekOptimizer
 *
 * WHAT CHANGED vs previous version:
 *   ✂️  REMOVED prewarmAt entirely.
 *       The prewarm was sending Range: bytes=0-0 to the proxy on every mouse
 *       move. Because the proxy relays that to the CDN synchronously within a
 *       30s express timeout, and the CDN for a large file (8 GB!) takes time
 *       even for a 1-byte range response, every hover position was generating
 *       a 504 and filling the console with "bytes 0-0" spam.
 *       The fetch also wasn't actually helping — browsers don't cache partial
 *       range responses across requests with different Range headers, so the
 *       "warmed" byte was useless when the video later sought to a different
 *       offset.
 *
 *   ✅  KEPT fastSeek() during drag  — snaps to nearest keyframe instantly
 *   ✅  KEPT throttled drag at 80ms  — prevents seek flood during scrub
 *   ✅  KEPT precise currentTime= on mouseup — corrects to exact position
 *   ✅  KEPT buffered region polling — grey fill on timeline
 *
 * @param {React.MutableRefObject} playerRef  ref to Video.js instance
 * @returns {{ seekTo, fastSeekTo, bufferedRegions }}
 */
function useSeekOptimizer(playerRef) {
  const lastDragSeekRef  = useRef(0);
  const [bufferedRegions, setBufferedRegions] = useState([]);

  // ── Poll buffered ranges every 2 s via rAF ────────────────────────────
  useEffect(() => {
    let raf;
    let lastPoll = 0;

    const poll = (now) => {
      raf = requestAnimationFrame(poll);
      if (now - lastPoll < 2000) return;
      lastPoll = now;

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
        // Shallow-compare to avoid unnecessary re-renders
        if (prev.length === regions.length &&
            prev.every((r, i) =>
              Math.abs(r.start - regions[i].start) < 0.5 &&
              Math.abs(r.end   - regions[i].end)   < 0.5
            )) return prev;
        return regions;
      });
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [playerRef]);

  // ── Precise seek — used for click / mouseup ───────────────────────────
  const seekTo = useCallback((time) => {
    const vjs = playerRef.current;
    if (!vjs || vjs.isDisposed()) return;
    vjs.currentTime(time);
  }, [playerRef]);

  // ── Fast seek — used during drag ──────────────────────────────────────
  // fastSeek() snaps to nearest keyframe; imperceptibly imprecise but instant.
  // Falls back to currentTime= on browsers that don't support it (Chrome).
  // Throttled so we never send more than ~12 seeks/second during a fast drag.
  const fastSeekTo = useCallback((time) => {
    const vjs = playerRef.current;
    if (!vjs || vjs.isDisposed()) return;

    const now = Date.now();
    if (now - lastDragSeekRef.current < DRAG_THROTTLE_MS) return;
    lastDragSeekRef.current = now;

    const el = vjs.el()?.querySelector('video');
    if (!el) return;

    if (typeof el.fastSeek === 'function') {
      el.fastSeek(time);
    } else {
      el.currentTime = time;
    }
  }, [playerRef]);

  return { seekTo, fastSeekTo, bufferedRegions };
}

export default useSeekOptimizer;