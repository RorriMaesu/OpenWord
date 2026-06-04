import React, { useState, useRef } from 'react';
import { useDocument } from '../../context/DocumentContext';
import { Editor } from '@tiptap/react';
import {
  File, FolderOpen, Save, FileText, Printer, Bold, Italic, Underline,
  Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered,
  Heading, Image, Link, Columns, Palette, FileCheck,
  ChevronDown, Moon, Table as TableIcon, Trash2, ArrowUpCircle
} from 'lucide-react';
import { importDocx } from '../../utils/docxImporter';
import { markdownToHtml } from '../../utils/markdownConverter';
import confetti from 'canvas-confetti';

interface RibbonProps {
  editor: Editor | null;
  layoutMode: 'pageless' | 'print';
  onLayoutModeChange: (mode: 'pageless' | 'print') => void;
  showRuler: boolean;
  onShowRulerChange: (show: boolean) => void;
  onOpenHeaderFooter: () => void;
}

const GOOGLE_FONTS = ['Inter', 'Lora', 'Fira Code', 'Playfair Display', 'Roboto', 'Outfit'];
const SYSTEM_FONTS = ['Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana'];

export const Ribbon: React.FC<RibbonProps> = ({
  editor,
  layoutMode,
  onLayoutModeChange,
  showRuler,
  onShowRulerChange,
  onOpenHeaderFooter
}) => {
  const {
    docState,
    updateMargins,
    updatePageSize,
    updateOrientation,
    saveActiveFile,
    saveAsNewFile,
    openLocalFile,
    createNewDocument
  } = useDocument();

  const [activeTab, setActiveTab] = useState<'file' | 'home' | 'insert' | 'layout' | 'review' | 'view'>('home');
  const [fontLoading, setFontLoading] = useState<string | null>(null);
  
  // Ribbon UI Dropdowns
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showTableGrid, setShowTableGrid] = useState(false);
  
  // Table creator dimensions hover state
  const [hoveredGrid, setHoveredGrid] = useState({ r: 0, c: 0 });

  // Refs for file uploads
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  // Change font family with Google Fonts async loading
  const handleFontChange = async (fontName: string) => {
    setShowFontDropdown(false);
    
    if (GOOGLE_FONTS.includes(fontName)) {
      setFontLoading(fontName);
      try {
        // Dynamically inject link if not present in index.html
        const fontId = `gfont-${fontName.toLowerCase().replace(/\s+/g, '-')}`;
        if (!document.getElementById(fontId)) {
          const link = document.createElement('link');
          link.id = fontId;
          link.rel = 'stylesheet';
          link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:wght@300;400;500;600;700&display=swap`;
          document.head.appendChild(link);
          
          // Wait for font load
          await document.fonts.load(`1em ${fontName}`);
        }
      } catch (err) {
        console.error('Failed to load Google Font asynchronously:', err);
      } finally {
        setFontLoading(null);
      }
    }
    
    editor.commands.setFontFamily(fontName);
  };

  // Change font size
  const handleSizeChange = (size: string) => {
    setShowSizeDropdown(false);
    editor.commands.setFontSize(size);
  };

  // Heading style mapping
  const setHeadingStyle = (level: 1 | 2 | 3 | 'paragraph' | 'title') => {
    if (level === 'paragraph') {
      editor.commands.setParagraph();
      editor.commands.setFontSize('16px');
    } else if (level === 'title') {
      editor.commands.setHeading({ level: 1 });
      editor.commands.setFontSize('32px');
      editor.commands.setFontFamily('Outfit');
    } else {
      editor.commands.setHeading({ level });
      if (level === 1) editor.commands.setFontSize('24px');
      else if (level === 2) editor.commands.setFontSize('18px');
      else editor.commands.setFontSize('14px');
    }
  };

  // Format togglers
  const toggleBold = () => editor.chain().focus().toggleBold().run();
  const toggleItalic = () => editor.chain().focus().toggleItalic().run();
  const toggleUnderline = () => editor.chain().focus().toggleUnderline().run();
  const toggleStrike = () => editor.chain().focus().toggleStrike().run();

  const handleAlign = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    editor.chain().focus().setTextAlign(alignment).run();
  };

  const handleBulletList = () => editor.chain().focus().toggleBulletList().run();
  const handleOrderedList = () => editor.chain().focus().toggleOrderedList().run();

  // Color picker helper
  const handleTextColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    editor.chain().focus().setColor(e.target.value).run();
  };

  const handleHighlightColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    editor.chain().focus().toggleHighlight({ color: e.target.value }).run();
  };

  // Clear all editor text formatting
  const handleClearFormat = () => {
    editor.chain().focus().unsetAllMarks().clearNodes().run();
  };

  // Insert link
  const handleInsertLink = () => {
    const url = prompt('Enter Hyperlink URL:', 'https://');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  // Table creator click
  const handleInsertTable = (rows: number, cols: number) => {
    setShowTableGrid(false);
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  };

  // Image insertion (supports url or file base64)
  const handleInsertImageUrl = () => {
    const url = prompt('Enter Image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          editor.chain().focus().setImage({ src: reader.result }).run();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Margins selector
  const selectPresetMargins = (preset: 'normal' | 'narrow' | 'wide') => {
    if (preset === 'normal') updateMargins({ top: 96, bottom: 96, left: 96, right: 96 });
    if (preset === 'narrow') updateMargins({ top: 48, bottom: 48, left: 48, right: 48 });
    if (preset === 'wide') updateMargins({ top: 192, bottom: 192, left: 192, right: 192 });
  };

  // Open file upload handler
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (extension === 'docx') {
        const buffer = await file.arrayBuffer();
        const res = await importDocx(buffer);
        
        // Open local details in State context
        openLocalFile({
          name: file.name,
          html: res.html,
          margins: res.margins,
          pageSize: res.pageSize,
          orientation: res.orientation,
          headers: res.headers,
          footers: docState.footers // Default footer
        });
        
        editor.commands.setContent(res.html);
      } else if (extension === 'md' || extension === 'markdown') {
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
        
        editor.commands.setContent(html);
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
        
        editor.commands.setContent(html);
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
        
        editor.commands.setContent(html);
      }
      
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.2 } });
    } catch (err) {
      alert(`Error reading file: ${err}`);
    }
  };

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div className="ribbon-container no-print">


      {/* Tabs list selector */}
      <div className="ribbon-tabs-selector">
        {['file', 'home', 'insert', 'layout', 'review', 'view'].map((tab) => (
          <button
            key={tab}
            className={`ribbon-tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tool items group according to active tab */}
      <div className="ribbon-toolbar">
        {/* FILE TAB */}
        {activeTab === 'file' && (
          <div className="ribbon-tab-content anim-slide">
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button onClick={createNewDocument} className="tool-btn-large">
                  <File size={20} className="tool-icon-brand" />
                  <span>New Doc</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="tool-btn-large">
                  <FolderOpen size={20} />
                  <span>Open</span>
                </button>
                <button onClick={saveActiveFile} className="tool-btn-large">
                  <Save size={20} />
                  <span>Save</span>
                </button>
                <button onClick={saveAsNewFile} className="tool-btn-large">
                  <FileText size={20} />
                  <span>Save As...</span>
                </button>
              </div>
              <div className="ribbon-group-label">Document Actions</div>
            </div>

            <span className="ribbon-group-card-divider" />

            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button onClick={triggerPrint} className="tool-btn-large">
                  <Printer size={20} />
                  <span>Print / PDF</span>
                </button>
              </div>
              <div className="ribbon-group-label">Print</div>
            </div>
          </div>
        )}

        {/* HOME TAB */}
        {activeTab === 'home' && (
          <div className="ribbon-tab-content anim-slide">
            {/* Clipboard group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button onClick={createNewDocument} className="tool-btn-large">
                  <File size={20} className="tool-icon-brand" />
                  <span>New</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="tool-btn-large">
                  <FolderOpen size={20} />
                  <span>Open</span>
                </button>
                <button onClick={saveActiveFile} className="tool-btn-large">
                  <Save size={20} />
                  <span>Save</span>
                </button>
              </div>
              <div className="ribbon-group-label">Clipboard</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Font group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls font-group-layout">
                <div className="tool-row font-selects-row">
                  {/* Font Picker */}
                  <div className="tool-select-wrapper">
                    <button 
                      onClick={() => setShowFontDropdown(!showFontDropdown)} 
                      className="tool-select-btn font-family-btn"
                    >
                      <span>{fontLoading ? `Loading...` : editor.getAttributes('textStyle').fontFamily || 'Calibri'}</span>
                      <ChevronDown size={12} />
                    </button>
                    {showFontDropdown && (
                      <div className="tool-dropdown-menu font-dropdown">
                        <div className="dropdown-section">System Fonts</div>
                        {SYSTEM_FONTS.map(f => (
                          <button key={f} onClick={() => handleFontChange(f)} style={{ fontFamily: f }}>{f}</button>
                        ))}
                        <div className="dropdown-section">Google Web Fonts</div>
                        {GOOGLE_FONTS.map(f => (
                          <button key={f} onClick={() => handleFontChange(f)} style={{ fontFamily: f }}>{f}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Font Size Picker */}
                  <div className="tool-select-wrapper">
                    <button 
                      onClick={() => setShowSizeDropdown(!showSizeDropdown)} 
                      className="tool-select-btn size-btn"
                    >
                      <span>{editor.getAttributes('textStyle').fontSize || '16px'}</span>
                      <ChevronDown size={12} />
                    </button>
                    {showSizeDropdown && (
                      <div className="tool-dropdown-menu size-dropdown">
                        {['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '48px'].map(s => (
                          <button key={s} onClick={() => handleSizeChange(s)}>{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="tool-row font-styles-row">
                  <button onClick={toggleBold} className={`tool-btn-small ${editor.isActive('bold') ? 'active' : ''}`} title="Bold">
                    <Bold size={14} />
                  </button>
                  <button onClick={toggleItalic} className={`tool-btn-small ${editor.isActive('italic') ? 'active' : ''}`} title="Italic">
                    <Italic size={14} />
                  </button>
                  <button onClick={toggleUnderline} className={`tool-btn-small ${editor.isActive('underline') ? 'active' : ''}`} title="Underline">
                    <Underline size={14} />
                  </button>
                  <button onClick={toggleStrike} className={`tool-btn-small ${editor.isActive('strike') ? 'active' : ''}`} title="Strikethrough">
                    <Strikethrough size={14} />
                  </button>

                  <span className="tool-row-divider" />

                  {/* Colors picker widgets */}
                  <div className="tool-color-btn" title="Text Color">
                    <span className="color-label">A</span>
                    <input type="color" onChange={handleTextColor} className="color-input" />
                  </div>
                  
                  <div className="tool-color-btn highlight" title="Highlight Color">
                    <Palette size={12} />
                    <input type="color" onChange={handleHighlightColor} className="color-input" />
                  </div>

                  <button onClick={handleClearFormat} className="tool-btn-small" title="Clear Formatting">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Font</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Paragraph Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls paragraph-group-layout">
                {/* Paragraph Text Alignments */}
                <div className="tool-row">
                  <button onClick={() => handleAlign('left')} className={`tool-btn-small ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`} title="Align Left">
                    <AlignLeft size={14} />
                  </button>
                  <button onClick={() => handleAlign('center')} className={`tool-btn-small ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`} title="Align Center">
                    <AlignCenter size={14} />
                  </button>
                  <button onClick={() => handleAlign('right')} className={`tool-btn-small ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`} title="Align Right">
                    <AlignRight size={14} />
                  </button>
                  <button onClick={() => handleAlign('justify')} className={`tool-btn-small ${editor.isActive({ textAlign: 'justify' }) ? 'active' : ''}`} title="Justify">
                    <AlignJustify size={14} />
                  </button>
                </div>

                {/* Paragraph lists */}
                <div className="tool-row">
                  <button onClick={handleBulletList} className={`tool-btn-small ${editor.isActive('bulletList') ? 'active' : ''}`} title="Bullet List">
                    <List size={14} />
                  </button>
                  <button onClick={handleOrderedList} className={`tool-btn-small ${editor.isActive('orderedList') ? 'active' : ''}`} title="Numbered List">
                    <ListOrdered size={14} />
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Paragraph</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Styles Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <div className="quick-styles-container">
                  <button onClick={() => setHeadingStyle('paragraph')} className="style-block-btn normal">
                    AaBbCc
                    <span>Normal</span>
                  </button>
                  <button onClick={() => setHeadingStyle('title')} className="style-block-btn title">
                    AaBbCc
                    <span>Title</span>
                  </button>
                  <button onClick={() => setHeadingStyle(1)} className="style-block-btn h1">
                    AaBbCc
                    <span>Heading 1</span>
                  </button>
                  <button onClick={() => setHeadingStyle(2)} className="style-block-btn h2">
                    AaBbCc
                    <span>Heading 2</span>
                  </button>
                </div>
              </div>
              <div className="ribbon-group-label">Styles</div>
            </div>
          </div>
        )}

        {/* INSERT TAB */}
        {activeTab === 'insert' && (
          <div className="ribbon-tab-content anim-slide">
            {/* Tables Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <div className="tool-select-wrapper">
                  <button 
                    onClick={() => setShowTableGrid(!showTableGrid)} 
                    className={`tool-btn-large ${showTableGrid ? 'active' : ''}`}
                  >
                    <TableIcon size={20} />
                    <span>Table</span>
                  </button>
                  {showTableGrid && (
                    <div className="table-grid-creator-popover">
                      <div className="grid-creator-info">
                        Insert Table: {hoveredGrid.c} x {hoveredGrid.r}
                      </div>
                      <div className="grid-creator-nodes">
                        {Array.from({ length: 8 }).map((_, rIdx) => (
                          <div key={rIdx} className="grid-creator-row">
                            {Array.from({ length: 8 }).map((_, cIdx) => {
                              const r = rIdx + 1;
                              const c = cIdx + 1;
                              const isHovered = r <= hoveredGrid.r && c <= hoveredGrid.c;
                              return (
                                <div
                                  key={cIdx}
                                  onMouseEnter={() => setHoveredGrid({ r, c })}
                                  onClick={() => handleInsertTable(r, c)}
                                  className={`grid-creator-cell ${isHovered ? 'active' : ''}`}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="ribbon-group-label">Tables</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Illustrations Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button onClick={handleInsertImageUrl} className="tool-btn-large">
                  <Image size={20} />
                  <span>Image URL</span>
                </button>
                <label className="tool-btn-large cursor-pointer">
                  <ArrowUpCircle size={20} />
                  <span>Upload Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              <div className="ribbon-group-label">Illustrations</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Links Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button onClick={handleInsertLink} className="tool-btn-large">
                  <Link size={20} />
                  <span>Link</span>
                </button>
              </div>
              <div className="ribbon-group-label">Links</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Header & Footer Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button onClick={onOpenHeaderFooter} className="tool-btn-large">
                  <Heading size={20} />
                  <span>Header/Footer</span>
                </button>
                <button onClick={() => editor.commands.setPageBreak()} className="tool-btn-large">
                  <Columns size={20} />
                  <span>Page Break</span>
                </button>
              </div>
              <div className="ribbon-group-label">Header & Footer</div>
            </div>
          </div>
        )}

        {/* LAYOUT TAB */}
        {activeTab === 'layout' && (
          <div className="ribbon-tab-content anim-slide">
            {/* Page Setup Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <div className="layout-tool-group">
                  <span className="layout-tool-label">Size</span>
                  <div className="layout-btn-pair">
                    <button
                      onClick={() => updatePageSize('A4')}
                      className={`layout-btn ${docState.pageSize === 'A4' ? 'active' : ''}`}
                    >
                      A4
                    </button>
                    <button
                      onClick={() => updatePageSize('Letter')}
                      className={`layout-btn ${docState.pageSize === 'Letter' ? 'active' : ''}`}
                    >
                      Letter
                    </button>
                  </div>
                </div>

                <span className="tool-row-divider" style={{ height: '24px', margin: '0 8px' }} />

                <div className="layout-tool-group">
                  <span className="layout-tool-label">Orientation</span>
                  <div className="layout-btn-pair">
                    <button
                      onClick={() => updateOrientation('portrait')}
                      className={`layout-btn ${docState.orientation === 'portrait' ? 'active' : ''}`}
                    >
                      Portrait
                    </button>
                    <button
                      onClick={() => updateOrientation('landscape')}
                      className={`layout-btn ${docState.orientation === 'landscape' ? 'active' : ''}`}
                    >
                      Landscape
                    </button>
                  </div>
                </div>
              </div>
              <div className="ribbon-group-label">Page Setup</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Margins Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <div className="layout-tool-group">
                  <div className="layout-btn-pair select-presets">
                    <button onClick={() => selectPresetMargins('normal')} className="layout-btn-preset">Normal (1")</button>
                    <button onClick={() => selectPresetMargins('narrow')} className="layout-btn-preset">Narrow (0.5")</button>
                    <button onClick={() => selectPresetMargins('wide')} className="layout-btn-preset">Wide (2")</button>
                  </div>
                </div>
              </div>
              <div className="ribbon-group-label">Margins</div>
            </div>
          </div>
        )}

        {/* REVIEW TAB */}
        {activeTab === 'review' && (
          <div className="ribbon-tab-content anim-slide">
            {/* Proofing Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button
                  onClick={() => {
                    const text = editor.getText();
                    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                    alert(`Document metrics:\n\nWords: ${words}\nCharacters: ${text.length}\nLines/Paragraphs: ${editor.getJSON().content?.length || 0}`);
                  }}
                  className="tool-btn-large"
                >
                  <FileCheck size={20} />
                  <span>Word Count</span>
                </button>
              </div>
              <div className="ribbon-group-label">Proofing</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Document Reset Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button onClick={() => {
                  if (confirm('Are you sure you want to reset the document? Unsaved work will be deleted.')) {
                    editor.commands.clearContent();
                  }
                }} className="tool-btn-large text-danger">
                  <Trash2 size={20} />
                  <span>Reset Doc</span>
                </button>
              </div>
              <div className="ribbon-group-label">Document Management</div>
            </div>
          </div>
        )}

        {/* VIEW TAB */}
        {activeTab === 'view' && (
          <div className="ribbon-tab-content anim-slide">
            {/* Show Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button
                  onClick={() => onShowRulerChange(!showRuler)}
                  className={`tool-btn-large ${showRuler ? 'active' : ''}`}
                >
                  <FileText size={20} />
                  <span>{showRuler ? 'Hide Ruler' : 'Show Ruler'}</span>
                </button>
              </div>
              <div className="ribbon-group-label">Show</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Views Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button
                  onClick={() => onLayoutModeChange(layoutMode === 'print' ? 'pageless' : 'print')}
                  className={`tool-btn-large ${layoutMode === 'print' ? 'active' : ''}`}
                >
                  <Columns size={20} />
                  <span>Print View</span>
                </button>
              </div>
              <div className="ribbon-group-label">Views</div>
            </div>

            <span className="ribbon-group-card-divider" />

            {/* Window Group */}
            <div className="ribbon-group-card">
              <div className="ribbon-group-controls">
                <button
                  onClick={() => {
                    const isDark = document.body.parentElement?.getAttribute('data-theme') === 'dark';
                    const newTheme = isDark ? 'light' : 'dark';
                    document.body.parentElement?.setAttribute('data-theme', newTheme);
                    localStorage.setItem('openword_theme', newTheme);
                  }}
                  className="tool-btn-large"
                >
                  <Moon size={20} className="dark-theme-toggle-icon" />
                  <span>Toggle Theme</span>
                </button>
              </div>
              <div className="ribbon-group-label">Window</div>
            </div>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.md,.markdown,.txt,.html"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
    </div>
  );
};
