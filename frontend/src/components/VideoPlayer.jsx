import React, { useEffect, useRef, useState, useCallback } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import PlayerControls from './PlayerControls';

const PROXY_BASE        = process.env.REACT_APP_PROXY_URL || 'http://localhost:3001';
const RESUME_INTERVAL_S = 5;

function getProxyUrl(videoUrl) {
  return `${PROXY_BASE}/stream?url=${encodeURIComponent(videoUrl)}`;
}

// Stable key always uses the original videoUrl — not the proxy URL.
// Previously the key was written with vjsPlayer.currentSrc() (the proxy URL)
// but read with videoUrl (the original), so resume never matched.
function getResumeKey(videoUrl) {
  return `playback_${videoUrl}`;
}

// FIX (Issue 8): wrap ALL localStorage access in try-catch.
// Safari in ITP / private mode and some locked-down WebViews throw
// SecurityError on both getItem and setItem, not just setItem.
function resumeGet(key) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}
function resumeSet(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* quota or locked storage — silent */ }
}

function VideoPlayer({ videoUrl, onError, onChangeUrl }) {
  const containerRef  = useRef(null);
  const playerRef     = useRef(null);
  const lastSavedRef  = useRef(0);   // tracks last saved time to write exactly once per interval
  const [player,      setPlayer]      = useState(null);
  const [proxyUrl,    setProxyUrl]    = useState('');

  const [isLoading,          setIsLoading]          = useState(true);
  const [currentTime,        setCurrentTime]        = useState(0);
  const [duration,           setDuration]           = useState(0);
  const [isPlaying,          setIsPlaying]          = useState(false);
  const [volume,             setVolume]             = useState(1);
  const [playbackRate,       setPlaybackRate]       = useState(1);
  const [audioTracks,        setAudioTracks]        = useState([]);
  const [textTracks,         setTextTracks]         = useState([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);
  const [selectedTextTrack,  setSelectedTextTrack]  = useState(-1);

  // Stable refs for values used inside VJS event handlers so closures
  // always read current values without needing to re-register listeners.
  const onErrorRef  = useRef(onError);
  const videoUrlRef = useRef(videoUrl);
  useEffect(() => { onErrorRef.current  = onError;   }, [onError]);
  useEffect(() => { videoUrlRef.current = videoUrl;  }, [videoUrl]);

  // ── Init — runs once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || playerRef.current) return;

    const videoElement = document.createElement('video');
    videoElement.className = 'video-js vjs-big-play-centered';
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('crossorigin', 'anonymous');
    containerRef.current.appendChild(videoElement);

    const vjsPlayer = videojs(videoElement, {
      controls:      false,
      autoplay:      false,
      // preload:'metadata' — fetch only duration/dimensions on load.
      // 'auto' would immediately trigger 30-50 range requests for a 2 GB file.
      preload:       'metadata',
      fluid:         true,
      responsive:    true,
      aspectRatio:   '16:9',
      playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      html5: {
        vhs: {
          overrideNative:           true,
          enableLowInitialPlaylist: true,
          smoothQualityChange:      true,
        },
        nativeVideoTracks: false,
        nativeAudioTracks: false,
        nativeTextTracks:  false,
      },
    });

    playerRef.current = vjsPlayer;
    setPlayer(vjsPlayer);

    vjsPlayer.on('loadedmetadata', () => {
      setDuration(vjsPlayer.duration());

      const atl = vjsPlayer.audioTracks();
      if (atl?.length > 0) {
        const tracks = [];
        for (let i = 0; i < atl.length; i++) {
          tracks.push({
            id:       atl[i].id,
            label:    atl[i].label    || `Audio ${i + 1}`,
            language: atl[i].language || '',
            enabled:  atl[i].enabled,
          });
        }
        setAudioTracks(tracks);
      }

      const ttl = vjsPlayer.textTracks();
      if (ttl?.length > 0) {
        const tracks = [];
        for (let i = 0; i < ttl.length; i++) {
          const t = ttl[i];
          if (t.kind === 'subtitles' || t.kind === 'captions') {
            tracks.push({
              id:       i,
              label:    t.label    || `Subtitle ${i + 1}`,
              language: t.language || '',
              kind:     t.kind,
            });
          }
        }
        setTextTracks(tracks);
      }
    });

    vjsPlayer.on('canplay',      () => setIsLoading(false));
    vjsPlayer.on('waiting',      () => setIsLoading(true));
    vjsPlayer.on('playing',      () => { setIsLoading(false); setIsPlaying(true); });
    vjsPlayer.on('pause',        () => setIsPlaying(false));
    vjsPlayer.on('volumechange', () => setVolume(vjsPlayer.volume()));
    vjsPlayer.on('ratechange',   () => setPlaybackRate(vjsPlayer.playbackRate()));

    vjsPlayer.on('timeupdate', () => {
      const time = vjsPlayer.currentTime();
      setCurrentTime(time);

      // Write resume position at most once per RESUME_INTERVAL_S.
      // Previously: Math.floor(time) % 5 === 0 fired up to 10 times per
      // checkpoint because timeupdate runs 4-8 times/sec and the condition
      // stays true for the entire second window (5.0, 5.1, 5.2 ... 5.9).
      if (time - lastSavedRef.current >= RESUME_INTERVAL_S) {
        lastSavedRef.current = time;
        resumeSet(getResumeKey(videoUrlRef.current), String(time));
      }
    });

    vjsPlayer.on('error', () => {
      const error = vjsPlayer.error();
      let msg = { title: 'Playback Error',       message: 'Failed to load video.' };
      if (error?.code === 2) msg = { title: 'Network Error',        message: 'Failed to fetch from proxy. URL may have expired.' };
      if (error?.code === 4) msg = { title: 'Format Not Supported', message: 'This video format is not supported.' };
      setIsLoading(false);
      onErrorRef.current(msg);
    });

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
      }
      playerRef.current = null;
      setPlayer(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Source update ─────────────────────────────────────────────────────
  useEffect(() => {
    const vjs = playerRef.current;
    if (!vjs || vjs.isDisposed() || !videoUrl) return;

    const url = getProxyUrl(videoUrl);
    setProxyUrl(url);
    setIsLoading(true);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);     // reset play state so UI doesn't show "pause" while loading
    setAudioTracks([]);
    setTextTracks([]);
    setSelectedAudioTrack(0);
    setSelectedTextTrack(-1);
    lastSavedRef.current = 0; // reset save pointer for the new video

    vjs.src({ src: url, type: 'video/mp4' });

    // FIX (Issue 8): use safe resumeGet wrapper — can throw in Safari ITP
    const stored = resumeGet(getResumeKey(videoUrl));
    if (stored) {
      vjs.one('loadedmetadata', () => {
        if (!vjs.isDisposed()) vjs.currentTime(parseFloat(stored));
      });
    }
  }, [videoUrl]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    const vjs = playerRef.current;
    if (!vjs || vjs.isDisposed()) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case ' ': case 'k': e.preventDefault(); vjs.paused() ? vjs.play() : vjs.pause(); break;
      case 'ArrowLeft':   e.preventDefault(); vjs.currentTime(Math.max(0, vjs.currentTime() - 10)); break;
      case 'ArrowRight':  e.preventDefault(); vjs.currentTime(Math.min(vjs.duration(), vjs.currentTime() + 10)); break;
      case 'ArrowUp':     e.preventDefault(); vjs.volume(Math.min(1, vjs.volume() + 0.1)); break;
      case 'ArrowDown':   e.preventDefault(); vjs.volume(Math.max(0, vjs.volume() - 0.1)); break;
      case 'f':           e.preventDefault(); vjs.isFullscreen() ? vjs.exitFullscreen() : vjs.requestFullscreen(); break;
      case 'm':           e.preventDefault(); vjs.muted(!vjs.muted()); break;
      default: break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handlePlayPause          = useCallback(() => { const v = playerRef.current; if (!v) return; v.paused() ? v.play() : v.pause(); }, []);
  const handleSeek               = useCallback((t) => playerRef.current?.currentTime(t), []);
  const handleSkip               = useCallback((s) => { const v = playerRef.current; if (!v) return; v.currentTime(Math.max(0, Math.min(v.duration(), v.currentTime() + s))); }, []);
  const handleVolumeChange       = useCallback((vol) => playerRef.current?.volume(vol), []);
  const handlePlaybackRateChange = useCallback((r)   => playerRef.current?.playbackRate(r), []);
  const handleFullscreen         = useCallback(() => { const v = playerRef.current; if (!v) return; v.isFullscreen() ? v.exitFullscreen() : v.requestFullscreen(); }, []);

  const handleAudioTrackChange = useCallback((idx) => {
    const vjs = playerRef.current; if (!vjs) return;
    const atl = vjs.audioTracks();
    for (let i = 0; i < atl.length; i++) atl[i].enabled = i === idx;
    setSelectedAudioTrack(idx);
  }, []);

  const handleTextTrackChange = useCallback((idx) => {
    const vjs = playerRef.current; if (!vjs) return;
    const ttl = vjs.textTracks();
    for (let i = 0; i < ttl.length; i++) ttl[i].mode = i === idx ? 'showing' : 'disabled';
    setSelectedTextTrack(idx);
  }, []);

  return (
    <div className="video-player-container">
      <div className="video-wrapper">
        <div ref={containerRef} />

        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>Loading video...</p>
          </div>
        )}

        {player && (
          <PlayerControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            playbackRate={playbackRate}
            audioTracks={audioTracks}
            textTracks={textTracks}
            selectedAudioTrack={selectedAudioTrack}
            selectedTextTrack={selectedTextTrack}
            playerRef={playerRef}
            proxyUrl={proxyUrl}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onSkip={handleSkip}
            onVolumeChange={handleVolumeChange}
            onPlaybackRateChange={handlePlaybackRateChange}
            onFullscreen={handleFullscreen}
            onAudioTrackChange={handleAudioTrackChange}
            onTextTrackChange={handleTextTrackChange}
            onChangeUrl={onChangeUrl}
          />
        )}
      </div>
    </div>
  );
}

export default VideoPlayer;