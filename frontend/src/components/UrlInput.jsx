import React, { useState, useCallback } from 'react';

/**
 * OPTIMIZATIONS vs original:
 *
 * 1. REPLACED alert() WITH INLINE VALIDATION:
 *    alert() blocks the UI thread and looks unprofessional. Replaced with an
 *    inline error message rendered below the input.
 *
 * 2. useCallback ON HANDLERS:
 *    Stable handler identity so React doesn't recreate them on each render.
 *
 * 3. CLIPBOARD PERMISSION FEEDBACK:
 *    The original silently failed if clipboard permission was denied.
 *    Now shows a brief inline error if paste fails.
 *
 * 4. TRIM INPUT BEFORE VALIDATION:
 *    Applied consistently — leading/trailing whitespace no longer breaks
 *    the URL constructor check.
 *
 * 5. QUALITY SOURCE DEDUP SIMPLIFIED:
 *    The original had a subtle bug where the "Auto" fallback always used
 *    height:1080 even for non-1080 main URLs. Now the main URL is added
 *    without a hardcoded height.
 */
function UrlInput({ onSubmit, initialUrl = '' }) {
  const [url,              setUrl]              = useState(initialUrl);
  const [quality720,       setQuality720]       = useState('');
  const [quality1080,      setQuality1080]      = useState('');
  const [showMultiQuality, setShowMultiQuality] = useState(false);
  const [error,            setError]            = useState('');

  const clearError = useCallback(() => setError(''), []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();

    const trimmed = url.trim();

    if (!trimmed) {
      setError('Please enter a video URL.');
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setError('Invalid URL — please enter one starting with http:// or https://');
      return;
    }

    setError('');

    // Build quality sources list (deduped by URL)
    const sources = [];

    if (showMultiQuality) {
      if (quality720.trim()) {
        sources.push({ url: quality720.trim(), label: '720p', height: 720 });
      }
      if (quality1080.trim()) {
        sources.push({ url: quality1080.trim(), label: '1080p', height: 1080 });
      }
      // Add the main URL as "Auto" only if it isn't already in the list
      const alreadyPresent = sources.some((s) => s.url === trimmed);
      if (!alreadyPresent) {
        sources.push({ url: trimmed, label: 'Auto' });
      }
    }

    onSubmit(trimmed, sources);
  }, [url, quality720, quality1080, showMultiQuality, onSubmit]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
      setError('');
    } catch {
      setError('Could not read clipboard. Please paste manually.');
    }
  }, []);

  return (
    <div className="url-input-container">
      <div className="url-input-card">
        <h2>Enter Video URL</h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="input-group">
            <label htmlFor="video-url">Video URL</label>
            <div className="input-with-button">
              <input
                type="url"
                id="video-url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); clearError(); }}
                placeholder="https://cdn.example.com/video.mp4"
                className={`url-input${error ? ' url-input--error' : ''}`}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handlePaste}
                className="btn-paste"
                title="Paste from clipboard"
              >
                📋 Paste
              </button>
            </div>

            {/* Inline validation — replaces alert() */}
            {error && (
              <p className="input-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={showMultiQuality}
                onChange={(e) => setShowMultiQuality(e.target.checked)}
              />
              <span>Add multiple quality sources (optional)</span>
            </label>
          </div>

          {showMultiQuality && (
            <div className="quality-inputs">
              <div className="input-group">
                <label htmlFor="quality-720">720p URL (optional)</label>
                <input
                  type="url"
                  id="quality-720"
                  value={quality720}
                  onChange={(e) => setQuality720(e.target.value)}
                  placeholder="https://cdn.example.com/video-720p.mp4"
                  className="url-input"
                  autoComplete="off"
                />
              </div>

              <div className="input-group">
                <label htmlFor="quality-1080">1080p URL (optional)</label>
                <input
                  type="url"
                  id="quality-1080"
                  value={quality1080}
                  onChange={(e) => setQuality1080(e.target.value)}
                  placeholder="https://cdn.example.com/video-1080p.mp4"
                  className="url-input"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <button type="submit" className="btn-submit">
            ▶️ Start Streaming
          </button>
        </form>

        <div className="info-box">
          <h4>ℹ️ Supported formats</h4>
          <p>MP4, MKV, WebM and other HTML5 video formats</p>
          <p>Direct CDN URLs with HTTP Range support work best</p>
        </div>
      </div>
    </div>
  );
}

export default UrlInput;