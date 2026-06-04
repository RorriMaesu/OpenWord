import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Undo, Redo,
  Table as TableIcon, Trash2, Plus, Minus, Type, Link as LinkIcon
} from 'lucide-react';

interface MobileFormatterProps {
  editor: Editor | null;
}

export const MobileFormatter: React.FC<MobileFormatterProps> = ({ editor }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTableFocused, setIsTableFocused] = useState(false);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      setIsTableFocused(editor.isActive('table'));
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor]);

  useEffect(() => {
    const handleViewportChange = () => {
      const vv = window.visualViewport;
      if (vv && containerRef.current) {
        // Calculate offset bottom to sit exactly on top of mobile keyboard
        const offsetBottom = window.innerHeight - vv.height - vv.offsetTop;
        containerRef.current.style.bottom = `${Math.max(0, offsetBottom)}px`;
      }
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', handleViewportChange);
      vv.addEventListener('scroll', handleViewportChange);
      // Run once initially
      handleViewportChange();
    }

    return () => {
      if (vv) {
        vv.removeEventListener('resize', handleViewportChange);
        vv.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

  if (!editor) return null;

  const preventFocusLoss = (e: React.MouseEvent | React.TouchEvent, action: () => void) => {
    e.preventDefault();
    action();
  };

  const setHeadingStyle = (level: 1 | 2 | 'paragraph') => {
    if (level === 'paragraph') {
      editor.chain().focus().setParagraph().setFontSize('16px').run();
    } else {
      editor.chain().focus().setHeading({ level }).setFontSize(level === 1 ? '24px' : '18px').run();
    }
  };

  const handleInsertLink = () => {
    const url = prompt('Enter Hyperlink URL:', 'https://');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div ref={containerRef} className="mobile-formatter-container no-print">
      {/* 1. Contextual Table Toolbar (Displays only when cursor is inside a table) */}
      {isTableFocused && (
        <div className="mobile-formatter-subrow contextual-table-row">
          <button
            onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().addRowBefore().run())}
            onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().addRowBefore().run())}
            className="mobile-tool-btn sub-btn"
            title="Add Row Above"
          >
            <Plus size={12} /><span>Row Above</span>
          </button>
          <button
            onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().addRowAfter().run())}
            onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().addRowAfter().run())}
            className="mobile-tool-btn sub-btn"
            title="Add Row Below"
          >
            <Plus size={12} /><span>Row Below</span>
          </button>
          <button
            onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().addColumnBefore().run())}
            onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().addColumnBefore().run())}
            className="mobile-tool-btn sub-btn"
            title="Add Column Left"
          >
            <Plus size={12} /><span>Col Left</span>
          </button>
          <button
            onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().addColumnAfter().run())}
            onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().addColumnAfter().run())}
            className="mobile-tool-btn sub-btn"
            title="Add Column Right"
          >
            <Plus size={12} /><span>Col Right</span>
          </button>
          <button
            onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().deleteRow().run())}
            onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().deleteRow().run())}
            className="mobile-tool-btn sub-btn text-danger"
            title="Delete Row"
          >
            <Minus size={12} /><span>Del Row</span>
          </button>
          <button
            onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().deleteColumn().run())}
            onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().deleteColumn().run())}
            className="mobile-tool-btn sub-btn text-danger"
            title="Delete Column"
          >
            <Minus size={12} /><span>Del Col</span>
          </button>
          <button
            onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().deleteTable().run())}
            onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().deleteTable().run())}
            className="mobile-tool-btn sub-btn text-danger"
            title="Delete Table"
          >
            <Trash2 size={12} /><span>Del Table</span>
          </button>
        </div>
      )}

      {/* 2. Core Formatting Toolbar Row */}
      <div className="mobile-formatter-mainrow">
        {/* Undo/Redo */}
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().undo().run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().undo().run())}
          disabled={!editor.can().undo()}
          className="mobile-tool-btn"
        >
          <Undo size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().redo().run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().redo().run())}
          disabled={!editor.can().redo()}
          className="mobile-tool-btn"
        >
          <Redo size={16} />
        </button>

        <span className="mobile-tool-divider" />

        {/* Text Formats */}
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleBold().run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleBold().run())}
          className={`mobile-tool-btn ${editor.isActive('bold') ? 'active' : ''}`}
        >
          <Bold size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleItalic().run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleItalic().run())}
          className={`mobile-tool-btn ${editor.isActive('italic') ? 'active' : ''}`}
        >
          <Italic size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleUnderline().run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleUnderline().run())}
          className={`mobile-tool-btn ${editor.isActive('underline') ? 'active' : ''}`}
        >
          <Underline size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleStrike().run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleStrike().run())}
          className={`mobile-tool-btn ${editor.isActive('strike') ? 'active' : ''}`}
        >
          <Strikethrough size={16} />
        </button>

        <span className="mobile-tool-divider" />

        {/* Headings */}
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => setHeadingStyle('paragraph'))}
          onTouchStart={(e) => preventFocusLoss(e, () => setHeadingStyle('paragraph'))}
          className={`mobile-tool-btn ${editor.isActive('paragraph') ? 'active' : ''}`}
        >
          <Type size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => setHeadingStyle(1))}
          onTouchStart={(e) => preventFocusLoss(e, () => setHeadingStyle(1))}
          className={`mobile-tool-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
        >
          <span style={{ fontWeight: 'bold', fontSize: '11px' }}>H1</span>
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => setHeadingStyle(2))}
          onTouchStart={(e) => preventFocusLoss(e, () => setHeadingStyle(2))}
          className={`mobile-tool-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
        >
          <span style={{ fontWeight: 'bold', fontSize: '11px' }}>H2</span>
        </button>

        <span className="mobile-tool-divider" />

        {/* Alignments */}
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().setTextAlign('left').run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().setTextAlign('left').run())}
          className={`mobile-tool-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
        >
          <AlignLeft size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().setTextAlign('center').run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().setTextAlign('center').run())}
          className={`mobile-tool-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
        >
          <AlignCenter size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().setTextAlign('right').run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().setTextAlign('right').run())}
          className={`mobile-tool-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
        >
          <AlignRight size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().setTextAlign('justify').run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().setTextAlign('justify').run())}
          className={`mobile-tool-btn ${editor.isActive({ textAlign: 'justify' }) ? 'active' : ''}`}
        >
          <AlignJustify size={16} />
        </button>

        <span className="mobile-tool-divider" />

        {/* Lists */}
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleBulletList().run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleBulletList().run())}
          className={`mobile-tool-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
        >
          <List size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleOrderedList().run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().toggleOrderedList().run())}
          className={`mobile-tool-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
        >
          <ListOrdered size={16} />
        </button>

        <span className="mobile-tool-divider" />

        {/* Insert Elements */}
        <button
          onMouseDown={(e) => preventFocusLoss(e, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          onTouchStart={(e) => preventFocusLoss(e, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          className="mobile-tool-btn"
          title="Insert Table"
        >
          <TableIcon size={16} />
        </button>
        <button
          onMouseDown={(e) => preventFocusLoss(e, handleInsertLink)}
          onTouchStart={(e) => preventFocusLoss(e, handleInsertLink)}
          className={`mobile-tool-btn ${editor.isActive('link') ? 'active' : ''}`}
          title="Insert Link"
        >
          <LinkIcon size={16} />
        </button>
      </div>
    </div>
  );
};
