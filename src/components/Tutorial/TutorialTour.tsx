import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, ArrowLeft, X } from 'lucide-react';
import { useIsMobile } from '../../utils/useIsMobile';

interface TourStep {
  target: string;
  title: string;
  description: string;
  sidebarTab?: 'outline' | 'search' | 'properties' | 'copilot';
  placement: 'bottom' | 'top' | 'left' | 'right' | 'center';
}

interface TutorialTourProps {
  isOpen: boolean;
  onClose: () => void;
  setSidebarTab: (tab: 'outline' | 'search' | 'properties' | 'copilot') => void;
}

const MOBILE_TOUR_STEPS: TourStep[] = [
  {
    target: 'body',
    title: 'Welcome to OpenWord Mobile! 📱',
    description: 'Explore our high-fidelity rich text editor optimized for your phone or tablet screen.',
    placement: 'center'
  },
  {
    target: 'body',
    title: 'Swipeable Formatting Bar ✍️',
    description: 'Swipe left or right on the bottom formatting toolbar to access formatting tools: Bold, Italic, lists, headings, and table insertion.',
    placement: 'center'
  },
  {
    target: 'body',
    title: 'Contextual Table Controls 📊',
    description: 'Tap inside any table cell to reveal row and column controls directly above your formatting bar.',
    placement: 'center'
  },
  {
    target: 'body',
    title: 'Slide-out Sidebar Drawer 🧭',
    description: 'Tap the header icons to open the Outline headings map, run Search and Replace, or toggle the AI Writing Copilot.',
    placement: 'center'
  },
  {
    target: 'body',
    title: '100% Client-Side Privacy 🔒',
    description: 'OpenWord saves all documents and drafts locally to IndexedDB. Your texts never leave your device.',
    placement: 'center'
  }
];

const TOUR_STEPS: TourStep[] = [
  {
    target: 'body',
    title: 'Welcome to OpenWord!',
    description: 'Let\'s take a quick 1-minute tour to explore your high-fidelity, client-side word processor and its premium offline features.',
    placement: 'center'
  },
  {
    target: '.ruler-inner',
    title: 'Interactive Page Ruler 📏',
    description: 'Adjust document margins on the fly by dragging the handles on either side. Text automatically shifts and wraps in real-time.',
    placement: 'bottom'
  },
  {
    target: '.sidebar-resizer-handle',
    title: 'Resizable Sidebar ↔️',
    description: 'You can drag the sidebar border to expand it up to 1020px for a wide, comfortable split-screen view while co-writing with the AI.',
    placement: 'right'
  },
  {
    target: '.copilot-mode-tabs',
    title: 'AI Proposal & Direct Edit Modes 🤖',
    description: 'Toggle between Proposal Mode (review visual red/green diff cards and click Accept/Reject) and Direct Edit Mode (stream text directly into the page).',
    sidebarTab: 'copilot',
    placement: 'bottom'
  },
  {
    target: '.sidebar-tabs',
    title: 'Navigation Outline Map 🧭',
    description: 'Switch tabs here to use the auto-updating document map, run advanced Find & Replace, or inspect document properties and autosave state.',
    sidebarTab: 'outline',
    placement: 'bottom'
  },
  {
    target: '.autosave-toggle-container',
    title: '100% Client-Side Privacy 🔒',
    description: 'OpenWord saves all files and drafts locally to your browser\'s IndexedDB. Your documents never touch a remote server, ensuring total offline privacy.',
    placement: 'bottom'
  }
];

export const TutorialTour: React.FC<TutorialTourProps> = ({ isOpen, onClose, setSidebarTab }) => {
  const isMobile = useIsMobile();
  const [currentStep, setCurrentStep] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [stableTooltipCoords, setStableTooltipCoords] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [isTransitioningStep, setIsTransitioningStep] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Reset to step 0 on open
    setCurrentStep(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isMobile) return;

    // Trigger transition state when step changes
    setIsTransitioningStep(true);
    const timer = setTimeout(() => {
      setIsTransitioningStep(false);
    }, 450);

    const step = TOUR_STEPS[currentStep];
    
    // Reset stable coordinates to null so it captures the new target's coordinates on first frame
    setStableTooltipCoords(null);

    // Dynamically adjust sidebar tab if the step requires it
    if (step.sidebarTab) {
      setSidebarTab(step.sidebarTab);
    }

    // Toggle simulation class on sidebar during step 2 (Resizable handle)
    const sidebar = document.querySelector('.sidebar-container');
    if (sidebar) {
      if (currentStep === 2) {
        sidebar.classList.add('simulating-resize');
      } else {
        sidebar.classList.remove('simulating-resize');
      }
    }

    // Toggle simulation class on ruler during step 1 (Ruler handle)
    const ruler = document.querySelector('.ruler-inner');
    if (ruler) {
      if (currentStep === 1) {
        ruler.classList.add('simulating-ruler');
      } else {
        ruler.classList.remove('simulating-ruler');
      }
    }

    let animationFrameId: number;

    // Position tooltip relative to targeted element
    const updatePosition = () => {
      const element = document.querySelector(step.target);
      if (element) {
        const rect = element.getBoundingClientRect();
        const currentCoords = {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height
        };

        setCoords(prev => {
          if (
            prev &&
            prev.top === currentCoords.top &&
            prev.left === currentCoords.left &&
            prev.width === currentCoords.width &&
            prev.height === currentCoords.height
          ) {
            return prev;
          }
          return currentCoords;
        });

        setStableTooltipCoords(prev => {
          if (!prev) {
            return {
              ...currentCoords,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight
            };
          }

          if (currentStep === 2) {
            // During sidebar resize animation, freeze the coordinates to avoid chasing
            // unless the window size changes. If so, offset coordinates accordingly.
            if (prev.viewportWidth !== window.innerWidth || prev.viewportHeight !== window.innerHeight) {
              const deltaX = window.innerWidth - prev.viewportWidth;
              const deltaY = window.innerHeight - prev.viewportHeight;
              return {
                top: prev.top + deltaY,
                left: prev.left + deltaX,
                width: rect.width,
                height: rect.height,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight
              };
            }
            return prev;
          }

          return {
            ...currentCoords,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
          };
        });
      } else {
        setCoords(null);
        setStableTooltipCoords(null);
      }
      animationFrameId = requestAnimationFrame(updatePosition);
    };

    // Run positioning and set listeners
    animationFrameId = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [currentStep, isOpen, setSidebarTab]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    // Clear simulation animations
    const sidebar = document.querySelector('.sidebar-container');
    if (sidebar) sidebar.classList.remove('simulating-resize');
    const ruler = document.querySelector('.ruler-inner');
    if (ruler) ruler.classList.remove('simulating-ruler');
    
    localStorage.setItem('openword_onboarding_completed', 'true');
    onClose();
  };

  // Determine tooltip style placement offsets
  const getTooltipStyle = () => {
    if (!stableTooltipCoords || !tooltipRef.current) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const buffer = 12;

    let top = 0;
    let left = 0;

    switch (step.placement) {
      case 'bottom':
        top = stableTooltipCoords.top + stableTooltipCoords.height + buffer;
        left = stableTooltipCoords.left + (stableTooltipCoords.width / 2) - (tooltipRect.width / 2);
        break;
      case 'top':
        top = stableTooltipCoords.top - tooltipRect.height - buffer;
        left = stableTooltipCoords.left + (stableTooltipCoords.width / 2) - (tooltipRect.width / 2);
        break;
      case 'left':
        top = stableTooltipCoords.top + (stableTooltipCoords.height / 2) - (tooltipRect.height / 2);
        left = stableTooltipCoords.left - tooltipRect.width - buffer;
        break;
      case 'right':
        top = stableTooltipCoords.top + (stableTooltipCoords.height / 2) - (tooltipRect.height / 2);
        left = stableTooltipCoords.left + stableTooltipCoords.width + buffer;
        break;
      case 'center':
      default:
        return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    // Keep tooltip boundary in viewport
    top = Math.max(10, Math.min(top, window.innerHeight + window.scrollY - tooltipRect.height - 10));
    left = Math.max(10, Math.min(left, window.innerWidth + window.scrollX - tooltipRect.width - 10));

    return { top: `${top}px`, left: `${left}px` };
  };

  if (isMobile) {
    const currentMobileStep = MOBILE_TOUR_STEPS[currentStep];
    return (
      <div className="tutorial-tour-overlay mobile-tour-overlay">
        <div className="tutorial-tooltip-card mobile-tour-card anim-scale-in" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', position: 'fixed' }}>
          <button className="tour-close-btn" onClick={handleComplete} title="Skip Tour">
            <X size={14} />
          </button>

          <div className="tour-card-header">
            <Sparkles className="tour-sparkle" size={14} />
            <span className="tour-progress">Step {currentStep + 1} of {MOBILE_TOUR_STEPS.length}</span>
          </div>

          <div className="tour-welcome-brand" style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px 0' }}>
            <svg viewBox="0 0 24 24" style={{ width: '48px', height: '48px' }} fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="tour-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0078d4" />
                  <stop offset="100%" stopColor="#00b4fc" />
                </linearGradient>
              </defs>
              <path d="M16 2H8C5.79086 2 4 3.79086 4 6V18C4 20.2091 5.79086 22 8 22H16C18.2091 22 20 20.2091 20 18V6C20 3.79086 18.2091 2 16 2Z" fill="url(#tour-logo-grad)" />
              <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="1.8" strokeDasharray="24 6" strokeLinecap="round" />
              <path d="M9.5 10L11 14L12 12L13 14L14.5 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <h3 className="tour-step-title" style={{ textAlign: 'center' }}>{currentMobileStep.title}</h3>
          <p className="tour-step-desc" style={{ textAlign: 'center', fontSize: '13px', margin: '12px 0 20px 0' }}>{currentMobileStep.description}</p>

          <div className="tour-progress-bar-container">
            <div 
              className="tour-progress-bar" 
              style={{ width: `${((currentStep + 1) / MOBILE_TOUR_STEPS.length) * 100}%` }}
            />
          </div>

          <div className="tour-card-actions">
            <button className="tour-btn-skip" onClick={handleComplete}>
              Skip
            </button>
            <div className="tour-nav-btns">
              {currentStep > 0 && (
                <button className="tour-btn-nav back" onClick={handleBack}>
                  <ArrowLeft size={13} />
                  <span>Back</span>
                </button>
              )}
              <button className="tour-btn-nav next" onClick={() => {
                if (currentStep < MOBILE_TOUR_STEPS.length - 1) {
                  setCurrentStep(currentStep + 1);
                } else {
                  handleComplete();
                }
              }}>
                <span>{currentStep === MOBILE_TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tutorial-tour-overlay">
      {/* Visual focus highlight box */}
      {coords && step.target !== 'body' && (
        <div 
          className="tutorial-highlight-box"
          style={{
            top: `${coords.top - 4}px`,
            left: `${coords.left - 4}px`,
            width: `${coords.width + 8}px`,
            height: `${coords.height + 8}px`,
            transition: isTransitioningStep
              ? 'top 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), left 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease'
              : 'opacity 0.2s ease'
          }}
        />
      )}

      {/* Simulated dragging cursor indicators */}
      {currentStep === 1 && coords && (
        <div 
          className="simulated-pointer ruler-drag"
          style={{
            top: `${(() => {
              const handle = document.querySelector('.left-handle');
              if (handle) {
                const rect = handle.getBoundingClientRect();
                return rect.top + rect.height / 2 + window.scrollY;
              }
              return coords.top + coords.height / 2;
            })()}px`,
            left: `${(() => {
              const handle = document.querySelector('.left-handle');
              if (handle) {
                const rect = handle.getBoundingClientRect();
                return rect.left + rect.width / 2 + window.scrollX;
              }
              return coords.left + 96;
            })()}px`
          }}
        />
      )}
      {currentStep === 2 && coords && (
        <div 
          className="simulated-pointer sidebar-drag"
          style={{
            top: `${coords.top + coords.height / 2}px`,
            left: `${coords.left}px`
          }}
        />
      )}

      {/* Tour Floating Tooltip Card */}
      <div 
        ref={tooltipRef}
        className="tutorial-tooltip-card anim-scale-in"
        style={getTooltipStyle()}
      >
        <button className="tour-close-btn" onClick={handleComplete} title="Skip Tour">
          <X size={14} />
        </button>

        <div className="tour-card-header">
          <Sparkles className="tour-sparkle" size={14} />
          <span className="tour-progress">Step {currentStep + 1} of {TOUR_STEPS.length}</span>
        </div>

        {currentStep === 0 && (
          <div className="tour-welcome-brand" style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px 0' }}>
            <svg viewBox="0 0 24 24" style={{ width: '48px', height: '48px' }} fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="tour-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0078d4" />
                  <stop offset="100%" stopColor="#00b4fc" />
                </linearGradient>
              </defs>
              <path d="M16 2H8C5.79086 2 4 3.79086 4 6V18C4 20.2091 5.79086 22 8 22H16C18.2091 22 20 20.2091 20 18V6C20 3.79086 18.2091 2 16 2Z" fill="url(#tour-logo-grad)" />
              <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="1.8" strokeDasharray="24 6" strokeLinecap="round" />
              <path d="M9.5 10L11 14L12 12L13 14L14.5 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        <h3 className="tour-step-title" style={{ textAlign: currentStep === 0 ? 'center' : 'left' }}>{step.title}</h3>
        <p className="tour-step-desc" style={{ textAlign: currentStep === 0 ? 'center' : 'left' }}>{step.description}</p>

        {/* Dynamic visual indicator inside tooltip */}
        <div className="tour-progress-bar-container">
          <div 
            className="tour-progress-bar" 
            style={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="tour-card-actions">
          <button className="tour-btn-skip" onClick={handleComplete}>
            Skip Tour
          </button>
          
          <div className="tour-nav-btns">
            {currentStep > 0 && (
              <button className="tour-btn-nav back" onClick={handleBack}>
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>
            )}
            <button className="tour-btn-nav next" onClick={handleNext}>
              <span>{currentStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
