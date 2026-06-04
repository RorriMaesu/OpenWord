import React from 'react';
import { useDocument } from '../../context/DocumentContext';
import { Editor } from '@tiptap/react';
import { Layout, Check, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

interface StatusBarProps {
  editor: Editor | null;
  layoutMode: 'pageless' | 'print';
  onLayoutModeChange: (mode: 'pageless' | 'print') => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  editor,
  layoutMode,
  onLayoutModeChange
}) => {
  const { docState, isSaving, isDirty, updateZoom, currentPage, totalPages } = useDocument();

  const getWordCount = () => {
    if (!editor) return 0;
    const text = editor.getText();
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  };

  const getCharCount = () => {
    if (!editor) return 0;
    return editor.getText().length;
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    updateZoom(val);
  };

  const handleZoomIncrement = () => {
    const nextZoom = Math.min(2.0, docState.zoom + 0.1);
    updateZoom(nextZoom);
  };

  const handleZoomDecrement = () => {
    const prevZoom = Math.max(0.5, docState.zoom - 0.1);
    updateZoom(prevZoom);
  };

  return (
    <div className="statusbar-container">
      {/* Left side: Stats & Saving Indicators */}
      <div className="statusbar-left">
        {layoutMode === 'print' && (
          <>
            <span className="statusbar-item page-count" style={{ fontWeight: 500 }}>
              Page {currentPage} of {totalPages}
            </span>
            <span className="statusbar-divider" />
          </>
        )}
        <span className="statusbar-item layout-label">
          <Layout size={14} className="statusbar-icon" />
          <span>{layoutMode === 'print' ? 'Print Layout (A4 Sim)' : 'Pageless Canvas'}</span>
        </span>
        <span className="statusbar-divider" />
        <span className="statusbar-item word-count">
          {getWordCount()} words
        </span>
        <span className="statusbar-item char-count">
          {getCharCount()} characters
        </span>
        <span className="statusbar-divider" />
        <span className="statusbar-item save-indicator">
          {isSaving ? (
            <span className="save-status-loading">
              <RefreshCw size={12} className="spin-icon" />
              <span>Autosaving to DB...</span>
            </span>
          ) : isDirty ? (
            <span className="save-status-dirty">Unsaved edits</span>
          ) : (
            <span className="save-status-clean">
              <Check size={12} className="check-icon" />
              <span>Saved</span>
            </span>
          )}
        </span>
      </div>

      {/* Right side: Layout selectors & Zoom slider */}
      <div className="statusbar-right">
        {/* Layout Shortcuts */}
        <div className="layout-shortcuts">
          <button
            className={`layout-shortcut-btn ${layoutMode === 'pageless' ? 'active' : ''}`}
            onClick={() => onLayoutModeChange('pageless')}
            title="Pageless Web View"
          >
            Web
          </button>
          <button
            className={`layout-shortcut-btn ${layoutMode === 'print' ? 'active' : ''}`}
            onClick={() => onLayoutModeChange('print')}
            title="Print Layout View"
          >
            Print
          </button>
        </div>

        <span className="statusbar-divider" />

        {/* Zoom Controller */}
        <div className="zoom-controller">
          <button onClick={handleZoomDecrement} className="zoom-btn" title="Zoom Out">
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={docState.zoom}
            onChange={handleZoomChange}
            className="zoom-slider"
            title="Adjust Zoom"
          />
          <button onClick={handleZoomIncrement} className="zoom-btn" title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <span className="zoom-value">{Math.round(docState.zoom * 100)}%</span>
        </div>
      </div>
    </div>
  );
};
