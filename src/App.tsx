import React, { useState, useEffect, useRef } from 'react';
import { DocumentProvider, useDocument } from './context/DocumentContext';
import { Ribbon } from './components/Ribbon/Ribbon';
import { Editor } from './components/Editor/Editor';
import { Sidebar } from './components/Sidebar/Sidebar';
import { StatusBar } from './components/StatusBar/StatusBar';
import { HeaderFooterManager } from './components/Editor/HeaderFooterManager';
import { Editor as TiptapEditor } from '@tiptap/react';
import { AlertTriangle, Undo, Redo, Save, Printer, Search, Minus, Square, X, Cloud, CloudOff, Coffee, Sparkles, ArrowLeft, Check, RefreshCw, Menu } from 'lucide-react';
import { getDocument, deleteDocument } from './utils/db';
import './App.css';
import { TutorialTour } from './components/Tutorial/TutorialTour';
import { useIsMobile } from './utils/useIsMobile';
import { MobileFormatter } from './components/MobileFormatter';

const AppContent: React.FC = () => {
  const { 
    docState, 
    updateTitle, 
    saveActiveFile, 
    restoreAutosave, 
    updateLayoutMode,
    autoSaveEnabled,
    setAutoSaveEnabled,
    createNewDocument,
    saveAsNewFile,
    openLocalFile,
    isSaving,
    isDirty
  } = useDocument();
  
  // Editor instance reference
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const isMobile = useIsMobile();

  // App Layout options
  const [layoutMode, setLayoutMode] = useState<'pageless' | 'print'>(() => {
    const saved = localStorage.getItem('openword_layout_mode');
    return (saved as 'pageless' | 'print') || 'print';
  });
  const [showRuler, setShowRuler] = useState<boolean>(() => {
    const saved = localStorage.getItem('openword_show_ruler');
    return saved !== null ? saved === 'true' : true;
  });
  const [showSidebar, setShowSidebar] = useState<boolean>(() => {
    const isMobileSize = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    return !isMobileSize;
  });
  const [showHeaderFooter, setShowHeaderFooter] = useState(false);

  // Onboarding Tutorial states
  const [isTourOpen, setIsTourOpen] = useState<boolean>(() => {
    return localStorage.getItem('openword_onboarding_completed') !== 'true';
  });
  const [sidebarTab, setSidebarTab] = useState<'outline' | 'search' | 'properties' | 'copilot'>(() => {
    const saved = localStorage.getItem('openword_sidebar_tab');
    return (saved as any) || 'outline';
  });

  // File input ref for mobile import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Force sidebar to be open during the onboarding tour
  useEffect(() => {
    if (isTourOpen) {
      setShowSidebar(true);
    }
  }, [isTourOpen]);

  // Autosave Recovery dialog visibility
  const [showRecoveryAlert, setShowRecoveryAlert] = useState(false);

  // Mobile Save Status Toast
  const [statusToast, setStatusToast] = useState<string | null>(null);

  useEffect(() => {
    if (!statusToast) return;
    const timer = setTimeout(() => {
      setStatusToast(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [statusToast]);

  const triggerStatusToast = () => {
    const msg = isSaving 
      ? 'Autosaving changes to device...' 
      : isDirty 
        ? 'Unsaved changes locally' 
        : 'All changes saved to device';
    setStatusToast(msg);
  };


  // Sync theme from localStorage on startup
  useEffect(() => {
    const savedTheme = localStorage.getItem('openword_theme') || 'light';
    document.body.parentElement?.setAttribute('data-theme', savedTheme);
  }, []);

  // Sync app-shell height with the visual viewport so the grid shrinks when the virtual keyboard opens.
  // The position:fixed on body (index.css) prevents layout viewport scrolling; this hook handles height.
  useEffect(() => {
    if (!isMobile) return;

    const syncHeight = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      document.documentElement.style.setProperty('--app-height', `${vv.height}px`);
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', syncHeight);
      syncHeight();
    }

    return () => {
      if (vv) {
        vv.removeEventListener('resize', syncHeight);
      }
      document.documentElement.style.removeProperty('--app-height');
    };
  }, [isMobile]);

  // Sync layout mode to localStorage & DocumentContext
  useEffect(() => {
    localStorage.setItem('openword_layout_mode', layoutMode);
    updateLayoutMode(layoutMode);
  }, [layoutMode, updateLayoutMode]);

  // Sync showRuler to localStorage
  useEffect(() => {
    localStorage.setItem('openword_show_ruler', showRuler.toString());
  }, [showRuler]);

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

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (extension === 'docx') {
        const { importDocx } = await import('./utils/docxImporter');
        const buffer = await file.arrayBuffer();
        const res = await importDocx(buffer);
        
        openLocalFile({
          name: file.name,
          html: res.html,
          margins: res.margins,
          pageSize: res.pageSize,
          orientation: res.orientation,
          headers: res.headers,
          footers: docState.footers
        });
        
        editor?.commands.setContent(res.html);
      } else if (extension === 'md' || extension === 'markdown') {
        const { markdownToHtml } = await import('./utils/markdownConverter');
        const text = await file.text();
        const html = markdownToHtml(text);
        
        openLocalFile({
          name: file.name,
          html,
          margins: { top: 96, bottom: 96, left: 96, right: 96 },
          pageSize: 'Letter',
          orientation: 'portrait',
          headers: { default: '', differentFirstPage: false },
          footers: { default: '', differentFirstPage: false }
        });
        
        editor?.commands.setContent(html);
      } else if (extension === 'txt') {
        const text = await file.text();
        const html = text.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
        
        openLocalFile({
          name: file.name,
          html,
          margins: { top: 96, bottom: 96, left: 96, right: 96 },
          pageSize: 'Letter',
          orientation: 'portrait',
          headers: { default: '', differentFirstPage: false },
          footers: { default: '', differentFirstPage: false }
        });
        
        editor?.commands.setContent(html);
      } else if (extension === 'html' || extension === 'htm') {
        const html = await file.text();
        
        openLocalFile({
          name: file.name,
          html,
          margins: { top: 96, bottom: 96, left: 96, right: 96 },
          pageSize: 'Letter',
          orientation: 'portrait',
          headers: { default: '', differentFirstPage: false },
          footers: { default: '', differentFirstPage: false }
        });
        
        editor?.commands.setContent(html);
      }
    } catch (err) {
      console.error('Failed to import file on mobile:', err);
    }
  };

  const triggerUndo = () => editor?.commands.undo();
  const triggerRedo = () => editor?.commands.redo();

  return (
    <div className="app-shell">
      {/* Microsoft Word Title Bar (Desktop or Mobile) */}
      {isMobile ? (
        <div className="word-titlebar mobile-header no-print">
          <div className="titlebar-left">
            {/* Gnosys Hub Back Button */}
            <a 
              href={window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000/' : '../Gnosys-AI/'} 
              className="titlebar-back-btn" 
              title="Back to Gnosys Study Hub"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                marginRight: '8px',
                transition: 'background-color 0.2s',
                textDecoration: 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-color)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ArrowLeft size={16} />
            </a>
            <div className="app-brand-logo" onClick={createNewDocument} title="New Document">
              <svg viewBox="0 0 24 24" className="app-logo-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0078d4" />
                    <stop offset="100%" stopColor="#00b4fc" />
                  </linearGradient>
                </defs>
                <path d="M16 2H8C5.79086 2 4 3.79086 4 6V18C4 20.2091 5.79086 22 8 22H16C18.2091 22 20 20.2091 20 18V6C20 3.79086 18.2091 2 16 2Z" fill="url(#logo-grad)" />
                <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="1.8" strokeDasharray="24 6" strokeLinecap="round" />
                <path d="M9.5 10L11 14L12 12L13 14L14.5 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <select
              className="mobile-file-menu-select"
              value=""
              onChange={async (e) => {
                const action = e.target.value;
                if (action === 'new') createNewDocument();
                else if (action === 'open') fileInputRef.current?.click();
                else if (action === 'save') await saveActiveFile();
                else if (action === 'saveas') await saveAsNewFile();
                else if (action === 'print') window.print();
                else if (action === 'headerfooter') setShowHeaderFooter(true);
                e.target.value = ''; // Reset select element value
              }}
            >
              <option value="" disabled hidden>File</option>
              <option value="new">New Doc</option>
              <option value="open">Import File...</option>
              <option value="save">Save</option>
              <option value="saveas">Save As...</option>
              <option value="print">Print / PDF</option>
              <option value="headerfooter">Header & Footer Settings...</option>
            </select>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".docx,.md,.markdown,.txt,.html,.htm"
              onChange={handleImportFile}
            />
          </div>

          <div className="titlebar-center">
            <div className="mobile-title-container">
              <input
                type="text"
                className="titlebar-filename-input"
                value={docState.title}
                onChange={(e) => updateTitle(e.target.value)}
                placeholder="Untitled Document"
              />
              <div 
                className={`mobile-cloud-status ${isSaving ? 'saving' : ''}`} 
                title={isSaving ? 'Autosaving...' : isDirty ? 'Unsaved edits' : 'Saved to device'}
                onClick={triggerStatusToast}
                style={{ cursor: 'pointer' }}
              >
                {isSaving ? (
                  <RefreshCw size={12} className="spin-icon" />
                ) : isDirty ? (
                  <CloudOff size={12} className="cloud-dirty" />
                ) : (
                  <Check size={12} className="cloud-clean" />
                )}
              </div>
            </div>
          </div>

          <div className="titlebar-right mobile-header-actions">
            <button
              onClick={() => {
                if (showSidebar && sidebarTab === 'search') {
                  setShowSidebar(false);
                } else {
                  setSidebarTab('search');
                  setShowSidebar(true);
                }
              }}
              className={`titlebar-icon-btn ${showSidebar && sidebarTab === 'search' ? 'active' : ''}`}
              title="Find & Replace"
            >
              <Search size={16} />
            </button>
            <button
              onClick={() => {
                if (showSidebar && sidebarTab === 'copilot') {
                  setShowSidebar(false);
                } else {
                  setSidebarTab('copilot');
                  setShowSidebar(true);
                }
              }}
              className={`titlebar-icon-btn ${showSidebar && sidebarTab === 'copilot' ? 'active' : ''}`}
              title="AI Copilot"
            >
              <Sparkles size={16} />
            </button>
            <button
              onClick={() => {
                if (showSidebar) {
                  setShowSidebar(false);
                } else {
                  setShowSidebar(true);
                }
              }}
              className={`titlebar-icon-btn ${showSidebar && sidebarTab !== 'search' && sidebarTab !== 'copilot' ? 'active' : ''}`}
              title="Menu"
            >
              <Menu size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="word-titlebar no-print">
          <div className="titlebar-left">
            {/* Gnosys Hub Back Button */}
            <a 
              href={window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000/' : '../Gnosys-AI/'} 
              className="titlebar-back-btn" 
              title="Back to Gnosys Study Hub"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                marginRight: '8px',
                transition: 'background-color 0.2s',
                textDecoration: 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-color)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ArrowLeft size={16} />
            </a>
            {/* App Branding Logo */}
            <div className="app-brand-logo" title="OpenWord desktop application">
              <svg viewBox="0 0 24 24" className="app-logo-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0078d4" />
                    <stop offset="100%" stopColor="#00b4fc" />
                  </linearGradient>
                </defs>
                <path d="M16 2H8C5.79086 2 4 3.79086 4 6V18C4 20.2091 5.79086 22 8 22H16C18.2091 22 20 20.2091 20 18V6C20 3.79086 18.2091 2 16 2Z" fill="url(#logo-grad)" />
                <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="1.8" strokeDasharray="24 6" strokeLinecap="round" />
                <path d="M9.5 10L11 14L12 12L13 14L14.5 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="app-brand-name">OpenWord</span>
            </div>

            <span className="titlebar-divider" />

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
            <a 
              href="https://buymeacoffee.com/rorrimaesu" 
              target="_blank" 
              rel="noopener noreferrer"
              className="titlebar-support-btn"
              title="Support OpenWord / Buy Me a Coffee"
            >
              <Coffee size={12} className="coffee-icon" />
              <span>Support</span>
            </a>

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
      )}

      {/* 1. Ribbon Menu Toolbar */}
      {!isMobile && (
        <Ribbon
          editor={editor}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          showRuler={showRuler}
          onShowRulerChange={setShowRuler}
          onOpenHeaderFooter={() => setShowHeaderFooter(true)}
          onRelaunchTour={() => setIsTourOpen(true)}
        />
      )}

      {/* 2. Workspace & Sidebars */}
      <div className={`app-main-workspace ${isMobile ? 'mobile-workspace' : ''} ${showSidebar ? 'sidebar-open' : 'sidebar-closed'}`}>
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
          onClose={() => setShowSidebar(false)}
          activeTab={sidebarTab}
          setActiveTab={setSidebarTab}
        />
      </div>

      {/* 3. Bottom Status Bar */}
      {!isMobile && (
        <StatusBar
          editor={editor}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
        />
      )}

      {/* Mobile Bottom Formatter Toolbar */}
      {isMobile && (
        <MobileFormatter
          editor={editor}
          onOpenHeaderFooter={() => setShowHeaderFooter(true)}
        />
      )}

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

      {/* 5. Interactive Animated Tour Overlay */}
      <TutorialTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        setSidebarTab={setSidebarTab}
      />

      {/* Floating Status Toast Pill */}
      {statusToast && (
        <div className="status-toast no-print">
          {statusToast}
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
