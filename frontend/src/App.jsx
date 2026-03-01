import React, { useState, useEffect } from 'react';
import VideoPlayer from './components/VideoPlayer';
import UrlInput from './components/UrlInput';
import './styles.css';

function App() {
  const [videoUrl, setVideoUrl] = useState('');
  const [qualitySources, setQualitySources] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  // Load saved URL and playback position from localStorage
  useEffect(() => {
    const savedUrl = localStorage.getItem('lastVideoUrl');
    if (savedUrl) {
      setVideoUrl(savedUrl);
    }
  }, []);

  const handleUrlSubmit = (url, sources = []) => {
    setError(null);
    setVideoUrl(url);
    setQualitySources(sources);
    setIsPlaying(true);
    
    // Save to localStorage
    localStorage.setItem('lastVideoUrl', url);
  };

  const handleVideoError = (error) => {
    setError(error);
    setIsPlaying(false);
  };

  const handleRetry = () => {
    setError(null);
    setIsPlaying(true);
  };

  const handleChangeUrl = () => {
    setVideoUrl('');
    setQualitySources([]);
    setIsPlaying(false);
    setError(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎬 Video Streaming Player</h1>
        <p>Paste your CDN video URL and start streaming</p>
      </header>

      <main className="app-main">
        {!videoUrl || !isPlaying ? (
          <UrlInput 
            onSubmit={handleUrlSubmit}
            initialUrl={videoUrl}
          />
        ) : (
          <>
            {error && (
              <div className="error-banner">
                <div className="error-content">
                  <h3>⚠️ {error.title}</h3>
                  <p>{error.message}</p>
                  <div className="error-actions">
                    <button onClick={handleRetry} className="btn-retry">
                      🔄 Retry
                    </button>
                    <button onClick={handleChangeUrl} className="btn-change-url">
                      🔗 Change URL
                    </button>
                  </div>
                </div>
              </div>
            )}

            <VideoPlayer
              videoUrl={videoUrl}
              qualitySources={qualitySources}
              onError={handleVideoError}
              onChangeUrl={handleChangeUrl}
            />
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>
          Keyboard shortcuts: 
          <kbd>Space</kbd> Play/Pause • 
          <kbd>←</kbd> Back 10s • 
          <kbd>→</kbd> Forward 10s • 
          <kbd>F</kbd> Fullscreen • 
          <kbd>M</kbd> Mute
        </p>
      </footer>
    </div>
  );
}

export default App;
