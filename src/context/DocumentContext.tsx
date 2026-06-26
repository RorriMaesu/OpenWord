import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  openDocumentById: (id: string) => Promise<void>;
  deleteDocumentById: (id: string) => Promise<void>;
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

  const updatePages = useCallback((current: number, total: number) => {
    setCurrentPage(current);
    setTotalPages(total);
  }, []);

  useEffect(() => {
    localStorage.setItem('openword_autosave_enabled', autoSaveEnabled.toString());
  }, [autoSaveEnabled]);

  // Load last active document or legacy autosave on startup
  useEffect(() => {
    const initDocument = async () => {
      try {
        const activeId = localStorage.getItem('openword_active_doc_id');
        if (activeId) {
          const doc = await loadDocumentAndHydrate(activeId);
          if (doc) {
            setDocState(doc);
            setActiveFileName(`${doc.title}.docx`);
            setIsDirty(false);
            return;
          }
        }
        
        // Fallback for legacy document autosave compatibility
        const legacyDoc = await loadDocumentAndHydrate('autosave-doc');
        if (legacyDoc) {
          const newId = `doc_${Date.now()}`;
          const migratedDoc = { ...legacyDoc, id: newId };
          setDocState(migratedDoc);
          setActiveFileName(`${legacyDoc.title}.docx`);
          localStorage.setItem('openword_active_doc_id', newId);
          await autoSaveDocument(migratedDoc);
          const { deleteDocument } = await import('../utils/db');
          await deleteDocument('autosave-doc');
          setIsDirty(false);
        } else {
          // Initialize first default document
          const newId = `doc_${Date.now()}`;
          const newDoc = { ...DEFAULT_DOC_STATE, id: newId };
          setDocState(newDoc);
          localStorage.setItem('openword_active_doc_id', newId);
          await autoSaveDocument(newDoc);
          setIsDirty(false);
        }
      } catch (err) {
        console.error('Failed to initialize local documents:', err);
      }
    };
    initDocument();
  }, []);

  // Autosave loop - triggers every 5 seconds if document is dirty and autosave is enabled
  useEffect(() => {
    if (!isDirty || !autoSaveEnabled || !docState.id || docState.id === 'current-doc') return;
    
    const interval = setInterval(async () => {
      try {
        setIsSaving(true);
        await autoSaveDocument(docState);
        setIsDirty(false);
      } catch (err) {
        console.error('Autosave loop execution failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [docState, isDirty, autoSaveEnabled]);

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
      } else {
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
    const newId = `doc_${Date.now()}`;
    const newDoc = {
      ...DEFAULT_DOC_STATE,
      id: newId,
      title: 'Untitled Document'
    };
    setDocState(newDoc);
    setActiveFileName('Untitled.docx');
    localStorage.setItem('openword_active_doc_id', newId);
    fileSystemHelper.clearHandle();
    setIsDirty(true); // triggers save
  };

  // Restore autosave state if it exists in IndexedDB
  const restoreAutosave = async (): Promise<boolean> => {
    try {
      const restored = await loadDocumentAndHydrate('autosave-doc');
      if (restored) {
        const newId = `doc_${Date.now()}`;
        setDocState({
          ...restored,
          id: newId
        });
        setActiveFileName(`${restored.title}.docx`);
        localStorage.setItem('openword_active_doc_id', newId);
        setIsDirty(false);
        return true;
      }
    } catch (err) {
      console.error('Failed to restore autosaved document:', err);
    }
    return false;
  };

  // Open an existing document by its ID
  const openDocumentById = async (id: string) => {
    try {
      setIsSaving(true);
      // Auto-save currently active document if dirty
      if (isDirty && docState.id && docState.id !== 'current-doc') {
        await autoSaveDocument(docState);
      }
      
      const doc = await loadDocumentAndHydrate(id);
      if (doc) {
        setDocState(doc);
        setActiveFileName(`${doc.title}.docx`);
        localStorage.setItem('openword_active_doc_id', id);
        fileSystemHelper.clearHandle();
        setIsDirty(false);
      }
    } catch (err) {
      console.error('Failed to open document:', id, err);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete a document by its ID
  const deleteDocumentById = async (id: string) => {
    try {
      const { deleteDocument } = await import('../utils/db');
      await deleteDocument(id);
      
      // If we deleted the currently active document, switch to another or new
      const activeId = localStorage.getItem('openword_active_doc_id');
      if (activeId === id) {
        const { getAllDocuments } = await import('../utils/db');
        const remaining = await getAllDocuments();
        const nextDoc = remaining.find(d => d.id !== id);
        if (nextDoc) {
          await openDocumentById(nextDoc.id);
        } else {
          createNewDocument();
        }
      }
    } catch (err) {
      console.error('Failed to delete document:', id, err);
    }
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
    const newId = `doc_${Date.now()}`;
    setDocState({
      id: newId,
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
    localStorage.setItem('openword_active_doc_id', newId);
    setIsDirty(true);
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
        openDocumentById,
        deleteDocumentById,
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
