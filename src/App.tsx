import React, { useState, useEffect } from 'react';
import { DocumentProvider, useDocument } from './context/DocumentContext';
import { Ribbon } from './components/Ribbon/Ribbon';
import { Editor } from './components/Editor/Editor';
import { Sidebar } from './components/Sidebar/Sidebar';
import { StatusBar } from './components/StatusBar/StatusBar';
import { HeaderFooterManager } from './components/Editor/HeaderFooterManager';
import { Editor as TiptapEditor } from '@tiptap/react';
import { AlertTriangle, Undo, Redo, Save, Printer, Search, Minus, Square, X, Cloud, CloudOff } from 'lucide-react';
import { getDocument, deleteDocument } from './utils/db';
import './App.css';

const AppContent: React.FC = () => {
  const { docState, updateTitle, saveActiveFile, restoreAutosave } = useDocument();
  
  // Editor instance reference
  const [editor, setEditor] = useState<TiptapEditor | null>(null);

  // App Layout options
  const [layoutMode, setLayoutMode] = useState<'pageless' | 'print'>('print');
  const [showRuler, setShowRuler] = useState(true);
  const showSidebar = true;
  const [showHeaderFooter, setShowHeaderFooter] = useState(false);

  // Autosave Recovery dialog visibility
  const [showRecoveryAlert, setShowRecoveryAlert] = useState(false);

  // Check for auto-recovery document on startup
  useEffect(() => {
    const checkForAutosave = async () => {
      try {
        const doc = await getDocument('autosave-doc');
        if (doc) {
          setShowRecoveryAlert(true);
        }
      } catch (err) {
        console.error('Failed to check for autosave:', err);
      }
    };
    checkForAutosave();
  }, []);

  const handleRestoreRecovery = async () => {
    setShowRecoveryAlert(false);
    const success = await restoreAutosave();
    if (success && editor) {
      // Hydrate editor with recovered data
      // useDocument handles setting the state, which Editor synchronizes in its useEffect
    }
  };

  const handleDiscardRecovery = async () => {
    setShowRecoveryAlert(false);
    try {
      await deleteDocument('autosave-doc');
    } catch (err) {
      console.error('Failed to delete autosaved document:', err);
    }
  };

  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  const triggerUndo = () => editor?.commands.undo();
  const triggerRedo = () => editor?.commands.redo();

  return (
    <div className="app-shell">
      {/* Microsoft Word Dark Blue Desktop Title Bar */}
      <div className="word-titlebar no-print">
        <div className="titlebar-left">
          {/* AutoSave toggle switch */}
          <div className="autosave-toggle-container">
            <span className="autosave-label">AutoSave</span>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={autoSaveEnabled} 
                onChange={(e) => setAutoSaveEnabled(e.target.checked)} 
              />
              <span className="switch-slider round"></span>
            </label>
            {autoSaveEnabled ? <Cloud size={14} className="cloud-icon active" /> : <CloudOff size={14} className="cloud-icon" />}
          </div>

          <span className="titlebar-divider" />

          {/* Quick Access Toolbar */}
          <div className="quick-access-toolbar">
            <button onClick={() => docState.content && saveActiveFile()} className="titlebar-icon-btn" title="Save (Ctrl+S)">
              <Save size={14} />
            </button>
            <button onClick={triggerUndo} className="titlebar-icon-btn" title="Undo (Ctrl+Z)" disabled={!editor?.can().undo()}>
              <Undo size={14} />
            </button>
            <button onClick={triggerRedo} className="titlebar-icon-btn" title="Redo (Ctrl+Y)" disabled={!editor?.can().redo()}>
              <Redo size={14} />
            </button>
            <button onClick={() => window.print()} className="titlebar-icon-btn" title="Print Layout View">
              <Printer size={14} />
            </button>
          </div>
        </div>

        {/* Center: File Title */}
        <div className="titlebar-center">
          <input
            type="text"
            className="titlebar-filename-input"
            value={docState.title}
            onChange={(e) => updateTitle(e.target.value)}
            placeholder="Untitled Document"
          />
          <span className="titlebar-status-text">.docx - Saved to Device</span>
        </div>

        {/* Right: User / Windows Controls */}
        <div className="titlebar-right">
          <div className="titlebar-search-box">
            <Search size={12} className="search-icon" />
            <input type="text" placeholder="Search" />
          </div>



          <div className="window-controls">
            <button className="window-btn" title="Minimize"><Minus size={12} /></button>
            <button className="window-btn" title="Maximize"><Square size={10} /></button>
            <button className="window-btn close" title="Close"><X size={12} /></button>
          </div>
        </div>
      </div>



      {/* 1. Ribbon Menu Toolbar */}
      <Ribbon
        editor={editor}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        showRuler={showRuler}
        onShowRulerChange={setShowRuler}
        onOpenHeaderFooter={() => setShowHeaderFooter(true)}
      />

      {/* 2. Workspace & Sidebars */}
      <div className="app-main-workspace">
        {/* Main Tiptap Canvas */}
        <div className="editor-canvas-wrapper">
          <Editor
            layoutMode={layoutMode}
            showRuler={showRuler}
            onEditorReady={setEditor}
          />
          
          {/* Viewport-fixed Header & Footer settings card */}
          <HeaderFooterManager
            isOpen={showHeaderFooter}
            onClose={() => setShowHeaderFooter(false)}
          />
        </div>

        {/* Navigation / Outline sidebar */}
        <Sidebar
          editor={editor}
          isOpen={showSidebar}
        />
      </div>

      {/* 3. Bottom Status Bar */}
      <StatusBar
        editor={editor}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
      />

      {/* 4. Glassmorphic Auto-Save Recovery Alert Dialog */}
      {showRecoveryAlert && (
        <div className="recovery-alert-backdrop">
          <div className="recovery-alert-card">
            <div className="recovery-title-row">
              <AlertTriangle className="recovery-alert-icon" />
              <h3>Unsaved Changes Detected</h3>
            </div>
            <p>
              OpenWord recovered a document from your last editing session. Do you want to restore it?
            </p>
            <div className="recovery-actions">
              <button onClick={handleRestoreRecovery} className="recovery-btn-primary">
                Restore Document
              </button>
              <button onClick={handleDiscardRecovery} className="recovery-btn-secondary">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <DocumentProvider>
      <AppContent />
    </DocumentProvider>
  );
};

export default App;
