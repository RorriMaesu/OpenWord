import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, ArrowLeft, X } from 'lucide-react';

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

const TOUR_STEPS: TourStep[] = [
  {
    target: 'body',
    title: 'Welcome to OpenWord! 📝',
    description: 'Let\'s take a quick 1-minute tour to explore your high-fidelity, client-side word processor and its premium offline features.',
    placement: 'center'
  },
  {
    target: '.ruler-inner',
    title: 'Interactive Page Ruler 📏',
    description: 'Adjust document margins on the fly by dragging the handles on either side. Text automatically shifts and wraps in real-time.',
    placement: 'top'
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
  const [currentStep, setCurrentStep] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Reset to step 0 on open
    setCurrentStep(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const step = TOUR_STEPS[currentStep];
    
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
        setCoords(prev => {
          if (
            prev &&
            prev.top === rect.top + window.scrollY &&
            prev.left === rect.left + window.scrollX &&
            prev.width === rect.width &&
            prev.height === rect.height
          ) {
            return prev;
          }
          return {
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
            height: rect.height
          };
        });
      } else {
        setCoords(null);
      }
      animationFrameId = requestAnimationFrame(updatePosition);
    };

    // Run positioning and set listeners
    animationFrameId = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
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
    if (!coords || !tooltipRef.current) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const buffer = 12;

    let top = 0;
    let left = 0;

    switch (step.placement) {
      case 'bottom':
        top = coords.top + coords.height + buffer;
        left = coords.left + (coords.width / 2) - (tooltipRect.width / 2);
        break;
      case 'top':
        top = coords.top - tooltipRect.height - buffer;
        left = coords.left + (coords.width / 2) - (tooltipRect.width / 2);
        break;
      case 'left':
        top = coords.top + (coords.height / 2) - (tooltipRect.height / 2);
        left = coords.left - tooltipRect.width - buffer;
        break;
      case 'right':
        top = coords.top + (coords.height / 2) - (tooltipRect.height / 2);
        left = coords.left + coords.width + buffer;
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
            height: `${coords.height + 8}px`
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

        <h3 className="tour-step-title">{step.title}</h3>
        <p className="tour-step-desc">{step.description}</p>

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
