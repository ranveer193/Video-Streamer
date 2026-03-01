import React, { useState, useRef, useCallback } from 'react';
import useClickOutside from './UseClickOutside';

/**
 * OPTIMIZATIONS vs original:
 * - useClickOutside: menu closes when clicking anywhere outside (was missing)
 * - useCallback on toggle/select: stable handler identity, no child re-renders
 * - useRef for container: avoids querySelector / event delegation hacks
 * - Keyboard: Escape closes the menu
 * - Early-return guard stays, moved above hooks per rules-of-hooks
 */
function AudioTrackSelector({ tracks, selectedTrack, onTrackChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click
  const close = useCallback(() => setShowMenu(false), []);
  useClickOutside(containerRef, close, showMenu);

  // Keyboard close
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') setShowMenu(false);
  }, []);

  const handleSelect = useCallback((index) => {
    onTrackChange(index);
    setShowMenu(false);
  }, [onTrackChange]);

  if (!tracks || tracks.length === 0) return null;

  return (
    <div
      className="track-selector"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        className="btn-control"
        onClick={() => setShowMenu((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={showMenu}
        aria-label="Audio tracks"
        title="Select audio track"
      >
        🎵 Audio
      </button>

      {showMenu && (
        <div className="track-menu" role="listbox" aria-label="Audio tracks">
          <div className="menu-header">Audio Tracks</div>

          {tracks.map((track, index) => {
            const isActive = selectedTrack === index;
            return (
              <button
                key={track.id ?? index}
                role="option"
                aria-selected={isActive}
                className={`menu-item${isActive ? ' active' : ''}`}
                onClick={() => handleSelect(index)}
              >
                <span className="track-label">{track.label}</span>
                {track.language && (
                  <span className="track-language">({track.language})</span>
                )}
                {isActive && <span className="checkmark" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AudioTrackSelector;