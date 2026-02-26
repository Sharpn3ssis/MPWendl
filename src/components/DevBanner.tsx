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
      <div className="dev-banner__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="dev-banner__content">
        <span className="dev-banner__title">🚧 Vývojová verze</span>
        <span className="dev-banner__text">
          Na této aplikaci stále pracujeme. Některé funkce nemusí být dostupné nebo mohou obsahovat chyby.
        </span>
      </div>
      <button 
        className="dev-banner__close" 
        onClick={handleClose}
        aria-label="Zavřít upozornění"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
};
