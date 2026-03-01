import React, { useEffect, useRef, useState, useCallback } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import PlayerControls from './PlayerControls';

const PROXY_URL = process.env.REACT_APP_PROXY_URL || 'http://localhost:3001';

function getProxyUrl(url, quality) {
  // FIX 3: When quality is 'original' (or missing), omit the &quality param
  // so the proxy passes the stream through unchanged — matching old behavior.
  const base = `${PROXY_URL}/stream?url=${encodeURIComponent(url)}`;
  return quality && quality !== 'original' ? `${base}&quality=${encodeURIComponent(quality)}` : base;
}

function VideoPlayer({ videoUrl, qualitySources, onError, onChangeUrl }) {
  const containerRef = useRef(null);
  const playerRef    = useRef(null);
  const [player,     setPlayer]     = useState(null);
  const [proxyUrl,   setProxyUrl]   = useState('');

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

  // FIX 1: Default to 'original' instead of null so the source effect is
  // never blocked on mount. The proxy receives no &quality param, preserving
  // the old passthrough behavior until QualitySelector resolves auto-detect.
  const [currentQuality, setCurrentQuality] = useState('original');

  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // ── Init effect (once per mount) ──────────────────────────────────────
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
      preload:       'auto',
      fluid:         true,
      responsive:    true,
      aspectRatio:   '16:9',
      playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      html5: {
        vhs: {
          enableLowInitialPlaylist: true,
          smoothQualityChange:      true,
          overrideNative:           true,
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
          tracks.push({ id: atl[i].id, label: atl[i].label || `Audio ${i + 1}`, language: atl[i].language || '', enabled: atl[i].enabled });
        }
        setAudioTracks(tracks);
      }
      const ttl = vjsPlayer.textTracks();
      if (ttl?.length > 0) {
        const tracks = [];
        for (let i = 0; i < ttl.length; i++) {
          const t = ttl[i];
          if (t.kind === 'subtitles' || t.kind === 'captions') {
            tracks.push({ id: i, label: t.label || `Subtitle ${i + 1}`, language: t.language || '', kind: t.kind });
          }
        }
        setTextTracks(tracks);
      }
    });

    vjsPlayer.on('canplay',     () => setIsLoading(false));
    vjsPlayer.on('waiting',     () => setIsLoading(true));
    vjsPlayer.on('playing',     () => { setIsLoading(false); setIsPlaying(true); });
    vjsPlayer.on('pause',       () => setIsPlaying(false));
    vjsPlayer.on('volumechange',() => setVolume(vjsPlayer.volume()));
    vjsPlayer.on('ratechange',  () => setPlaybackRate(vjsPlayer.playbackRate()));

    vjsPlayer.on('timeupdate', () => {
      const time = vjsPlayer.currentTime();
      setCurrentTime(time);
      if (Math.floor(time) % 5 === 0) {
        localStorage.setItem(`playback_${vjsPlayer.currentSrc()}`, String(time));
      }
    });

    vjsPlayer.on('error', () => {
      const error = vjsPlayer.error();
      let msg = { title: 'Playback Error', message: 'Failed to load video.' };
      if (error?.code === 2) msg = { title: 'Network Error', message: 'Failed to fetch from proxy. URL may have expired.' };
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
  }, []);

  // ── Source update effect ──────────────────────────────────────────────
  useEffect(() => {
    const vjs = playerRef.current;
    if (!vjs || vjs.isDisposed()) return;

    // FIX 2: The old `if (currentQuality === null) return;` guard has been
    // removed. Since currentQuality now initialises to 'original', this
    // effect runs immediately on mount and Video.js receives its first src
    // without waiting for QualitySelector's auto-detect to complete.
    // When auto-detect later calls setCurrentQuality('720') (for example),
    // this effect re-runs and handleQualityChange-style time/play restoration
    // happens naturally via the logic below.

    const url = getProxyUrl(videoUrl, currentQuality); // FIX 3 wired in here
    setProxyUrl(url);
    setIsLoading(true);
    setAudioTracks([]);
    setTextTracks([]);
    setSelectedAudioTrack(0);
    setSelectedTextTrack(-1);

    // Preserve time + play-state across quality switches so there's no flicker.
    // On first load savedTime is 0 / paused — identical to the old behavior.
    const savedTime  = vjs.currentTime() || 0;
    const wasPaused  = vjs.paused();

    vjs.src({ src: url, type: 'video/mp4' });

    // Restore position from localStorage on first load (videoUrl change),
    // or from in-memory savedTime on quality-only switches.
    const stored = localStorage.getItem(`playback_${videoUrl}`);
    vjs.one('loadedmetadata', () => {
      if (currentQuality === 'original' && stored) {
        // First load: honour stored resume position.
        vjs.currentTime(parseFloat(stored));
      } else if (currentQuality !== 'original') {
        // Quality switch: restore the exact position we were at.
        vjs.currentTime(savedTime);
        if (!wasPaused) vjs.play();
      }
    });
  }, [videoUrl, currentQuality]); // re-runs on URL change OR quality change

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  const handleKeyPress = useCallback((e) => {
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
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handlePlayPause          = useCallback(() => { const v = playerRef.current; if (!v) return; v.paused() ? v.play() : v.pause(); }, []);
  const handleSeek               = useCallback((t) => playerRef.current?.currentTime(t), []);
  const handleSkip               = useCallback((s) => { const v = playerRef.current; if (!v) return; v.currentTime(Math.max(0, Math.min(v.duration(), v.currentTime() + s))); }, []);
  const handleVolumeChange       = useCallback((v) => playerRef.current?.volume(v), []);
  const handlePlaybackRateChange = useCallback((r) => playerRef.current?.playbackRate(r), []);
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

  // FIX 4: Quality changes from QualitySelector now call setCurrentQuality,
  // which triggers the unified source effect above — no separate imperative
  // swap needed. Time/play-state restoration is handled there consistently.
  const handleQualityChange = useCallback((quality) => {
    setCurrentQuality(quality);
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
            qualitySources={qualitySources}
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
            onQualityChange={handleQualityChange}
            onChangeUrl={onChangeUrl}
          />
        )}
      </div>
    </div>
  );
}

export default VideoPlayer;