import { useState, useEffect } from 'react';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const mediaQueryMobile = window.matchMedia('(max-width: 767px)');
    const mediaQueryLandscape = window.matchMedia('(max-width: 960px) and (orientation: landscape)');

    const checkMobile = () => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const matchMobile = mediaQueryMobile.matches;
      const matchLandscapeMobile = mediaQueryLandscape.matches && isTouch;
      setIsMobile(matchMobile || matchLandscapeMobile);
    };

    // Initial check
    checkMobile();

    // Event listeners
    if (mediaQueryMobile.addEventListener) {
      mediaQueryMobile.addEventListener('change', checkMobile);
      mediaQueryLandscape.addEventListener('change', checkMobile);
    } else {
      // Legacy fallback browser support
      mediaQueryMobile.addListener(checkMobile);
      mediaQueryLandscape.addListener(checkMobile);
    }

    return () => {
      if (mediaQueryMobile.removeEventListener) {
        mediaQueryMobile.removeEventListener('change', checkMobile);
        mediaQueryLandscape.removeEventListener('change', checkMobile);
      } else {
        mediaQueryMobile.removeListener(checkMobile);
        mediaQueryLandscape.removeListener(checkMobile);
      }
    };
  }, []);

  return isMobile;
}
