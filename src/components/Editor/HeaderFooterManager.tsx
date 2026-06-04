import React from 'react';
import { useDocument } from '../../context/DocumentContext';
import { Heading, Info, X } from 'lucide-react';

interface HeaderFooterManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HeaderFooterManager: React.FC<HeaderFooterManagerProps> = ({ isOpen, onClose }) => {
  const { docState, updateHeaders, updateFooters } = useDocument();

  if (!isOpen) return null;

  return (
    <div className="header-footer-sticky-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Heading size={18} className="panel-icon" />
          <span>Headers & Footers Settings</span>
        </div>
        <button onClick={onClose} className="panel-close-btn" title="Close Panel">
          <X size={16} />
        </button>
      </div>

      <div className="panel-body">
        {/* Header Input Group */}
        <div className="input-group">
          <label htmlFor="header-input">Document Header Text</label>
          <input
            id="header-input"
            type="text"
            placeholder="Type header content..."
            value={docState.headers.default}
            onChange={(e) => updateHeaders({ default: e.target.value })}
          />
        </div>

        {/* Footer Input Group */}
        <div className="input-group">
          <label htmlFor="footer-input">Document Footer Text</label>
          <input
            id="footer-input"
            type="text"
            placeholder="Type footer content (e.g. Confidential)..."
            value={docState.footers.default}
            onChange={(e) => updateFooters({ default: e.target.value })}
          />
        </div>

        {/* Layout Options */}
        <div className="checkbox-group">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={docState.headers.differentFirstPage}
              onChange={(e) => {
                updateHeaders({ differentFirstPage: e.target.checked });
                updateFooters({ differentFirstPage: e.target.checked });
              }}
            />
            <span className="checkmark"></span>
            Different First Page (Hide on page 1)
          </label>
        </div>

        <div className="info-box">
          <Info size={14} className="info-icon" />
          <p>
            Page numbering is added automatically to the bottom center of printed documents. Text entered above will appear alongside it.
          </p>
        </div>
      </div>
    </div>
  );
};
