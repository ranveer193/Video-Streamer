import React, { useRef, useState, useCallback, useEffect } from 'react';
import useSeekOptimizer from './UseSeekOptimiser'

function TimelineBar({ currentTime, duration, playerRef, proxyUrl, onSeek, chapters = [] }) {
  const barRef       = useRef(null);
  // FIX (Issue 9): store hoverTime directly instead of a fraction.
  // Previously: hoverPos (fraction) → hoverTime = hoverPos * duration on every render.
  // Now: one value, no derived multiply, no stale fraction when duration changes.
  const [hoverTime,  setHoverTime]  = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const { seekTo, fastSeekTo, hintPosition, bufferedRegions } = useSeekOptimizer(
    playerRef, proxyUrl, duration
  );

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Single getBoundingClientRect() call per event — feeds fraction AND time.
  // Previously two separate callbacks each calling getBoundingClientRect()
  // which forces two layout reads per mousemove/touchmove.
  const clientXToValues = useCallback((clientX) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return { fraction: 0, time: 0 };
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return { fraction, time: fraction * duration };
  }, [duration]);

  // ── Mouse events ───────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const { fraction, time } = clientXToValues(e.clientX);
    setHoverTime(duration > 0 ? time : null);
    hintPosition(time);
    if (isDragging) fastSeekTo(time);
    // Expose fraction only where the CSS hover-ghost needs it
    if (barRef.current) {
      barRef.current.style.setProperty('--hover-frac', String(fraction));
    }
  }, [clientXToValues, duration, isDragging, fastSeekTo, hintPosition]);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) setHoverTime(null);
  }, [isDragging]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    fastSeekTo(clientXToValues(e.clientX).time);
  }, [clientXToValues, fastSeekTo]);

  const handleClick = useCallback((e) => {
    if (isDragging) return;
    seekTo(clientXToValues(e.clientX).time);
  }, [isDragging, seekTo, clientXToValues]);

  // ── Keyboard seek (required for role="slider" accessibility) ──────────
  const handleKeyDown = useCallback((e) => {
    if (!duration) return;
    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); seekTo(Math.max(0, currentTime - 5));        break;
      case 'ArrowRight': e.preventDefault(); seekTo(Math.min(duration, currentTime + 5)); break;
      case 'PageDown':   e.preventDefault(); seekTo(Math.max(0, currentTime - 30));       break;
      case 'PageUp':     e.preventDefault(); seekTo(Math.min(duration, currentTime + 30));break;
      case 'Home':       e.preventDefault(); seekTo(0);                                   break;
      case 'End':        e.preventDefault(); seekTo(duration);                            break;
      default: break;
    }
  }, [duration, currentTime, seekTo]);

  // ── Touch events ───────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    setIsDragging(true);
    fastSeekTo(clientXToValues(e.touches[0].clientX).time);
  }, [clientXToValues, fastSeekTo]);

  const handleTouchMove = useCallback((e) => {
    // Note: actual preventDefault() is applied in the native listener below
    // because React 17+ touch listeners are passive and ignore it.
    const { fraction, time } = clientXToValues(e.touches[0].clientX);
    setHoverTime(duration > 0 ? time : null);
    fastSeekTo(time);
    if (barRef.current) {
      barRef.current.style.setProperty('--hover-frac', String(fraction));
    }
  }, [clientXToValues, duration, fastSeekTo]);

  const handleTouchEnd = useCallback((e) => {
    setIsDragging(false);
    setHoverTime(null);
    seekTo(clientXToValues(e.changedTouches[0].clientX).time);
  }, [clientXToValues, seekTo]);

  // Non-passive native touchmove so preventDefault() actually suppresses
  // page scroll during timeline scrubbing on mobile.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const prevent = (e) => { if (isDragging) e.preventDefault(); };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, [isDragging]);

  // ── Global mouseup — release drag outside the bar ─────────────────────
  useEffect(() => {
    if (!isDragging) return;
    const up = (e) => {
      setIsDragging(false);
      setHoverTime(null);
      seekTo(clientXToValues(e.clientX).time);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [isDragging, seekTo, clientXToValues]);

  // ── Derived values ─────────────────────────────────────────────────────
  const progress    = duration > 0 ? (currentTime / duration) * 100 : 0;
  // hoverFrac only needed for tooltip positioning — derived once per render
  const hoverFrac   = hoverTime !== null && duration > 0 ? hoverTime / duration : null;

  return (
    <div className="timeline-outer">

      {/* Lightweight time-only tooltip — no canvas, no image */}
      {hoverTime !== null && (
        <div
          className="timeline-tooltip"
          style={{
            left:      `${(hoverFrac ?? 0) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="timeline-tooltip-time">{formatTime(hoverTime)}</span>
        </div>
      )}

      <div
        ref={barRef}
        className={`timeline-bar${isDragging ? ' is-dragging' : ''}${hoverTime !== null ? ' is-hovered' : ''}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(currentTime)}
        aria-valuetext={formatTime(currentTime)}
        tabIndex={0}
      >
        <div className="timeline-track">

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

          {hoverFrac !== null && (
            <div
              className="timeline-hover-ghost"
              style={{ width: `${hoverFrac * 100}%` }}
            />
          )}

          <div className="timeline-progress" style={{ width: `${progress}%` }} />

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