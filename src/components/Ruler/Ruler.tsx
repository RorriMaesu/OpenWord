import React, { useRef, useState, useEffect } from 'react';
import { useDocument } from '../../context/DocumentContext';

export const Ruler: React.FC = () => {
  const { docState, updateMargins } = useDocument();
  const { margins, pageSize, orientation, zoom } = docState;
  
  const rulerRef = useRef<HTMLDivElement>(null);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // A4 vs Letter width in pixels
  const isLandscape = orientation === 'landscape';
  const docWidth = pageSize === 'Letter' 
    ? (isLandscape ? 1056 : 816) 
    : (isLandscape ? 1123 : 794);

  // Synchronize CSS variables initially
  useEffect(() => {
    document.documentElement.style.setProperty('--page-margin-top', `${margins.top}px`);
    document.documentElement.style.setProperty('--page-margin-bottom', `${margins.bottom}px`);
    document.documentElement.style.setProperty('--page-margin-left', `${margins.left}px`);
    document.documentElement.style.setProperty('--page-margin-right', `${margins.right}px`);
  }, [margins]);

  const handleMouseDownLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseDownRight = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingLeft && !isDraggingRight) return;
      if (!rulerRef.current) return;

      const rect = rulerRef.current.getBoundingClientRect();
      const relativeX = (e.clientX - rect.left) / (zoom || 1);

      if (isDraggingLeft) {
        // Bound left margin between 20px and 250px
        const newLeft = Math.max(20, Math.min(250, Math.round(relativeX)));
        
        // Fast-path styling: Update CSS variable directly for 60fps rendering
        document.documentElement.style.setProperty('--page-margin-left', `${newLeft}px`);
      } else if (isDraggingRight) {
        // Bound right margin between 20px and 250px from the right boundary
        const rightEdge = docWidth;
        const newRight = Math.max(20, Math.min(250, Math.round(rightEdge - relativeX)));
        
        // Fast-path styling
        document.documentElement.style.setProperty('--page-margin-right', `${newRight}px`);
      }
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      if (isDraggingLeft) {
        setIsDraggingLeft(false);
        const currentStyleVal = document.documentElement.style.getPropertyValue('--page-margin-left');
        const finalVal = parseInt(currentStyleVal, 10) || margins.left;
        updateMargins({ ...margins, left: finalVal });
      }
      if (isDraggingRight) {
        setIsDraggingRight(false);
        const currentStyleVal = document.documentElement.style.getPropertyValue('--page-margin-right');
        const finalVal = parseInt(currentStyleVal, 10) || margins.right;
        updateMargins({ ...margins, right: finalVal });
      }
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, margins, docWidth, updateMargins]);

  // Generate tick marks (ticks every 10px, major ticks every 50px)
  const renderTicks = () => {
    const ticks = [];
    const step = 10;
    const ticksCount = Math.floor(docWidth / step);
    
    for (let i = 0; i <= ticksCount; i++) {
      const x = i * step;
      const isMajor = x % 50 === 0;
      
      ticks.push(
        <div
          key={i}
          className={`ruler-tick ${isMajor ? 'major' : 'minor'}`}
          style={{ left: `${x}px` }}
        >
          {isMajor && i > 0 && <span className="ruler-tick-num">{x / 10}</span>}
        </div>
      );
    }
    return ticks;
  };

  return (
    <div className="ruler-outer-container">
      <div 
        ref={rulerRef} 
        className="ruler-inner" 
        style={{ 
          width: `${docWidth}px`,
          transform: `scale(${zoom})`,
          transformOrigin: 'top center'
        }}
      >
        {/* Shaded margins */}
        <div className="ruler-margin-shading left-shade" style={{ width: 'var(--page-margin-left)' }} />
        <div className="ruler-margin-shading right-shade" style={{ width: 'var(--page-margin-right)' }} />

        {/* Ticks */}
        {renderTicks()}

        {/* Draggable handles */}
        <div 
          className={`ruler-handle left-handle ${isDraggingLeft ? 'dragging' : ''}`}
          style={{ left: 'var(--page-margin-left)' }}
          onMouseDown={handleMouseDownLeft}
          title="Left Margin"
        />
        <div 
          className={`ruler-handle right-handle ${isDraggingRight ? 'dragging' : ''}`}
          style={{ left: 'calc(100% - var(--page-margin-right))' }}
          onMouseDown={handleMouseDownRight}
          title="Right Margin"
        />
      </div>
    </div>
  );
};
