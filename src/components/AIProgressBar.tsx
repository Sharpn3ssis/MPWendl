import React, { useEffect, useState } from 'react';
import './AIProgressBar.css';

interface Props {
  isActive: boolean;
  label?: string;
  estimatedSeconds?: number;
  onComplete?: () => void;
}

const AI_PHRASES = [
  'Analyzuji obsah…',
  'Zpracovávám text…',
  'Generuji výstup…',
  'AI přemýšlí…',
  'Připravuji odpověď…',
  'Dokončuji úkol…',
];

export const AIProgressBar: React.FC<Props> = ({
  isActive,
  label,
  estimatedSeconds = 8,
  onComplete,
}) => {
  const [progress, setProgress] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      setProgress(0);
      setPhraseIndex(0);
    } else if (!isActive && progress > 0) {
      // Complete the animation
      setProgress(100);
      setTimeout(() => {
        setIsVisible(false);
        setProgress(0);
        onComplete?.();
      }, 500);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !isVisible) return;

    // Simulate progress - fast at start, slows down near end
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        const remaining = 95 - prev;
        const increment = Math.max(0.5, remaining * 0.08);
        return Math.min(95, prev + increment);
      });
    }, (estimatedSeconds * 1000) / 50);

    return () => clearInterval(interval);
  }, [isActive, isVisible, estimatedSeconds]);

  useEffect(() => {
    if (!isActive || !isVisible) return;

    const phraseInterval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % AI_PHRASES.length);
    }, 2000);

    return () => clearInterval(phraseInterval);
  }, [isActive, isVisible]);

  if (!isVisible) return null;

  const displayLabel = label || AI_PHRASES[phraseIndex];

  return (
    <div className={`ai-progress ${isActive ? 'ai-progress--active' : 'ai-progress--complete'}`}>
      <div className="ai-progress__header">
        <div className="ai-progress__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a2 2 0 0 1 0 4h-1v.27c.6.34 1 .99 1 1.73a2 2 0 0 1-4 0c0-.74.4-1.39 1-1.73V18H5v.27c.6.34 1 .99 1 1.73a2 2 0 0 1-4 0c0-.74.4-1.39 1-1.73V14H2a2 2 0 0 1 0-4h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
            <circle cx="9" cy="13" r="1.5" fill="currentColor" />
            <circle cx="15" cy="13" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <div className="ai-progress__label">
          <span className="ai-progress__text">{displayLabel}</span>
          <span className="ai-progress__percent">{Math.round(progress)}%</span>
        </div>
      </div>
      <div className="ai-progress__track">
        <div
          className="ai-progress__fill"
          style={{ width: `${progress}%` }}
        />
        <div className="ai-progress__shimmer" />
      </div>
      <div className="ai-progress__particles">
        {[...Array(6)].map((_, i) => (
          <span key={i} className="ai-progress__particle" style={{ '--delay': `${i * 0.3}s` } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
};
