import React, { useRef, useState, useCallback, useEffect } from 'react';
import useVideoThumbnails, { THUMB_WIDTH, THUMB_HEIGHT } from './UseVideoThumbnails';
import useSeekOptimizer from './UseSeekOptimiser';

/**
 * TimelineBar
 *
 * WHAT CHANGED vs previous version:
 *   ✂️  prewarmAt removed from all call sites (was the source of bytes=0-0 spam)
 *   ✅  Everything else identical: thumbnails, buffered regions, fastSeek,
 *       touch support, chapter markers, hover tooltip, drag handle
 */
function TimelineBar({ currentTime, duration, playerRef, proxyUrl, onSeek, chapters = [] }) {
  const barRef       = useRef(null);
  const [hoverPos,   setHoverPos]   = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // prewarmAt intentionally NOT destructured — removed entirely
  const { seekTo, fastSeekTo, bufferedRegions } = useSeekOptimizer(playerRef);

  const { getThumbnail, hintPosition, ready: thumbsReady } =
    useVideoThumbnails(proxyUrl, duration, { interval: 5 });

  // ── Helpers ────────────────────────────────────────────────────────────
  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };

  const posToTime = useCallback((clientX) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  }, [duration]);

  const posToFraction = useCallback((clientX) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  // ── Mouse events ───────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const fraction = posToFraction(e.clientX);
    const time     = fraction * duration;
    setHoverPos(fraction);
    hintPosition(time);     // request thumbnail — no prewarm fetch
    if (isDragging) fastSeekTo(time);
  }, [posToFraction, duration, isDragging, fastSeekTo, hintPosition]);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) setHoverPos(null);
  }, [isDragging]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    fastSeekTo(posToTime(e.clientX));
  }, [posToTime, fastSeekTo]);

  const handleClick = useCallback((e) => {
    if (isDragging) return;
    seekTo(posToTime(e.clientX));
  }, [isDragging, seekTo, posToTime]);

  // ── Touch events ───────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    setIsDragging(true);
    fastSeekTo(posToTime(e.touches[0].clientX));
  }, [posToTime, fastSeekTo]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    const fraction = posToFraction(e.touches[0].clientX);
    setHoverPos(fraction);
    fastSeekTo(fraction * duration);
  }, [posToFraction, duration, fastSeekTo]);

  const handleTouchEnd = useCallback((e) => {
    setIsDragging(false);
    setHoverPos(null);
    seekTo(posToTime(e.changedTouches[0].clientX));
  }, [posToTime, seekTo]);

  // ── Global mouseup so drag release outside bar works ──────────────────
  useEffect(() => {
    if (!isDragging) return;
    const up = (e) => {
      setIsDragging(false);
      setHoverPos(null);
      seekTo(posToTime(e.clientX));
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [isDragging, seekTo, posToTime]);

  // ── Derived values ─────────────────────────────────────────────────────
  const progress  = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hoverTime = hoverPos !== null ? hoverPos * duration : null;
  const thumbnail = hoverTime !== null ? getThumbnail(hoverTime) : null;

  const barWidth    = barRef.current?.offsetWidth ?? 600;
  const tooltipLeft = hoverPos !== null
    ? Math.max(THUMB_WIDTH / 2, Math.min(barWidth - THUMB_WIDTH / 2, hoverPos * barWidth))
    : 0;

  return (
    <div className="timeline-outer">

      {/* Thumbnail tooltip */}
      {hoverTime !== null && (
        <div className="timeline-tooltip" style={{ left: tooltipLeft }}>
          {thumbsReady && thumbnail ? (
            <img
              className="timeline-thumb"
              src={thumbnail}
              width={THUMB_WIDTH}
              height={THUMB_HEIGHT}
              alt={formatTime(hoverTime)}
              draggable={false}
            />
          ) : (
            <div
              className="timeline-thumb timeline-thumb--placeholder"
              style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
            />
          )}
          <span className="timeline-tooltip-time">{formatTime(hoverTime)}</span>
        </div>
      )}

      {/* Bar */}
      <div
        ref={barRef}
        className={`timeline-bar${isDragging ? ' is-dragging' : ''}${hoverPos !== null ? ' is-hovered' : ''}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(currentTime)}
        aria-valuetext={formatTime(currentTime)}
        tabIndex={0}
      >
        <div className="timeline-track">

          {/* Buffered regions */}
          {bufferedRegions.map((region, i) =>
            duration > 0 ? (
              <div
                key={i}
                className="timeline-buffered"
                style={{
                  left:  `${(region.start / duration) * 100}%`,
                  width: `${((region.end - region.start) / duration) * 100}%`,
                }}
              />
            ) : null
          )}

          {/* Hover ghost */}
          {hoverPos !== null && (
            <div className="timeline-hover-ghost" style={{ width: `${hoverPos * 100}%` }} />
          )}

          {/* Progress */}
          <div className="timeline-progress" style={{ width: `${progress}%` }} />

          {/* Chapter markers */}
          {chapters.map((ch) =>
            duration > 0 ? (
              <div
                key={ch.time}
                className="timeline-chapter-marker"
                style={{ left: `${(ch.time / duration) * 100}%` }}
                title={ch.title}
              />
            ) : null
          )}

          {/* Handle */}
          <div
            className="timeline-handle"
            style={{ left: `${progress}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

export default TimelineBar;