import React, { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';

import { useDocument } from '../../context/DocumentContext';
import { PageBreakExtension } from './PageBreakExtension';
import { SearchReplaceExtension } from './SearchReplaceExtension';
import { VirtualPaginationExtension } from './VirtualPaginationExtension';
import { Ruler } from '../Ruler/Ruler';
import { useIsMobile } from '../../utils/useIsMobile';

// Custom TextStyle extension to handle inline font size attribute
const CustomTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: any) => element.style.fontSize,
        renderHTML: (attributes: any) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        }
      }
    };
  }
});

interface EditorProps {
  layoutMode: 'pageless' | 'print';
  showRuler: boolean;
  onEditorReady: (editor: any) => void;
}

export const Editor: React.FC<EditorProps> = ({
  layoutMode,
  showRuler,
  onEditorReady
}) => {
  const { docState, updateContent, saveActiveFile, totalPages, updatePages } = useDocument();
  const { zoom, pageSize, orientation } = docState;
  const isMobile = useIsMobile();

  const posPagesRef = useRef<{ pos: number; page: number }[]>([]);
  const totalPagesRef = useRef(1);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const lastLoadedDocIdRef = useRef<string | null>(null);

  const extensions = useMemo(() => [
    StarterKit.configure({
      // Use custom styling for code blocks and rules
      horizontalRule: false, 
      underline: false,
      link: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'editor-link' }
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Image.configure({
      allowBase64: true,
      HTMLAttributes: { class: 'editor-image' }
    }),
    CustomTextStyle,
    FontFamily,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    PageBreakExtension,
    SearchReplaceExtension,
    VirtualPaginationExtension.configure({
      headers: docState.headers,
      footers: docState.footers
    }),
  ], []);

  const editor = useEditor({
    extensions,
    content: docState.content,
    onUpdate: ({ editor }) => {
      // Commit Tiptap JSON content state to our global document context
      updateContent(editor.getJSON());
    },
    onFocus: ({ editor }) => {
      const text = editor.getText().trim().replace(/\s+/g, ' ');
      if (text === 'Welcome to OpenWord Start writing your document here...') {
        editor.commands.clearContent(true);
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const selectionPos = editor.state.selection.from;
      let currPage = 1;
      const posPages = posPagesRef.current;
      for (let i = 0; i < posPages.length; i++) {
        if (selectionPos >= posPages[i].pos) {
          currPage = posPages[i].page;
        } else {
          break;
        }
      }
      updatePages(currPage, totalPagesRef.current);
    }
  });

  // Listen to pagination updates to update posPages and totalPages refs
  useEffect(() => {
    const handlePaginationUpdate = (e: Event) => {
      const { totalPages: total, posPages } = (e as CustomEvent).detail;
      posPagesRef.current = posPages;
      totalPagesRef.current = total;

      const activeEditor = editorRef.current;
      if (activeEditor) {
        const selectionPos = activeEditor.state.selection.from;
        let currPage = 1;
        for (let i = 0; i < posPages.length; i++) {
          if (selectionPos >= posPages[i].pos) {
            currPage = posPages[i].page;
          } else {
            break;
          }
        }
        updatePages(currPage, total);
      } else {
        updatePages(1, total);
      }
    };

    document.addEventListener('openword-pagination-update', handlePaginationUpdate);
    return () => {
      document.removeEventListener('openword-pagination-update', handlePaginationUpdate);
    };
  }, [updatePages]);

  // Synchronize headers and footers dynamically
  useEffect(() => {
    if (editor) {
      editor.setOptions({
        virtualPagination: {
          headers: docState.headers,
          footers: docState.footers
        }
      } as any);
      // Force trigger view redraw to sync decorations text
      editor.view.dispatch(editor.view.state.tr);
    }
  }, [docState.headers, docState.footers, editor]);

  // Handle viewport scroll tracking in print mode
  useEffect(() => {
    const scrollContainer = workspaceRef.current;
    if (!scrollContainer || layoutMode !== 'print') return;

    const handleScroll = () => {
      const activeEditor = editorRef.current;
      if (!activeEditor || !activeEditor.view) return;

      const editorEl = activeEditor.view.dom;
      const children = editorEl.children;
      const containerRect = scrollContainer.getBoundingClientRect();
      
      let topChild: Element | null = null;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (rect.bottom > containerRect.top + 80) {
          topChild = children[i];
          break;
        }
      }

      if (topChild) {
        try {
          const pos = activeEditor.view.posAtDOM(topChild, 0);
          let currPage = 1;
          const posPages = posPagesRef.current;
          for (let i = 0; i < posPages.length; i++) {
            if (pos >= posPages[i].pos) {
              currPage = posPages[i].page;
            } else {
              break;
            }
          }
          updatePages(currPage, totalPagesRef.current);
        } catch (e) {
          // Ignore posAtDOM errors during mutations
        }
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    // Initial check
    handleScroll();

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [layoutMode, updatePages]);

  // Expose editor instance back to parent (App.tsx)
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Synchronize Content when switching documents
  useEffect(() => {
    if (editor && docState.content) {
      if (docState.id !== lastLoadedDocIdRef.current) {
        lastLoadedDocIdRef.current = docState.id;
        const json = docState.content;
        if (json.type === 'doc') {
          editor.commands.setContent(json, { emitUpdate: false });
        }
      }
    }
  }, [docState.id, docState.content, editor]);

  // Listen for Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveActiveFile]);

  if (!editor) return null;

  // Calculate dimensions for simulated pages (matches ruler)
  const isLandscape = orientation === 'landscape';
  const width = pageSize === 'Letter' 
    ? (isLandscape ? 1056 : 816) 
    : (isLandscape ? 1123 : 794);

  return (
    <div 
      ref={workspaceRef}
      className={`editor-workspace-container ${isMobile ? 'mobile-mode pageless-mode' : (layoutMode === 'print' ? 'print-mode' : 'pageless-mode')}`}
    >
      {/* Visual top ruler matching document scale - Hidden on Mobile */}
      {layoutMode === 'print' && showRuler && !isMobile && <Ruler />}

      {/* Editor zooming framework - Bypassed on Mobile */}
      <div 
        className="editor-zoom-wrapper"
        style={{
          transform: isMobile ? 'none' : `scale(${zoom})`,
          transformOrigin: 'top center',
          width: (layoutMode === 'print' && !isMobile) ? `${width}px` : '100%',
        }}
      >
        <div 
          className="editor-sheet-canvas"
          style={{
            width: (layoutMode === 'print' && !isMobile) ? `${width}px` : '100%',
            paddingTop: (layoutMode === 'print' && !isMobile) ? 'var(--page-margin-top)' : '20px',
            paddingBottom: (layoutMode === 'print' && !isMobile) ? 'var(--page-margin-bottom)' : '20px',
            paddingLeft: (layoutMode === 'print' && !isMobile) ? 'var(--page-margin-left)' : (isMobile ? '16px' : 'max(40px, calc((100% - 800px) / 2))'),
            paddingRight: (layoutMode === 'print' && !isMobile) ? 'var(--page-margin-right)' : (isMobile ? '16px' : 'max(40px, calc((100% - 800px) / 2))'),
          }}
        >
          {/* Header visual indicator - Hidden on Mobile */}
          {layoutMode === 'print' && !isMobile && docState.headers.default && (
            <div 
              className="editor-header-overlay"
              style={{
                left: 'var(--page-margin-left)',
                right: 'var(--page-margin-right)',
                top: 'calc(var(--page-margin-top) / 2 - 10px)'
              }}
            >
              {docState.headers.default}
            </div>
          )}

          {/* Core Tiptap Content area */}
          <EditorContent editor={editor} />

          {/* Footer visual indicator - Hidden on Mobile */}
          {layoutMode === 'print' && !isMobile && (docState.footers.default || totalPages) && (
            <div 
              className="editor-footer-overlay"
              style={{
                left: 'var(--page-margin-left)',
                right: 'var(--page-margin-right)',
                bottom: 'calc(var(--page-margin-bottom) / 2 - 10px)'
              }}
            >
              <span>{docState.footers.default}</span>
              <span>{totalPages}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
