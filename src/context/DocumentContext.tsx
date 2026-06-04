import React, { createContext, useContext, useState, useEffect } from 'react';
import type { DocumentState } from '../utils/db';
import { autoSaveDocument, loadDocumentAndHydrate } from '../utils/autoSave';
import { fileSystemHelper } from '../utils/fileSystem';

interface DocumentContextType {
  docState: DocumentState;
  isSaving: boolean;
  activeFileName: string;
  isDirty: boolean;
  setDocState: React.Dispatch<React.SetStateAction<DocumentState>>;
  updateContent: (content: any) => void;
  updateTitle: (title: string) => void;
  updateMargins: (margins: DocumentState['margins']) => void;
  updatePageSize: (size: DocumentState['pageSize']) => void;
  updateOrientation: (orientation: DocumentState['orientation']) => void;
  updateHeaders: (headers: Partial<DocumentState['headers']>) => void;
  updateFooters: (footers: Partial<DocumentState['footers']>) => void;
  updateZoom: (zoom: number) => void;
  updateLayoutMode: (mode: 'pageless' | 'print') => void;
  currentPage: number;
  totalPages: number;
  updatePages: (current: number, total: number) => void;
  saveActiveFile: () => Promise<void>;
  saveAsNewFile: () => Promise<void>;
  openLocalFile: (data: { name: string; html: string; margins: any; pageSize: any; orientation: any; headers: any; footers: any }) => void;
  createNewDocument: () => void;
  restoreAutosave: () => Promise<boolean>;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const DEFAULT_DOC_STATE: DocumentState = {
  id: 'current-doc',
  title: 'Untitled Document',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: 'left' },
        content: [{ type: 'text', text: 'Welcome to OpenWord' }]
      },
      {
        type: 'paragraph',
        attrs: { textAlign: 'left' },
        content: [{ type: 'text', text: 'Start writing your document here...' }]
      }
    ]
  },
  headers: {
    default: '',
    differentFirstPage: false
  },
  footers: {
    default: '',
    differentFirstPage: false
  },
  margins: {
    top: 96,
    bottom: 96,
    left: 96,
    right: 96
  },
  orientation: 'portrait',
  pageSize: 'Letter',
  zoom: 1,
  lastSaved: Date.now()
};

// Store layout mode locally since it's user-specific screen state
const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [docState, setDocState] = useState<DocumentState>(DEFAULT_DOC_STATE);
  const [layoutMode, setLayoutMode] = useState<'pageless' | 'print'>('pageless');
  const [isSaving, setIsSaving] = useState(false);
  const [activeFileName, setActiveFileName] = useState('Untitled.docx');
  const [isDirty, setIsDirty] = useState(false);

  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('openword_autosave_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const updatePages = (current: number, total: number) => {
    setCurrentPage(current);
    setTotalPages(total);
  };

  useEffect(() => {
    localStorage.setItem('openword_autosave_enabled', autoSaveEnabled.toString());
  }, [autoSaveEnabled]);

  // Autosave loop - triggers every 5 seconds if document is dirty and autosave is enabled
  useEffect(() => {
    if (!isDirty || !autoSaveEnabled) return;
    
    const interval = setInterval(async () => {
      try {
        setIsSaving(true);
        await autoSaveDocument({
          ...docState,
          id: 'autosave-doc' // Autosave cache target key
        });
        setIsDirty(false);
      } catch (err) {
        console.error('Autosave loop execution failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [docState, isDirty]);

  const updateContent = (content: any) => {
    setDocState(prev => ({ ...prev, content }));
    setIsDirty(true);
  };

  const updateTitle = (title: string) => {
    setDocState(prev => ({ ...prev, title }));
    setActiveFileName(`${title.replace(/\.[^/.]+$/, '')}.docx`);
    setIsDirty(true);
  };

  const updateMargins = (margins: DocumentState['margins']) => {
    setDocState(prev => ({ ...prev, margins }));
    setIsDirty(true);
  };

  const updatePageSize = (pageSize: DocumentState['pageSize']) => {
    setDocState(prev => ({ ...prev, pageSize }));
    setIsDirty(true);
  };

  const updateOrientation = (orientation: DocumentState['orientation']) => {
    setDocState(prev => ({ ...prev, orientation }));
    setIsDirty(true);
  };

  const updateHeaders = (headers: Partial<DocumentState['headers']>) => {
    setDocState(prev => ({
      ...prev,
      headers: { ...prev.headers, ...headers }
    }));
    setIsDirty(true);
  };

  const updateFooters = (footers: Partial<DocumentState['footers']>) => {
    setDocState(prev => ({
      ...prev,
      footers: { ...prev.footers, ...footers }
    }));
    setIsDirty(true);
  };

  const updateZoom = (zoom: number) => {
    setDocState(prev => ({ ...prev, zoom }));
  };

  const updateLayoutMode = (mode: 'pageless' | 'print') => {
    setLayoutMode(mode);
  };

  // Quick save to active file handle using Web File System API
  const saveActiveFile = async () => {
    setIsSaving(true);
    try {
      const { exportToDocx } = await import('../utils/docxExporter');
      const blob = await exportToDocx(docState);
      
      const success = await fileSystemHelper.saveToActiveHandle(blob);
      if (success) {
        setIsDirty(false);
        // Play sound or show feedback
      } else {
        // Fall back to save as new file picker
        await saveAsNewFile();
      }
    } catch (err) {
      console.error('Quick save failed, falling back to download:', err);
      await saveAsNewFile();
    } finally {
      setIsSaving(false);
    }
  };

  // Save as a new file (Save As picker / fallback download)
  const saveAsNewFile = async () => {
    setIsSaving(true);
    try {
      const { exportToDocx } = await import('../utils/docxExporter');
      const blob = await exportToDocx(docState);
      
      const savedName = await fileSystemHelper.saveAsNewFile(blob, activeFileName, {
        types: [
          {
            description: 'Word Document (.docx)',
            accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }
          }
        ]
      });
      if (savedName) {
        setActiveFileName(savedName);
        setIsDirty(false);
      }
    } catch (err) {
      console.error('Save As new file execution failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Create new document from scratch
  const createNewDocument = () => {
    setDocState(DEFAULT_DOC_STATE);
    setActiveFileName('Untitled.docx');
    fileSystemHelper.clearHandle();
    setIsDirty(false);
  };

  // Restore autosave state if it exists in IndexedDB
  const restoreAutosave = async (): Promise<boolean> => {
    try {
      const restored = await loadDocumentAndHydrate('autosave-doc');
      if (restored) {
        setDocState({
          ...restored,
          id: 'current-doc' // Map back to active document
        });
        setActiveFileName(`${restored.title}.docx`);
        setIsDirty(false);
        return true;
      }
    } catch (err) {
      console.error('Failed to restore autosaved document:', err);
    }
    return false;
  };

  // Open imported local file
  const openLocalFile = (data: {
    name: string;
    html: string;
    margins: any;
    pageSize: any;
    orientation: any;
    headers: any;
    footers: any;
  }) => {
    const title = data.name.replace(/\.[^/.]+$/, '');
    setDocState({
      id: 'current-doc',
      title,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [] // Handled by editor.commands.setContent in the UI
          }
        ]
      },
      margins: data.margins,
      pageSize: data.pageSize,
      orientation: data.orientation,
      headers: data.headers,
      footers: data.footers,
      zoom: docState.zoom,
      lastSaved: Date.now()
    });
    setActiveFileName(data.name);
    setIsDirty(false);
  };

  return (
    <DocumentContext.Provider
      value={{
        docState,
        isSaving,
        activeFileName,
        isDirty,
        setDocState,
        updateContent,
        updateTitle,
        updateMargins,
        updatePageSize,
        updateOrientation,
        updateHeaders,
        updateFooters,
        updateZoom,
        updateLayoutMode,
        currentPage,
        totalPages,
        updatePages,
        saveActiveFile,
        saveAsNewFile,
        openLocalFile,
        createNewDocument,
        restoreAutosave,
        autoSaveEnabled,
        setAutoSaveEnabled
      }}
    >
      <div style={{ display: 'contents' }} className={layoutMode === 'print' ? 'layout-print' : 'layout-pageless'}>
        {children}
      </div>
    </DocumentContext.Provider>
  );
};

export const useDocument = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useDocument must be used within a DocumentProvider');
  }
  return context;
};
