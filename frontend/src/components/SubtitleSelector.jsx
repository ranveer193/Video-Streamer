import React, { useState, useRef, useCallback } from 'react';
import useClickOutside from './UseClickOutside';

/**
 * OPTIMIZATIONS vs original:
 * - useClickOutside: menu closes on outside click (was missing)
 * - useCallback on handlers: stable identity
 * - Keyboard: Escape closes the menu
 * - aria roles for accessibility
 */
function SubtitleSelector({ tracks, selectedTrack, onTrackChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const containerRef = useRef(null);

  const close = useCallback(() => setShowMenu(false), []);
  useClickOutside(containerRef, close, showMenu);

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
        aria-label="Subtitles"
        title="Select subtitles"
      >
        💬 CC
      </button>

      {showMenu && (
        <div className="track-menu" role="listbox" aria-label="Subtitles">
          <div className="menu-header">Subtitles</div>

          {/* "Off" option */}
          <button
            role="option"
            aria-selected={selectedTrack === -1}
            className={`menu-item${selectedTrack === -1 ? ' active' : ''}`}
            onClick={() => handleSelect(-1)}
          >
            <span className="track-label">Off</span>
            {selectedTrack === -1 && (
              <span className="checkmark" aria-hidden="true">✓</span>
            )}
          </button>

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
                {isActive && (
                  <span className="checkmark" aria-hidden="true">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SubtitleSelector;