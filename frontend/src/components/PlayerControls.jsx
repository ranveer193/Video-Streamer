import React, { useState, useRef, useCallback, useEffect } from 'react';
import AudioTrackSelector from './AudioTrackSelector';
import SubtitleSelector from './SubtitleSelector';
import QualitySelector from './QualitySelector';
import TimelineBar from './Timelinebar';
import useClickOutside from './UseClickOutside';

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HIDE_DELAY_MS  = 3000;

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackRate,
  audioTracks,
  textTracks,
  qualitySources,   // kept in props signature so VideoPlayer doesn't need changing,
                    // but QualitySelector is self-contained and doesn't consume it
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
  onQualityChange,
  onChangeUrl,
}) {
  const [showControls,     setShowControls]     = useState(true);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showPlaybackMenu, setShowPlaybackMenu] = useState(false);
  const [skipFeedback,     setSkipFeedback]     = useState(null);

  const hideTimeoutRef  = useRef(null);
  const isPlayingRef    = useRef(isPlaying);
  const playbackMenuRef = useRef(null);

  isPlayingRef.current = isPlaying;

  useEffect(() => () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  }, []);

  const closePlaybackMenu = useCallback(() => setShowPlaybackMenu(false), []);
  useClickOutside(playbackMenuRef, closePlaybackMenu, showPlaybackMenu);

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) setShowControls(false);
    }, HIDE_DELAY_MS);
  }, []);

  const handleMouseMove   = useCallback(() => { setShowControls(true); scheduleHide(); }, [scheduleHide]);
  const handleMouseLeave  = useCallback(() => { if (isPlayingRef.current) setShowControls(false); }, []);
  const handleDoubleClick = useCallback(() => onFullscreen(), [onFullscreen]);

  const handleSkip = useCallback((seconds) => {
    onSkip(seconds);
    const id = Date.now();
    setSkipFeedback({ dir: seconds > 0 ? 'fwd' : 'back', id });
    setTimeout(() => setSkipFeedback((prev) => prev?.id === id ? null : prev), 600);
  }, [onSkip]);

  const handleRateSelect = useCallback((rate) => {
    onPlaybackRateChange(rate);
    setShowPlaybackMenu(false);
  }, [onPlaybackRateChange]);

  return (
    <div
      className={`player-controls ${showControls ? 'show' : 'hide'}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
    >
      {/* Center play overlay */}
      <div className="center-controls">
        <button
          className="btn-center-play"
          onClick={(e) => { e.stopPropagation(); onPlayPause(); }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶️'}
        </button>
      </div>

      {/* Skip overlay */}
      <div className="skip-controls">
        <button className="btn-skip btn-skip-back"    onClick={(e) => { e.stopPropagation(); handleSkip(-10); }} aria-label="Skip back 10 seconds">
          <div className="skip-icon">⏪</div><div className="skip-text">10s</div>
        </button>
        <button className="btn-skip btn-skip-forward" onClick={(e) => { e.stopPropagation(); handleSkip(10);  }} aria-label="Skip forward 10 seconds">
          <div className="skip-icon">⏩</div><div className="skip-text">10s</div>
        </button>
      </div>

      {skipFeedback && (
        <div key={skipFeedback.id} className={`skip-animation ${skipFeedback.dir}`}>
          {skipFeedback.dir === 'fwd' ? '⏩ +10s' : '⏪ -10s'}
        </div>
      )}

      {/* Bottom */}
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
            <button className="btn-control" onClick={onPlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '⏸' : '▶️'}
            </button>
            <button className="btn-control" onClick={() => handleSkip(-10)} aria-label="Skip back 10 seconds">⏪</button>
            <button className="btn-control" onClick={() => handleSkip(10)}  aria-label="Skip forward 10 seconds">⏩</button>

            <div className="volume-control" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}>
              <button className="btn-control" onClick={() => onVolumeChange(volume > 0 ? 0 : 1)} aria-label={volume === 0 ? 'Unmute' : 'Mute'}>
                {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </button>
              {showVolumeSlider && (
                <div className="volume-slider-container">
                  <input type="range" min="0" max="1" step="0.01" value={volume}
                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                    className="volume-slider" aria-label="Volume" />
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

            {/*
              FIX: QualitySelector is ALWAYS rendered.
              The old guard `qualitySources?.length > 0` was wrong because
              QualitySelector is fully self-contained — it runs useAdaptiveQuality
              internally and never reads `qualitySources`. Gating on an array that
              is often empty (or unused by this component) silently suppressed the
              entire quality UI.

              The dead `sources={qualitySources}` prop has also been removed; it
              was accepted by no prop in QualitySelector and gave a false impression
              that external source data was required to render the control.
            */}
            <QualitySelector onQualityChange={onQualityChange} />

            <div className="playback-rate-control" ref={playbackMenuRef}>
              <button className="btn-control" onClick={() => setShowPlaybackMenu((p) => !p)}
                aria-haspopup="listbox" aria-expanded={showPlaybackMenu} aria-label="Playback speed">
                ⚡ {playbackRate}x
              </button>
              {showPlaybackMenu && (
                <div className="playback-rate-menu" role="listbox">
                  {PLAYBACK_RATES.map((rate) => (
                    <button key={rate} role="option" aria-selected={playbackRate === rate}
                      className={`menu-item${playbackRate === rate ? ' active' : ''}`}
                      onClick={() => handleRateSelect(rate)}>
                      {rate}x {rate === 1 && '(Normal)'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button className="btn-control" onClick={onChangeUrl} aria-label="Change URL" title="Change video URL">🔗</button>
            <button className="btn-control" onClick={onFullscreen} aria-label="Fullscreen" title="Fullscreen (or double-click)">⛶</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayerControls;