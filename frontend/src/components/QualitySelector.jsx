import React, { useState, useRef, useCallback, useEffect } from 'react';
import useAdaptiveQuality, { QUALITY_LEVELS } from './UseAdaptiveQuality';
import useClickOutside from './UseClickOutside';

/**
 * QualitySelector
 *
 * Props:
 *  onQualityChange(qualityString) — called with '720', '480', 'original' etc.
 *  initialQuality                 — starting quality (defaults to auto-detected)
 *
 * Features:
 *  - Auto-detects network speed on mount and pre-selects best quality
 *  - Shows real measured Mbps next to each level (green = achievable)
 *  - "Auto" mode follows network changes automatically
 *  - Manual override: user can lock any level
 *  - Network speed badge in toolbar button (Fast/Medium/Slow)
 *  - Re-detect button to re-run speed probe
 */
function QualitySelector({ onQualityChange, initialQuality }) {
  const [showMenu,   setShowMenu]   = useState(false);
  const [isAuto,     setIsAuto]     = useState(true);     // auto = follow detected speed
  const [manualQ,    setManualQ]    = useState(null);     // locked quality string
  const [activeQ,    setActiveQ]    = useState(initialQuality ?? '720'); // currently applied
  const containerRef = useRef(null);
  const prevSuggRef  = useRef(null);

  const {
    detectedMbps,
    suggestedQuality,
    networkType,
    isDetecting,
    redetect,
  } = useAdaptiveQuality();

  // ── When auto-mode and suggestion changes, apply it ─────────────────
  useEffect(() => {
    if (!isAuto) return;
    if (suggestedQuality === prevSuggRef.current) return;
    prevSuggRef.current = suggestedQuality;
    setActiveQ(suggestedQuality);
    onQualityChange(suggestedQuality);
  }, [isAuto, suggestedQuality, onQualityChange]);

  // ── Apply initialQuality if provided and not auto ─────────────────
  useEffect(() => {
    if (initialQuality && !isAuto) {
      setActiveQ(initialQuality);
    }
  }, [initialQuality, isAuto]);

  // ── Click outside closes menu ────────────────────────────────────────
  const close = useCallback(() => setShowMenu(false), []);
  useClickOutside(containerRef, close, showMenu);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') setShowMenu(false);
  }, []);

  // ── Select a quality manually ────────────────────────────────────────
  const handleSelect = useCallback((qualityStr) => {
    setIsAuto(false);
    setManualQ(qualityStr);
    setActiveQ(qualityStr);
    onQualityChange(qualityStr);
    setShowMenu(false);
  }, [onQualityChange]);

  // ── Switch back to auto mode ─────────────────────────────────────────
  const handleAutoSelect = useCallback(() => {
    setIsAuto(true);
    setManualQ(null);
    const q = suggestedQuality ?? '720';
    setActiveQ(q);
    onQualityChange(q);
    setShowMenu(false);
  }, [suggestedQuality, onQualityChange]);

  // ── Helper: is this quality achievable on current connection? ────────
  const isAchievable = (level) => {
    if (!detectedMbps) return true; // unknown — don't grey anything out
    return detectedMbps * 0.8 >= level.minMbps;
  };

  // ── Display label for the button ────────────────────────────────────
  const buttonLabel = isAuto
    ? `Auto (${activeQ === 'original' ? 'Src' : activeQ + 'p'})`
    : (activeQ === 'original' ? 'Original' : `${activeQ}p`);

  const networkBadgeClass = {
    fast:    'net-badge--fast',
    medium:  'net-badge--medium',
    slow:    'net-badge--slow',
    unknown: 'net-badge--unknown',
  }[networkType];

  return (
    <div
      className="track-selector quality-selector"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {/* ── Toolbar button ────────────────────────────────────────── */}
      <button
        className="btn-control quality-btn"
        onClick={() => setShowMenu((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={showMenu}
        aria-label="Video quality"
        title="Select video quality"
      >
        <span className="quality-btn-icon">⚙️</span>
        <span className="quality-btn-label">{buttonLabel}</span>
        {isDetecting
          ? <span className="net-badge net-badge--detecting">…</span>
          : <span className={`net-badge ${networkBadgeClass}`}>{networkBadgeLabel(networkType)}</span>
        }
      </button>

      {/* ── Dropdown menu ─────────────────────────────────────────── */}
      {showMenu && (
        <div className="track-menu quality-menu" role="listbox" aria-label="Video quality">

          {/* Header with speed readout */}
          <div className="quality-menu-header">
            <span>Video Quality</span>
            <div className="quality-speed-row">
              {isDetecting ? (
                <span className="quality-speed-detecting">Measuring speed…</span>
              ) : detectedMbps !== null ? (
                <span className="quality-speed-value">
                  <span className={`quality-speed-dot ${networkBadgeClass}`} />
                  {detectedMbps} Mbps
                </span>
              ) : null}
              <button
                className="quality-redetect-btn"
                onClick={(e) => { e.stopPropagation(); redetect(); }}
                title="Re-measure connection speed"
              >
                ↺
              </button>
            </div>
          </div>

          {/* Auto option */}
          <button
            role="option"
            aria-selected={isAuto}
            className={`menu-item quality-menu-item${isAuto ? ' active' : ''}`}
            onClick={handleAutoSelect}
          >
            <div className="quality-item-left">
              <span className="quality-item-label">Auto</span>
              <span className="quality-item-desc">
                {suggestedQuality
                  ? `Currently ${suggestedQuality === 'original' ? 'source' : suggestedQuality + 'p'}`
                  : 'Detecting…'}
              </span>
            </div>
            <div className="quality-item-right">
              <span className="quality-badge quality-badge--auto">AUTO</span>
              {isAuto && <span className="checkmark">✓</span>}
            </div>
          </button>

          <div className="quality-divider" />

          {/* Manual levels */}
          {QUALITY_LEVELS.map((level) => {
            const achievable = isAchievable(level);
            const isActive   = !isAuto && activeQ === level.quality;
            const isSuggested = level.quality === suggestedQuality;

            return (
              <button
                key={level.quality}
                role="option"
                aria-selected={isActive}
                className={`menu-item quality-menu-item${isActive ? ' active' : ''}${!achievable ? ' quality-item--slow' : ''}`}
                onClick={() => handleSelect(level.quality)}
                title={!achievable ? `Needs ~${level.minMbps} Mbps (you have ${detectedMbps} Mbps)` : ''}
              >
                <div className="quality-item-left">
                  <span className="quality-item-label">
                    {level.label}
                    {level.badge && (
                      <span className="quality-res-badge">{level.badge}</span>
                    )}
                  </span>
                  <span className={`quality-item-desc${!achievable ? ' quality-item-desc--warn' : ''}`}>
                    {!achievable
                      ? `Needs ${level.minMbps} Mbps`
                      : level.description}
                  </span>
                </div>
                <div className="quality-item-right">
                  {isSuggested && !isActive && (
                    <span className="quality-badge quality-badge--recommended">Best</span>
                  )}
                  {isActive && <span className="checkmark">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function networkBadgeLabel(type) {
  return { fast: 'HD', medium: 'OK', slow: '!', unknown: '' }[type] ?? '';
}

export default QualitySelector;