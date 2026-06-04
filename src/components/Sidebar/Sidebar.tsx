import React, { useState, useEffect } from 'react';
import { useDocument } from '../../context/DocumentContext';
import { Search, Compass, Info, ChevronRight, FileText, Clock, CheckCircle, Database, Sparkles } from 'lucide-react';
import { Editor } from '@tiptap/react';
import { AICopilot } from './AICopilot';

interface SidebarProps {
  editor: Editor | null;
  isOpen: boolean;
}

interface HeadingItem {
  level: number;
  text: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ editor, isOpen }) => {
  const { isSaving, isDirty } = useDocument();
  const [activeTab, setActiveTab] = useState<'outline' | 'search' | 'properties' | 'copilot'>('outline');
  
  // Resizing states and logic
  const [width, setWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      const clampedWidth = Math.max(320, Math.min(newWidth, 650));
      setWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  
  // Search & Replace states
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  // Debouncing Outline Update to preserve fast typing speed (60fps)
  useEffect(() => {
    if (!editor) return;

    const extractAndSetHeadings = () => {
      const headingsList: HeadingItem[] = [];
      const traverse = (node: any) => {
        if (!node) return;
        if (node.type === 'heading') {
          const text = node.content ? node.content.map((c: any) => c.text || '').join('') : 'Untitled Heading';
          headingsList.push({
            level: node.attrs?.level || 1,
            text
          });
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(traverse);
        }
      };
      
      traverse(editor.getJSON());
      setHeadings(headingsList);
    };

    // Extract initially
    extractAndSetHeadings();

    // Set up debounced listener on transactions
    let timer: NodeJS.Timeout;
    const handleUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        extractAndSetHeadings();
        // Also update search matches if search term is active
        if (searchTerm) {
          updateSearchMatchesInfo();
        }
      }, 800);
    };

    editor.on('transaction', handleUpdate);
    return () => {
      editor.off('transaction', handleUpdate);
      clearTimeout(timer);
    };
  }, [editor, searchTerm]);

  // Retrieve match metrics from search extension
  const updateSearchMatchesInfo = () => {
    if (!editor) return;
    const searchStorage = (editor.storage as any).searchReplace;
    if (searchStorage) {
      setTotalMatches(searchStorage.results?.length || 0);
      setCurrentMatchIndex(searchStorage.currentIndex);
    }
  };

  // Run search
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (!editor) return;
    editor.commands.setSearchTerm(val);
    setTimeout(updateSearchMatchesInfo, 50);
  };

  const handleNextMatch = () => {
    if (!editor) return;
    editor.commands.nextMatch();
    updateSearchMatchesInfo();
  };

  const handlePrevMatch = () => {
    if (!editor) return;
    editor.commands.prevMatch();
    updateSearchMatchesInfo();
  };

  const handleReplace = () => {
    if (!editor) return;
    editor.commands.setReplaceTerm(replaceTerm);
    editor.commands.replace();
    // Re-highlight and count matches
    editor.commands.setSearchTerm(searchTerm);
    setTimeout(updateSearchMatchesInfo, 50);
  };

  const handleReplaceAll = () => {
    if (!editor) return;
    editor.commands.setReplaceTerm(replaceTerm);
    editor.commands.replaceAll();
    setTotalMatches(0);
    setCurrentMatchIndex(-1);
  };

  // Jumps browser view to the selected heading in Tiptap
  const handleHeadingClick = (heading: HeadingItem) => {
    const editorEl = document.querySelector('.tiptap');
    if (!editorEl) return;
    
    const elements = Array.from(editorEl.querySelectorAll(`h${heading.level}`));
    const target = elements.find(
      el => (el.textContent || '').trim().toLowerCase() === heading.text.trim().toLowerCase()
    );
    
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Document statistics calculations
  const getStats = () => {
    if (!editor) return { words: 0, chars: 0, paragraphs: 0, readTime: 0 };
    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    
    // Count paragraph nodes
    let paragraphs = 0;
    const json = editor.getJSON();
    if (json.content) {
      paragraphs = json.content.filter((node: any) => node.type === 'paragraph').length;
    }
    
    const readTime = Math.max(1, Math.round(words / 200)); // Average reading speed 200 WPM

    return { words, chars, paragraphs, readTime };
  };

  const stats = getStats();

  if (!isOpen) return null;

  return (
    <div 
      className="sidebar-container"
      style={{ width: `${width}px` }}
    >
      {/* Draggable Resizer Handle */}
      <div 
        className={`sidebar-resizer-handle ${isResizing ? 'active' : ''}`}
        onMouseDown={startResizing}
      />
      {/* Sidebar Tabs Selector */}
      <div className="sidebar-tabs">
        <button 
          className={`sidebar-tab ${activeTab === 'outline' ? 'active' : ''}`}
          onClick={() => setActiveTab('outline')}
          title="Document Outline"
        >
          <Compass size={18} />
          <span>Outline</span>
        </button>
        <button 
          className={`sidebar-tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
          title="Find & Replace"
        >
          <Search size={18} />
          <span>Find</span>
        </button>
        <button 
          className={`sidebar-tab ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
          title="Document Properties"
        >
          <Info size={18} />
          <span>Info</span>
        </button>
        <button 
          className={`sidebar-tab ${activeTab === 'copilot' ? 'active' : ''}`}
          onClick={() => setActiveTab('copilot')}
          title="AI Writing Copilot"
        >
          <Sparkles size={18} />
          <span>Copilot</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className={`sidebar-content ${activeTab === 'copilot' ? 'copilot-tab-active' : ''}`}>
        
        {/* Navigation / Outline Tab */}
        {activeTab === 'outline' && (
          <div className="tab-pane outline-pane">
            <h4 className="pane-title">Document Navigation</h4>
            {headings.length === 0 ? (
              <div className="pane-empty-state">
                <Compass className="empty-state-icon" size={32} />
                <p>Use Headings (H1, H2, H3) in the Ribbon menu to populate the document map.</p>
              </div>
            ) : (
              <div className="headings-tree">
                {headings.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => handleHeadingClick(h)}
                    className="heading-tree-item"
                    style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                  >
                    <ChevronRight size={12} className="tree-arrow" />
                    <span className={`heading-level-${h.level}`}>{h.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Find & Replace Tab */}
        {activeTab === 'search' && (
          <div className="tab-pane search-pane">
            <h4 className="pane-title">Search & Replace</h4>
            
            <div className="form-group">
              <label htmlFor="search-input">Find text</label>
              <div className="search-input-wrapper">
                <input
                  id="search-input"
                  type="text"
                  placeholder="Search in document..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
                {searchTerm && (
                  <span className="search-match-badge">
                    {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : '0/0'}
                  </span>
                )}
              </div>
            </div>

            <div className="search-controls">
              <button 
                disabled={totalMatches === 0} 
                onClick={handlePrevMatch}
                className="btn-outline-action"
              >
                Previous
              </button>
              <button 
                disabled={totalMatches === 0} 
                onClick={handleNextMatch}
                className="btn-outline-action"
              >
                Next
              </button>
            </div>

            <div className="form-group border-top">
              <label htmlFor="replace-input">Replace with</label>
              <input
                id="replace-input"
                type="text"
                placeholder="Replace matching text..."
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
              />
            </div>

            <div className="search-controls">
              <button 
                disabled={totalMatches === 0} 
                onClick={handleReplace}
                className="btn-outline-action accent"
              >
                Replace
              </button>
              <button 
                disabled={totalMatches === 0} 
                onClick={handleReplaceAll}
                className="btn-outline-action"
              >
                Replace All
              </button>
            </div>
          </div>
        )}

        {/* Document Information Tab */}
        {activeTab === 'properties' && (
          <div className="tab-pane properties-pane">
            <h4 className="pane-title">Document Properties</h4>
            
            <div className="props-list">
              <div className="props-item">
                <FileText size={16} className="prop-icon" />
                <div className="prop-detail">
                  <span className="prop-label">Words</span>
                  <span className="prop-value">{stats.words}</span>
                </div>
              </div>
              <div className="props-item">
                <FileText size={16} className="prop-icon" />
                <div className="prop-detail">
                  <span className="prop-label">Characters</span>
                  <span className="prop-value">{stats.chars}</span>
                </div>
              </div>
              <div className="props-item">
                <FileText size={16} className="prop-icon" />
                <div className="prop-detail">
                  <span className="prop-label">Paragraphs</span>
                  <span className="prop-value">{stats.paragraphs}</span>
                </div>
              </div>
              <div className="props-item">
                <Clock size={16} className="prop-icon" />
                <div className="prop-detail">
                  <span className="prop-label">Estimated Read Time</span>
                  <span className="prop-value">{stats.readTime} min</span>
                </div>
              </div>
            </div>

            <h4 className="pane-title border-top">Status & Security</h4>
            <div className="props-list">
              <div className="props-item">
                <Database size={16} className="prop-icon" />
                <div className="prop-detail">
                  <span className="prop-label">Autosave Status</span>
                  <span className="prop-value font-highlight">
                    {isSaving ? 'Saving changes...' : isDirty ? 'Unsaved edits' : 'Synchronized'}
                  </span>
                </div>
              </div>
              <div className="props-item">
                <CheckCircle size={16} className="prop-icon" />
                <div className="prop-detail">
                  <span className="prop-label">Storage target</span>
                  <span className="prop-value">IndexedDB / Local</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Writing Copilot Tab */}
        {activeTab === 'copilot' && (
          <AICopilot editor={editor} />
        )}

      </div>
    </div>
  );
};
