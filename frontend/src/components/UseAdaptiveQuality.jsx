import { useState, useEffect, useRef, useCallback } from 'react';

const PROXY_URL = process.env.REACT_APP_PROXY_URL || 'http://localhost:3001';

/**
 * Quality level definitions.
 * These are the levels the server supports (server.js QUALITY_PRESETS).
 * minMbps = minimum download speed required to stream comfortably.
 */
export const QUALITY_LEVELS = [
  { quality: '1080', label: '1080p',        badge: 'HD',  minMbps: 5.0,  description: 'Full HD' },
  { quality: '720',  label: '720p',         badge: 'HD',  minMbps: 3.0,  description: 'HD' },
  { quality: '480',  label: '480p',         badge: 'SD',  minMbps: 1.5,  description: 'Standard' },
  { quality: '360',  label: '360p',         badge: null,  minMbps: 0.8,  description: 'Low' },
  { quality: '240',  label: '240p',         badge: null,  minMbps: 0.4,  description: 'Mobile' },
  { quality: 'original', label: 'Original', badge: null,  minMbps: 0,    description: 'Source quality' },
];

/**
 * useAdaptiveQuality
 *
 * Detects current network speed and returns:
 *  - detectedMbps   : measured download speed in Mbps
 *  - suggestedQuality: quality string we recommend based on speed
 *  - networkType    : 'fast' | 'medium' | 'slow' | 'unknown'
 *  - isDetecting    : true while the speed probe is in flight
 *  - redetect()     : manually re-run speed detection
 *
 * Detection strategy (two-tier):
 *  1. navigator.connection API (instant, but not in Safari/Firefox)
 *  2. Timing probe: fetches one byte from the proxy and measures throughput
 *     — fires once on mount, not on every render
 */
function useAdaptiveQuality() {
  const [detectedMbps,    setDetectedMbps]    = useState(null);
  const [suggestedQuality, setSuggestedQuality] = useState('720');
  const [networkType,     setNetworkType]     = useState('unknown');
  const [isDetecting,     setIsDetecting]     = useState(false);
  const abortRef = useRef(null);

  const detectSpeed = useCallback(async () => {
    setIsDetecting(true);

    // ── Tier 1: navigator.connection (Chrome/Edge only) ──────────────
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn?.downlink && conn.downlink > 0) {
      const mbps = conn.downlink; // already in Mbps
      applyMbps(mbps);
      setIsDetecting(false);
      return;
    }

    // ── Tier 2: timing probe via proxy health endpoint ────────────────
    // We fetch the health endpoint (tiny JSON) and measure byte rate.
    // It's not super precise but gives a reliable order-of-magnitude.
    try {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const PROBE_URL = `${PROXY_URL}/health?_=${Date.now()}`;
      const PROBE_REPS = 3; // average over 3 fetches for stability

      let totalBytes = 0;
      let totalMs    = 0;

      for (let i = 0; i < PROBE_REPS; i++) {
        const t0  = performance.now();
        const res = await fetch(PROBE_URL, {
          cache:  'no-store',
          signal: abortRef.current.signal,
        });
        const text = await res.text();
        const ms   = performance.now() - t0;
        totalBytes += new TextEncoder().encode(text).length;
        totalMs    += ms;
      }

      const avgMs    = totalMs / PROBE_REPS;
      const bitsPS   = (totalBytes * 8) / (avgMs / 1000);
      const mbps     = bitsPS / 1_000_000;

      applyMbps(mbps);
    } catch (e) {
      if (e.name === 'AbortError') return;
      // Probe failed — default to safe mid-range quality
      setSuggestedQuality('480');
      setNetworkType('unknown');
    } finally {
      setIsDetecting(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyMbps(mbps) {
    setDetectedMbps(parseFloat(mbps.toFixed(2)));

    // Find the highest quality whose minMbps we exceed with a 20% headroom
    const headroomMbps = mbps * 0.8;
    const best = QUALITY_LEVELS
      .filter((l) => l.quality !== 'original') // exclude passthrough from auto
      .find((l) => headroomMbps >= l.minMbps);

    setSuggestedQuality(best?.quality ?? '240');

    if      (mbps >= 5)   setNetworkType('fast');
    else if (mbps >= 1.5) setNetworkType('medium');
    else                  setNetworkType('slow');
  }

  // Run once on mount
  useEffect(() => {
    detectSpeed();

    // Also listen for connection changes (Chrome fires this when WiFi drops)
    const conn = navigator.connection;
    if (conn) conn.addEventListener('change', detectSpeed);

    return () => {
      if (conn) conn.removeEventListener('change', detectSpeed);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [detectSpeed]);

  return {
    detectedMbps,
    suggestedQuality,
    networkType,
    isDetecting,
    redetect: detectSpeed,
  };
}

export default useAdaptiveQuality;