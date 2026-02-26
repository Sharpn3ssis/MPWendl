import { useState, useEffect } from 'react';
import './DevBanner.css';

export const DevBanner = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('devBannerDismissed');
    if (dismissed === 'true') {
      setIsVisible(false);
    }
  }, []);

  const handleClose = () => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      sessionStorage.setItem('devBannerDismissed', 'true');
    }, 300);
  };

  if (!isVisible) return null;

  return (
    <div className={`dev-banner ${isAnimatingOut ? 'dev-banner--closing' : ''}`}>
      <div className="dev-banner__content">
        <span className="dev-banner__text">
          🛠️ Na aplikaci stále pracujeme — děkujeme za trpělivost!
        </span>
      </div>
      <button 
        className="dev-banner__close" 
        onClick={handleClose}
        aria-label="Zavřít upozornění"
        title="Zavřít"
      >
        ✕
      </button>
    </div>
  );
};
