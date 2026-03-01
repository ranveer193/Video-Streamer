import React, { useState, useRef, useCallback, useEffect } from 'react';
import AudioTrackSelector from './AudioTrackSelector';
import SubtitleSelector from './SubtitleSelector';
import TimelineBar from './Timelinebar';
import useClickOutside from './UseClickOutside';

const PLAYBACK_RATES    = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HIDE_DELAY_MS     = 3000;
const DOUBLE_TAP_MS     = 300;
const SEEK_ZONE         = 0.3;
const DOUBLE_TAP_SEEK_S = 10;

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// ─── iOS fullscreen helper ────────────────────────────────────────────────────
function requestFullscreenCompat(playerRef) {
  const vjs = playerRef.current;
  if (!vjs || vjs.isDisposed()) return;

  if (vjs.isFullscreen()) {
    vjs.exitFullscreen();
    return;
  }

  try {
    vjs.requestFullscreen();
    return;
  } catch (_) { /* fall through */ }

  // iOS Safari fallback
  const el = vjs.el()?.querySelector('video');
  if (el?.webkitEnterFullscreen) {
    el.webkitEnterFullscreen();
  }
}

function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackRate,
  audioTracks,
  textTracks,
  selectedAudioTrack,
  selectedTextTrack,
  playerRef,
  proxyUrl,
  onPlayPause,
  onSeek,
  onSkip,
  onVolumeChange,
  onPlaybackRateChange,
  onFullscreen,
  onAudioTrackChange,
  onTextTrackChange,
  onChangeUrl,
}) {
  const [showControls,     setShowControls]     = useState(true);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showPlaybackMenu, setShowPlaybackMenu] = useState(false);
  const [skipFeedback,     setSkipFeedback]     = useState(null);

  const hideTimeoutRef  = useRef(null);
  const skipFeedbackRef = useRef([]);
  const isPlayingRef    = useRef(isPlaying);
  const mountedRef      = useRef(true);
  const playbackMenuRef = useRef(null);
  const wrapperRef      = useRef(null);
  const lastTapRef      = useRef({ time: 0, x: 0, y: 0 });

  isPlayingRef.current = isPlaying;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      skipFeedbackRef.current.forEach(clearTimeout);
    };
  }, []);

  const closePlaybackMenu = useCallback(() => setShowPlaybackMenu(false), []);
  useClickOutside(playbackMenuRef, closePlaybackMenu, showPlaybackMenu);

  // ── Controls visibility ───────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && isPlayingRef.current) {
        setShowControls(false);
      }
    }, HIDE_DELAY_MS);
  }, []);

  const showAndScheduleHide = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  // ── Mouse handlers (desktop) ──────────────────────────────────────────
  const handleMouseMove  = useCallback(() => showAndScheduleHide(), [showAndScheduleHide]);
  const handleMouseLeave = useCallback(() => {
    if (isPlayingRef.current) setShowControls(false);
  }, []);

  // ── Skip feedback ─────────────────────────────────────────────────────
  const showSkipFeedback = useCallback((dir) => {
    const id = Date.now();
    setSkipFeedback({ dir, id });
    const t = setTimeout(() => {
      if (mountedRef.current) {
        setSkipFeedback((prev) => prev?.id === id ? null : prev);
      }
    }, 600);
    skipFeedbackRef.current.push(t);
  }, []);

  const handleSkip = useCallback((seconds) => {
    onSkip(seconds);
    showSkipFeedback(seconds > 0 ? 'fwd' : 'back');
  }, [onSkip, showSkipFeedback]);

  // ── Double-tap to seek (mobile) ───────────────────────────────────────
  // This handler lives on the TOUCH CAPTURE LAYER (always pointer-events: auto)
  // so it fires even when the controls overlay is hidden (pointer-events: none).
  const handleTouchStart = useCallback((e) => {
    // Don't interfere with controls bar interactions
    if (e.target.closest('.bottom-controls, .center-controls')) return;

    const now   = Date.now();
    const touch = e.touches[0];
    const last  = lastTapRef.current;
    const rect  = wrapperRef.current?.getBoundingClientRect();

    const isDoubleTap =
      now - last.time < DOUBLE_TAP_MS &&
      Math.abs(touch.clientX - last.x) < 60 &&
      Math.abs(touch.clientY - last.y) < 60;

    if (isDoubleTap && rect) {
      const tapFrac = (touch.clientX - rect.left) / rect.width;

      if (tapFrac < SEEK_ZONE) {
        handleSkip(-DOUBLE_TAP_SEEK_S);
      } else if (tapFrac > 1 - SEEK_ZONE) {
        handleSkip(DOUBLE_TAP_SEEK_S);
      } else {
        requestFullscreenCompat(playerRef);
      }

      lastTapRef.current = { time: 0, x: 0, y: 0 };
    } else {
      // Single tap — show controls regardless of current visibility
      lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
      showAndScheduleHide();
    }
  }, [handleSkip, showAndScheduleHide, playerRef]);

  // ── Playback rate ─────────────────────────────────────────────────────
  const handleRateSelect = useCallback((rate) => {
    onPlaybackRateChange(rate);
    setShowPlaybackMenu(false);
  }, [onPlaybackRateChange]);

  // ── Volume ────────────────────────────────────────────────────────────
  const handleVolumeButtonClick = useCallback(() => {
    if (showVolumeSlider) {
      setShowVolumeSlider(false);
    } else {
      const isTouch = window.matchMedia('(hover: none)').matches;
      if (isTouch) {
        onVolumeChange(volume > 0 ? 0 : 1);
      } else {
        setShowVolumeSlider(true);
      }
    }
  }, [showVolumeSlider, volume, onVolumeChange]);

  return (
    // Outer ref wrapper — used only for getBoundingClientRect in double-tap
    <div ref={wrapperRef} style={{ position: 'absolute', inset: 0, zIndex: 20 }}>

      {/*
        ── TOUCH CAPTURE LAYER ──────────────────────────────────────────
        Always covers the full video area with pointer-events: auto.
        This is the key fix: even when .player-controls has
        pointer-events: none (hidden state), this layer still receives
        taps and restores the controls.
        z-index is below the controls bar (19 vs 20) so buttons still work.
      */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 19,
          WebkitTapHighlightColor: 'transparent',
        }}
        onTouchStart={handleTouchStart}
      />

      {/* ── Controls overlay ── */}
      <div
        className={`player-controls ${showControls ? 'show' : 'hide'}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >

        {skipFeedback && (
          <div key={skipFeedback.id} className={`skip-animation ${skipFeedback.dir}`}>
            {skipFeedback.dir === 'fwd'
              ? `⏩ +${DOUBLE_TAP_SEEK_S}s`
              : `⏪ -${DOUBLE_TAP_SEEK_S}s`}
          </div>
        )}

        {/* ── Center play button ── */}
        <div className="center-controls">
          <button
            className="btn-center-play"
            onClick={(e) => { e.stopPropagation(); onPlayPause(); }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶️'}
          </button>
        </div>

        {/* ── Skip buttons (desktop only) ── */}
        <div className="skip-controls skip-controls--desktop">
          <button
            className="btn-skip btn-skip-back"
            onClick={(e) => { e.stopPropagation(); handleSkip(-10); }}
            aria-label="Skip back 10 seconds"
          >
            <div className="skip-icon">⏪</div>
            <div className="skip-text">10s</div>
          </button>
          <button
            className="btn-skip btn-skip-forward"
            onClick={(e) => { e.stopPropagation(); handleSkip(10); }}
            aria-label="Skip forward 10 seconds"
          >
            <div className="skip-icon">⏩</div>
            <div className="skip-text">10s</div>
          </button>
        </div>

        {/* ── Bottom controls bar ── */}
        <div className="bottom-controls" onClick={(e) => e.stopPropagation()}>

          <TimelineBar
            currentTime={currentTime}
            duration={duration}
            playerRef={playerRef}
            proxyUrl={proxyUrl}
            onSeek={onSeek}
          />

          <div className="controls-bar">
            <div className="controls-left">

              <button
                className="btn-control"
                onClick={onPlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸' : '▶️'}
              </button>

              <button
                className="btn-control"
                onClick={() => handleSkip(-10)}
                aria-label="Skip back 10 seconds"
              >⏪</button>
              <button
                className="btn-control"
                onClick={() => handleSkip(10)}
                aria-label="Skip forward 10 seconds"
              >⏩</button>

              <div
                className="volume-control"
                onMouseEnter={() => {
                  const isTouch = window.matchMedia('(hover: none)').matches;
                  if (!isTouch) setShowVolumeSlider(true);
                }}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <button
                  className="btn-control"
                  onClick={handleVolumeButtonClick}
                  aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                >
                  {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                </button>
                {showVolumeSlider && (
                  <div className="volume-slider-container">
                    <input
                      type="range"
                      min="0" max="1" step="0.01"
                      value={volume}
                      onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                      className="volume-slider"
                      aria-label="Volume"
                    />
                  </div>
                )}
              </div>

              <div className="time-display">
                <span className="time-current">{formatTime(currentTime)}</span>
                <span className="time-separator">/</span>
                <span className="time-total">{formatTime(duration)}</span>
              </div>
            </div>

            <div className="controls-right">
              {audioTracks.length > 1 && (
                <AudioTrackSelector
                  tracks={audioTracks}
                  selectedTrack={selectedAudioTrack}
                  onTrackChange={onAudioTrackChange}
                />
              )}
              {textTracks.length > 0 && (
                <SubtitleSelector
                  tracks={textTracks}
                  selectedTrack={selectedTextTrack}
                  onTrackChange={onTextTrackChange}
                />
              )}

              <div className="playback-rate-control" ref={playbackMenuRef}>
                <button
                  className="btn-control"
                  onClick={() => setShowPlaybackMenu((p) => !p)}
                  aria-haspopup="listbox"
                  aria-expanded={showPlaybackMenu}
                  aria-label="Playback speed"
                >
                  ⚡ {playbackRate}x
                </button>
                {showPlaybackMenu && (
                  <div className="playback-rate-menu" role="listbox">
                    {PLAYBACK_RATES.map((rate) => (
                      <button
                        key={rate}
                        role="option"
                        aria-selected={playbackRate === rate}
                        className={`menu-item${playbackRate === rate ? ' active' : ''}`}
                        onClick={() => handleRateSelect(rate)}
                      >
                        {rate}x {rate === 1 && '(Normal)'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="btn-control"
                onClick={onChangeUrl}
                aria-label="Change URL"
                title="Change video URL"
              >🔗</button>

              <button
                className="btn-control"
                onClick={() => requestFullscreenCompat(playerRef)}
                aria-label="Fullscreen"
                title="Fullscreen"
              >⛶</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayerControls;