import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Undo, Redo,
  Table as TableIcon, Trash2, Plus, Minus, Link as LinkIcon,
  X, ChevronUp, Image as ImageIcon, FileText
} from 'lucide-react';
import { useDocument } from '../context/DocumentContext';

interface MobileFormatterProps {
  editor: Editor | null;
  onOpenHeaderFooter: () => void;
}

const TEXT_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Charcoal', value: '#333333' },
  { name: 'Gray', value: '#595959' },
  { name: 'Red', value: '#d13438' },
  { name: 'Orange', value: '#d83b01' },
  { name: 'Green', value: '#107c41' },
  { name: 'Blue', value: '#0078d4' },
  { name: 'Purple', value: '#b4009e' },
  { name: 'Navy', value: '#002060' },
  { name: 'Wine', value: '#a4262c' }
];

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#ffff00' },
  { name: 'Bright Green', value: '#00ff00' },
  { name: 'Cyan', value: '#00ffff' },
  { name: 'Magenta', value: '#ff00ff' },
  { name: 'Pink', value: '#ffc0cb' },
  { name: 'Light Orange', value: '#ffebcc' },
  { name: 'Light Blue', value: '#d2e9f9' },
  { name: 'Light Green', value: '#e2f0d9' },
  { name: 'Light Gray', value: '#e2e2e2' },
  { name: 'None (Transparent)', value: 'transparent' }
];

export const MobileFormatter: React.FC<MobileFormatterProps> = ({ editor, onOpenHeaderFooter }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileImageInputRef = useRef<HTMLInputElement>(null);
  const [isTableFocused, setIsTableFocused] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [activeSheetTab, setActiveSheetTab] = useState<'text' | 'paragraph' | 'layout' | 'insert'>('text');

  const [touchStartX, setTouchStartX] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only track swipe if it's on sheet body (not inside a scrollable dropdown or horizontal swatch grid)
    const target = e.target as HTMLElement;
    if (target.closest('.color-swatch-grid') || target.closest('select')) return;
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartX) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchEndX - touchStartX;
    setTouchStartX(0); // Reset

    // Swipe threshold of 60px
    if (Math.abs(diffX) > 60) {
      const tabs: ('text' | 'paragraph' | 'layout' | 'insert')[] = ['text', 'paragraph', 'layout', 'insert'];
      const currentIndex = tabs.indexOf(activeSheetTab);

      if (diffX > 0 && currentIndex > 0) {
        // Swipe right -> select previous tab
        setActiveSheetTab(tabs[currentIndex - 1]);
      } else if (diffX < 0 && currentIndex < tabs.length - 1) {
        // Swipe left -> select next tab
        setActiveSheetTab(tabs[currentIndex + 1]);
      }
    }
  };

  const {
    docState,
    updateMargins,
    updatePageSize,
    updateOrientation
  } = useDocument();

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

  const runCommand = (command: (chain: any) => any) => {
    if (!editor) return;
    command(editor.chain().focus()).run();

    // Refocus after the browser's touch/mouse event loop finishes 
    // to override any focus shift caused by the user releasing the button.
    setTimeout(() => {
      if (editor && !editor.isFocused) {
        editor.commands.focus();
      }
    }, 20);
  };

  const setHeadingStyle = (level: 1 | 2 | 3 | 'paragraph') => {
    if (level === 'paragraph') {
      runCommand(chain => chain.setParagraph().setFontSize('16px'));
    } else {
      runCommand(chain => chain.setHeading({ level }).setFontSize(level === 1 ? '24px' : level === 2 ? '18px' : '14px'));
    }
  };

  const handleInsertLink = () => {
    const url = prompt('Enter Hyperlink URL:', 'https://');
    if (url) {
      runCommand(chain => chain.setLink({ href: url }));
    }
  };

  const getWordCount = () => {
    if (!editor) return 0;
    const text = editor.getText();
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  };

  const getActiveFontSize = () => {
    const attrs = editor.getAttributes('textStyle');
    if (attrs && attrs.fontSize) {
      const parsed = parseInt(attrs.fontSize, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return 16; // default size
  };

  const handleFontSizeChange = (amount: number) => {
    const current = getActiveFontSize();
    const nextSize = Math.max(8, Math.min(72, current + amount));
    runCommand(chain => chain.setFontSize(`${nextSize}px`));
  };

  const handleFontChange = async (fontName: string) => {
    if (['Inter', 'Lora', 'Fira Code', 'Playfair Display', 'Roboto', 'Outfit'].includes(fontName)) {
      try {
        const fontId = `gfont-${fontName.toLowerCase().replace(/\s+/g, '-')}`;
        if (!document.getElementById(fontId)) {
          const link = document.createElement('link');
          link.id = fontId;
          link.rel = 'stylesheet';
          link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:wght@300;400;500;600;700&display=swap`;
          document.head.appendChild(link);
          await document.fonts.load(`1em ${fontName}`);
        }
      } catch (err) {
        console.error('Failed to load Google Font asynchronously on mobile:', err);
      }
    }
    runCommand(chain => chain.setFontFamily(fontName));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          runCommand(chain => chain.setImage({ src: reader.result }));
          setIsBottomSheetOpen(false); // Close drawer after insertion
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const executeCoreCommand = (command: string) => {
    if (!editor) return;
    switch (command) {
      case 'undo':
        runCommand(chain => chain.undo());
        break;
      case 'redo':
        runCommand(chain => chain.redo());
        break;
      case 'bold':
        runCommand(chain => chain.toggleBold());
        break;
      case 'italic':
        runCommand(chain => chain.toggleItalic());
        break;
      case 'underline':
        runCommand(chain => chain.toggleUnderline());
        break;
      case 'strike':
        runCommand(chain => chain.toggleStrike());
        break;
      case 'align-left':
        runCommand(chain => chain.setTextAlign('left'));
        break;
      case 'align-center':
        runCommand(chain => chain.setTextAlign('center'));
        break;
      case 'bullet-list':
        runCommand(chain => chain.toggleBulletList());
        break;
      case 'ordered-list':
        runCommand(chain => chain.toggleOrderedList());
        break;
      case 'table-row-above':
        runCommand(chain => chain.addRowBefore());
        break;
      case 'table-row-below':
        runCommand(chain => chain.addRowAfter());
        break;
      case 'table-col-left':
        runCommand(chain => chain.addColumnBefore());
        break;
      case 'table-col-right':
        runCommand(chain => chain.addColumnAfter());
        break;
      case 'table-delete-row':
        runCommand(chain => chain.deleteRow());
        break;
      case 'table-delete-col':
        runCommand(chain => chain.deleteColumn());
        break;
      case 'table-delete-table':
        runCommand(chain => chain.deleteTable());
        break;
      case 'toggle-sheet':
        const nextState = !isBottomSheetOpen;
        setIsBottomSheetOpen(nextState);
        if (nextState) {
          (document.activeElement as HTMLElement)?.blur();
        }
        break;
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleInteraction = (e: Event) => {
      const button = (e.target as HTMLElement).closest('.mobile-formatter-mainrow [data-command], .contextual-table-row [data-command]');
      if (button) {
        e.preventDefault();
        const command = button.getAttribute('data-command');
        if (command) {
          executeCoreCommand(command);
        }
      }
    };

    container.addEventListener('touchstart', handleInteraction, { passive: false });
    container.addEventListener('mousedown', handleInteraction);

    return () => {
      container.removeEventListener('touchstart', handleInteraction);
      container.removeEventListener('mousedown', handleInteraction);
    };
  }, [editor, isBottomSheetOpen]);

  return (
    <div ref={containerRef} className="mobile-formatter-container no-print">
      {/* 1. Contextual Table Toolbar (Displays only when cursor is inside a table) */}
      {isTableFocused && (
        <div className="mobile-formatter-subrow contextual-table-row">
          <button
            data-command="table-row-above"
            className="mobile-tool-btn sub-btn"
            title="Add Row Above"
          >
            <Plus size={12} /><span>Row Above</span>
          </button>
          <button
            data-command="table-row-below"
            className="mobile-tool-btn sub-btn"
            title="Add Row Below"
          >
            <Plus size={12} /><span>Row Below</span>
          </button>
          <button
            data-command="table-col-left"
            className="mobile-tool-btn sub-btn"
            title="Add Column Left"
          >
            <Plus size={12} /><span>Col Left</span>
          </button>
          <button
            data-command="table-col-right"
            className="mobile-tool-btn sub-btn"
            title="Add Column Right"
          >
            <Plus size={12} /><span>Col Right</span>
          </button>
          <button
            data-command="table-delete-row"
            className="mobile-tool-btn sub-btn text-danger"
            title="Delete Row"
          >
            <Minus size={12} /><span>Del Row</span>
          </button>
          <button
            data-command="table-delete-col"
            className="mobile-tool-btn sub-btn text-danger"
            title="Delete Column"
          >
            <Minus size={12} /><span>Del Col</span>
          </button>
          <button
            data-command="table-delete-table"
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
          data-command="undo"
          disabled={!editor.can().undo()}
          className="mobile-tool-btn"
        >
          <Undo size={16} />
        </button>
        <button
          data-command="redo"
          disabled={!editor.can().redo()}
          className="mobile-tool-btn"
        >
          <Redo size={16} />
        </button>
 
        <span className="mobile-tool-divider" />

        {/* Text Formats */}
        <button
          data-command="bold"
          className={`mobile-tool-btn ${editor.isActive('bold') ? 'active' : ''}`}
        >
          <Bold size={16} />
        </button>
        <button
          data-command="italic"
          className={`mobile-tool-btn ${editor.isActive('italic') ? 'active' : ''}`}
        >
          <Italic size={16} />
        </button>
        <button
          data-command="underline"
          className={`mobile-tool-btn ${editor.isActive('underline') ? 'active' : ''}`}
        >
          <Underline size={16} />
        </button>
        <button
          data-command="strike"
          className={`mobile-tool-btn ${editor.isActive('strike') ? 'active' : ''}`}
        >
          <Strikethrough size={16} />
        </button>

        <span className="mobile-tool-divider" />

        {/* Alignments */}
        <button
          data-command="align-left"
          className={`mobile-tool-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
        >
          <AlignLeft size={16} />
        </button>
        <button
          data-command="align-center"
          className={`mobile-tool-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
        >
          <AlignCenter size={16} />
        </button>

        <span className="mobile-tool-divider" />

        {/* Lists */}
        <button
          data-command="bullet-list"
          className={`mobile-tool-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
        >
          <List size={16} />
        </button>
        <button
          data-command="ordered-list"
          className={`mobile-tool-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
        >
          <ListOrdered size={16} />
        </button>

        <span className="mobile-tool-divider" />

        {/* Expanded Formatting Sheet Trigger Button */}
        <button
          data-command="toggle-sheet"
          className={`mobile-tool-btn format-trigger-btn ${isBottomSheetOpen ? 'active' : ''}`}
          title="More Formatting Options"
          style={{ width: '48px', gap: '2px', backgroundColor: 'var(--brand-50)', borderColor: 'var(--brand-200)' }}
        >
          <ChevronUp size={14} style={{ transform: isBottomSheetOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--brand-600)' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-700)' }}>Aa</span>
        </button>
      </div>

      {/* 3. Expandable Bottom Sheet Panel */}
      {isBottomSheetOpen && (
        <div className="mobile-formatter-sheet-backdrop" onClick={() => setIsBottomSheetOpen(false)}>
          <div 
            className="mobile-formatter-sheet" 
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="sheet-header">
              <span className="sheet-title">
                Format Options
                <span className="sheet-header-badge">{getWordCount()} words</span>
              </span>
              <button className="sheet-close-btn" onClick={() => setIsBottomSheetOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="sheet-tabs">
              <button 
                className={`sheet-tab-btn ${activeSheetTab === 'text' ? 'active' : ''}`}
                onClick={() => setActiveSheetTab('text')}
              >
                Text
              </button>
              <button 
                className={`sheet-tab-btn ${activeSheetTab === 'paragraph' ? 'active' : ''}`}
                onClick={() => setActiveSheetTab('paragraph')}
              >
                Paragraph
              </button>
              <button 
                className={`sheet-tab-btn ${activeSheetTab === 'layout' ? 'active' : ''}`}
                onClick={() => setActiveSheetTab('layout')}
              >
                Layout
              </button>
              <button 
                className={`sheet-tab-btn ${activeSheetTab === 'insert' ? 'active' : ''}`}
                onClick={() => setActiveSheetTab('insert')}
              >
                Insert
              </button>
            </div>

            <div className="sheet-body">
              {activeSheetTab === 'text' && (
                <div className="sheet-pane text-pane">
                  {/* Font Family selector */}
                  <div className="sheet-form-row">
                    <label>Font Family</label>
                    <select 
                      value={editor.getAttributes('textStyle').fontFamily || 'Inter'}
                      onChange={(e) => handleFontChange(e.target.value)}
                      className="sheet-select"
                    >
                      <optgroup label="Google Fonts">
                        {['Inter', 'Lora', 'Fira Code', 'Playfair Display', 'Roboto', 'Outfit'].map(font => (
                          <option key={font} value={font}>{font}</option>
                        ))}
                      </optgroup>
                      <optgroup label="System Fonts">
                        {['Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana'].map(font => (
                          <option key={font} value={font}>{font}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Font Size Selector */}
                  <div className="sheet-form-row">
                    <label>Font Size</label>
                    <div className="sheet-size-control">
                      <button 
                        onClick={() => handleFontSizeChange(-1)}
                        className="size-btn"
                      >
                        <Minus size={14} />
                      </button>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span className="size-indicator">{getActiveFontSize()}px</span>
                        <select 
                          value={getActiveFontSize()}
                          onChange={(e) => {
                            const size = parseInt(e.target.value, 10);
                            if (!isNaN(size)) {
                              runCommand(chain => chain.setFontSize(`${size}px`));
                            }
                          }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            opacity: 0,
                            cursor: 'pointer',
                            appearance: 'none',
                            WebkitAppearance: 'none'
                          }}
                        >
                          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map(size => (
                            <option key={size} value={size}>{size}px</option>
                          ))}
                        </select>
                      </div>
                      <button 
                        onClick={() => handleFontSizeChange(1)}
                        className="size-btn"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Text Color Picker Grid */}
                  <div className="sheet-form-row-vertical">
                    <label>Text Color</label>
                    <div className="color-swatch-grid">
                      {TEXT_COLORS.map(color => (
                        <button
                          key={color.value}
                          onClick={() => runCommand(chain => chain.setColor(color.value))}
                          className={`color-swatch ${editor.isActive('textStyle', { color: color.value }) ? 'active' : ''}`}
                          style={{ backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Highlight Color Picker Grid */}
                  <div className="sheet-form-row-vertical">
                    <label>Highlight Color</label>
                    <div className="color-swatch-grid">
                      {HIGHLIGHT_COLORS.map(color => (
                        <button
                          key={color.value}
                          onClick={() => {
                            if (color.value === 'transparent') {
                              runCommand(chain => chain.unsetHighlight());
                            } else {
                              runCommand(chain => chain.toggleHighlight({ color: color.value }));
                            }
                          }}
                          className={`color-swatch ${color.value === 'transparent' ? 'transparent-swatch' : ''} ${editor.isActive('highlight', { color: color.value }) ? 'active' : ''}`}
                          style={color.value === 'transparent' ? {} : { backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Clear formatting */}
                  <button 
                    onClick={() => runCommand(chain => chain.unsetAllMarks().clearNodes())}
                    className="sheet-action-btn-danger"
                  >
                    <Trash2 size={14} /><span>Clear Text Formatting</span>
                  </button>
                </div>
              )}

              {activeSheetTab === 'paragraph' && (
                <div className="sheet-pane paragraph-pane">
                  {/* Headings */}
                  <div className="sheet-form-row-vertical">
                    <label>Heading Style</label>
                    <div className="heading-selector-grid">
                      <button 
                        onClick={() => setHeadingStyle('paragraph')}
                        className={`heading-select-btn ${editor.isActive('paragraph') ? 'active' : ''}`}
                      >
                        Paragraph
                      </button>
                      <button 
                        onClick={() => setHeadingStyle(1)}
                        className={`heading-select-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
                      >
                        Heading 1
                      </button>
                      <button 
                        onClick={() => setHeadingStyle(2)}
                        className={`heading-select-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
                      >
                        Heading 2
                      </button>
                      <button 
                        onClick={() => setHeadingStyle(3)}
                        className={`heading-select-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
                      >
                        Heading 3
                      </button>
                    </div>
                  </div>

                  {/* Alignment segmented control */}
                  <div className="sheet-form-row-vertical">
                    <label>Alignment</label>
                    <div className="segmented-control">
                      <button 
                        onClick={() => runCommand(chain => chain.setTextAlign('left'))}
                        className={`segment-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
                      >
                        <AlignLeft size={16} />
                      </button>
                      <button 
                        onClick={() => runCommand(chain => chain.setTextAlign('center'))}
                        className={`segment-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
                      >
                        <AlignCenter size={16} />
                      </button>
                      <button 
                        onClick={() => runCommand(chain => chain.setTextAlign('right'))}
                        className={`segment-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
                      >
                        <AlignRight size={16} />
                      </button>
                      <button 
                        onClick={() => runCommand(chain => chain.setTextAlign('justify'))}
                        className={`segment-btn ${editor.isActive({ textAlign: 'justify' }) ? 'active' : ''}`}
                      >
                        <AlignJustify size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Lists */}
                  <div className="sheet-form-row-vertical">
                    <label>List Styles</label>
                    <div className="segmented-control">
                      <button 
                        onClick={() => runCommand(chain => chain.toggleBulletList())}
                        className={`segment-btn list-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
                        style={{ flexGrow: 1 }}
                      >
                        <List size={16} /><span style={{ marginLeft: '6px', fontSize: '13px' }}>Bulleted List</span>
                      </button>
                      <button 
                        onClick={() => runCommand(chain => chain.toggleOrderedList())}
                        className={`segment-btn list-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
                        style={{ flexGrow: 1 }}
                      >
                        <ListOrdered size={16} /><span style={{ marginLeft: '6px', fontSize: '13px' }}>Numbered List</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeSheetTab === 'insert' && (
                <div className="sheet-pane insert-pane">
                  {/* Insert Actions Grid */}
                  <div className="insert-actions-grid">
                    <button 
                      onClick={() => runCommand(chain => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}
                      className="insert-action-card"
                    >
                      <TableIcon size={20} className="text-brand" />
                      <span>Table (3x3)</span>
                    </button>
                    <button 
                      onClick={handleInsertLink}
                      className={`insert-action-card ${editor.isActive('link') ? 'active' : ''}`}
                    >
                      <LinkIcon size={20} className="text-brand" />
                      <span>Hyperlink</span>
                    </button>
                    <button 
                      onClick={() => runCommand(chain => chain.setPageBreak())}
                      className="insert-action-card"
                    >
                      <Plus size={20} className="text-brand" />
                      <span>Page Break</span>
                    </button>
                    <button 
                      onClick={() => mobileImageInputRef.current?.click()}
                      className="insert-action-card"
                    >
                      <ImageIcon size={20} className="text-brand" />
                      <span>Upload Image</span>
                    </button>
                  </div>
                  <input
                    type="file"
                    ref={mobileImageInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                </div>
              )}

              {activeSheetTab === 'layout' && (
                <div className="sheet-pane layout-pane">
                  {/* Margins */}
                  <div className="sheet-form-row-vertical">
                    <label>Margins</label>
                    <div className="segmented-control">
                      <button
                        onClick={() => updateMargins({ top: 96, bottom: 96, left: 96, right: 96 })}
                        className={`segment-btn ${
                          docState.margins.top === 96 &&
                          docState.margins.bottom === 96 &&
                          docState.margins.left === 96 &&
                          docState.margins.right === 96
                            ? 'active'
                            : ''
                        }`}
                        style={{ flexGrow: 1 }}
                      >
                        Normal
                      </button>
                      <button
                        onClick={() => updateMargins({ top: 48, bottom: 48, left: 48, right: 48 })}
                        className={`segment-btn ${
                          docState.margins.top === 48 &&
                          docState.margins.bottom === 48 &&
                          docState.margins.left === 48 &&
                          docState.margins.right === 48
                            ? 'active'
                            : ''
                        }`}
                        style={{ flexGrow: 1 }}
                      >
                        Narrow
                      </button>
                      <button
                        onClick={() => updateMargins({ top: 192, bottom: 192, left: 192, right: 192 })}
                        className={`segment-btn ${
                          docState.margins.top === 192 &&
                          docState.margins.bottom === 192 &&
                          docState.margins.left === 192 &&
                          docState.margins.right === 192
                            ? 'active'
                            : ''
                        }`}
                        style={{ flexGrow: 1 }}
                      >
                        Wide
                      </button>
                    </div>
                  </div>

                  {/* Orientation */}
                  <div className="sheet-form-row-vertical">
                    <label>Orientation</label>
                    <div className="segmented-control">
                      <button
                        onClick={() => updateOrientation('portrait')}
                        className={`segment-btn ${docState.orientation === 'portrait' ? 'active' : ''}`}
                        style={{ flexGrow: 1 }}
                      >
                        Portrait
                      </button>
                      <button
                        onClick={() => updateOrientation('landscape')}
                        className={`segment-btn ${docState.orientation === 'landscape' ? 'active' : ''}`}
                        style={{ flexGrow: 1 }}
                      >
                        Landscape
                      </button>
                    </div>
                  </div>

                  {/* Page Size */}
                  <div className="sheet-form-row-vertical">
                    <label>Page Size</label>
                    <div className="segmented-control">
                      <button
                        onClick={() => updatePageSize('Letter')}
                        className={`segment-btn ${docState.pageSize === 'Letter' ? 'active' : ''}`}
                        style={{ flexGrow: 1 }}
                      >
                        Letter
                      </button>
                      <button
                        onClick={() => updatePageSize('A4')}
                        className={`segment-btn ${docState.pageSize === 'A4' ? 'active' : ''}`}
                        style={{ flexGrow: 1 }}
                      >
                        A4
                      </button>
                    </div>
                  </div>

                  {/* Header & Footer Action Button */}
                  <button
                    onClick={() => {
                      setIsBottomSheetOpen(false); // Close drawer
                      onOpenHeaderFooter(); // Open Header & Footer modal
                    }}
                    className="sheet-action-btn"
                    style={{ marginTop: '16px', width: '100%' }}
                  >
                    <FileText size={16} />
                    <span>Header & Footer Settings...</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
