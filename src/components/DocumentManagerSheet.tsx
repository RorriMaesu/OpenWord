import React, { useEffect, useState } from 'react';
import { useDocument } from '../context/DocumentContext';
import { getAllDocuments } from '../utils/db';
import type { DocumentState } from '../utils/db';
import { 
  FolderOpen, FileText, Trash2, Plus, Download, 
  Printer, Settings, X, Edit3, ArrowRight, FileUp
} from 'lucide-react';

interface DocumentManagerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenHeaderFooter: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export const DocumentManagerSheet: React.FC<DocumentManagerSheetProps> = ({
  isOpen,
  onClose,
  onOpenHeaderFooter,
  fileInputRef
}) => {
  const {
    docState,
    createNewDocument,
    openDocumentById,
    deleteDocumentById,
    updateTitle,
    saveAsNewFile
  } = useDocument();

  const [localDocs, setLocalDocs] = useState<DocumentState[]>([]);
  const [loading, setLoading] = useState(true);

  // Load documents list from IndexedDB
  const refreshList = async () => {
    try {
      setLoading(true);
      const docs = await getAllDocuments();
      // Sort by lastSaved descending
      docs.sort((a, b) => b.lastSaved - a.lastSaved);
      setLocalDocs(docs);
    } catch (err) {
      console.error('Failed to load documents list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
    }
  }, [isOpen, docState.title, docState.lastSaved]);

  if (!isOpen) return null;

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleOpenDoc = async (id: string) => {
    await openDocumentById(id);
    onClose();
  };

  const handleDeleteDoc = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${title}" permanently?`)) {
      await deleteDocumentById(id);
      await refreshList();
    }
  };

  const handleRenameDoc = async (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    const newTitle = prompt('Rename Document:', currentTitle);
    if (newTitle !== null && newTitle.trim() !== '') {
      const title = newTitle.trim();
      // If it is the currently active document
      if (docState.id === id) {
        updateTitle(title);
      } else {
        // Update title directly in database
        try {
          const doc = localDocs.find(d => d.id === id);
          if (doc) {
            const { saveDocument } = await import('../utils/db');
            await saveDocument({ ...doc, title, lastSaved: Date.now() });
            await refreshList();
          }
        } catch (err) {
          console.error('Failed to rename inactive document:', err);
        }
      }
    }
  };

  const handleCreateNew = () => {
    createNewDocument();
    onClose();
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
    onClose();
  };

  return (
    <div className="mobile-formatter-sheet-backdrop" onClick={onClose}>
      <div className="mobile-formatter-sheet doc-manager-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderOpen size={18} className="sheet-header-icon" style={{ color: 'var(--brand-500)' }} />
            My Documents
          </span>
          <button className="sheet-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="sheet-body doc-manager-body">
          {/* Quick Actions Toolbar */}
          <div className="doc-manager-toolbar">
            <button className="doc-toolbar-btn primary" onClick={handleCreateNew}>
              <Plus size={16} />
              <span>New Document</span>
            </button>
            <button className="doc-toolbar-btn" onClick={handleImportClick}>
              <FileUp size={16} />
              <span>Import File</span>
            </button>
          </div>

          <span className="doc-section-title">Saved Drafts ({localDocs.length})</span>

          {/* List of local documents */}
          <div className="doc-list-container">
            {loading ? (
              <div className="doc-list-loading">Loading documents...</div>
            ) : localDocs.length === 0 ? (
              <div className="doc-list-empty">
                <FileText size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <span>No saved local documents.</span>
              </div>
            ) : (
              <div className="doc-cards-list">
                {localDocs.map((doc) => {
                  const isActive = doc.id === docState.id;
                  return (
                    <div 
                      key={doc.id} 
                      className={`doc-item-card ${isActive ? 'active' : ''}`}
                      onClick={() => handleOpenDoc(doc.id)}
                    >
                      <div className="doc-card-info">
                        <FileText size={18} className="doc-card-icon" />
                        <div className="doc-card-details">
                          <span className="doc-card-title">{doc.title || 'Untitled Document'}</span>
                          <span className="doc-card-date">Saved {formatDate(doc.lastSaved)}</span>
                        </div>
                      </div>
                      
                      <div className="doc-card-actions">
                        <button 
                          className="doc-card-action-btn"
                          title="Rename"
                          onClick={(e) => handleRenameDoc(e, doc.id, doc.title)}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          className="doc-card-action-btn delete"
                          title="Delete"
                          onClick={(e) => handleDeleteDoc(e, doc.id, doc.title)}
                        >
                          <Trash2 size={14} />
                        </button>
                        <span className="doc-card-action-arrow">
                          <ArrowRight size={14} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current File Export Actions */}
          <span className="doc-section-title">Current File Options</span>
          <div className="current-file-actions-grid">
            <button className="current-file-action-card" onClick={async () => { await saveAsNewFile(); onClose(); }}>
              <Download size={16} className="action-card-icon" />
              <div className="action-card-text">
                <span className="action-card-title">Export (.docx)</span>
                <span className="action-card-desc">Download to device storage</span>
              </div>
            </button>

            <button className="current-file-action-card" onClick={() => { window.print(); onClose(); }}>
              <Printer size={16} className="action-card-icon" />
              <div className="action-card-text">
                <span className="action-card-title">Print / PDF</span>
                <span className="action-card-desc">Save as PDF or print paper</span>
              </div>
            </button>

            <button className="current-file-action-card" onClick={() => { onOpenHeaderFooter(); onClose(); }}>
              <Settings size={16} className="action-card-icon" />
              <div className="action-card-text">
                <span className="action-card-title">Headers & Footers</span>
                <span className="action-card-desc">Adjust page layout margins</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
