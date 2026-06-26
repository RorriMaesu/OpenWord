import React from 'react';
import { Editor } from '@tiptap/react';
import { Check, X, Sparkles, ArrowRight, ArrowDown } from 'lucide-react';
import { applyBlockOperations } from '../../utils/blocks';
import type { BlockOperation, DocumentBlock } from '../../utils/blocks';
import { useIsMobile } from '../../utils/useIsMobile';

interface CopilotDiffCardProps {
  editor: Editor | null;
  operations: BlockOperation[];
  originalBlocks: DocumentBlock[];
  status: 'pending' | 'applied' | 'rejected';
  onStatusChange: (newStatus: 'applied' | 'rejected') => void;
  readOnly?: boolean;
}

export const CopilotDiffCard: React.FC<CopilotDiffCardProps> = ({
  editor,
  operations,
  originalBlocks,
  status,
  onStatusChange,
  readOnly = false,
}) => {
  const isMobile = useIsMobile();

  const handleAccept = () => {
    if (!editor) return;
    try {
      applyBlockOperations(editor, operations);
      onStatusChange('applied');
    } catch (err) {
      console.error('Failed to apply block operations:', err);
      alert('Error applying changes. Please verify the document state.');
    }
  };

  const handleReject = () => {
    onStatusChange('rejected');
  };

  if (status === 'applied') {
    return (
      <div className="diff-card applied">
        <div className="diff-card-header">
          <div className="status-badge success">
            <Check size={14} />
            <span>Changes Applied</span>
          </div>
        </div>
        <p className="diff-status-text">The requested edits have been merged into your document.</p>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="diff-card rejected">
        <div className="diff-card-header">
          <div className="status-badge danger">
            <X size={14} />
            <span>Changes Rejected</span>
          </div>
        </div>
        <p className="diff-status-text">The proposed edits were discarded.</p>
      </div>
    );
  }

  return (
    <div className="diff-card pending">
      <div className="diff-card-header">
        <div className="header-title-row">
          <Sparkles className="spark-icon animate-pulse" size={16} />
          <h4>Proposed Document Edits</h4>
        </div>
        <span className="operations-count">{operations.length} action(s)</span>
      </div>

      <div className="diff-operations-list">
        {operations.map((op, index) => {
          const targetBlock = originalBlocks.find(b => b.index === op.index);
          const oldHtml = targetBlock ? targetBlock.html : '';

          return (
            <div key={index} className="diff-op-item">
              {/* Operation Title */}
              <div className="diff-op-title">
                <span className="op-badge">{op.type.toUpperCase()}</span>
                <span className="op-info">
                  {op.type === 'insert' 
                    ? `Insert new block after Block ${op.index === -1 ? 'start' : op.index}` 
                    : `${op.type === 'edit' ? 'Modify' : 'Delete'} Block ${op.index} (${targetBlock?.type || 'block'})`
                  }
                </span>
              </div>

              {/* Visual Diff View */}
              <div className="diff-visualizer">
                {/* Deletions or Edits (Show old text) */}
                {(op.type === 'edit' || op.type === 'delete') && (
                  <div className="diff-block-removed">
                    <span className="diff-marker">-</span>
                    <div 
                      className="diff-html-content"
                      dangerouslySetInnerHTML={{ __html: oldHtml || '<em>Empty block</em>' }} 
                    />
                  </div>
                )}

                {/* Edits showing transition arrow */}
                {op.type === 'edit' && (
                  <div className="diff-transition-indicator">
                    {isMobile ? (
                      <ArrowDown size={14} className="text-gray-400" />
                    ) : (
                      <ArrowRight size={14} className="text-gray-400" />
                    )}
                  </div>
                )}

                {/* Insertions or Edits (Show new text) */}
                {(op.type === 'edit' || op.type === 'insert') && op.html && (
                  <div className="diff-block-added">
                    <span className="diff-marker">+</span>
                    <div 
                      className="diff-html-content"
                      dangerouslySetInnerHTML={{ __html: op.html }} 
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      {readOnly ? (
        <div className="diff-card-actions streaming-status">
          <span className="spinner-dots">Generating proposed edits...</span>
        </div>
      ) : (
        <div className="diff-card-actions">
          <button 
            onClick={handleReject} 
            className="btn-diff-action reject"
            title="Discard edits"
          >
            <X size={14} />
            <span>Reject</span>
          </button>
          <button 
            onClick={handleAccept} 
            className="btn-diff-action accept"
            disabled={!editor}
            title="Apply edits to document"
          >
            <Check size={14} />
            <span>Accept & Apply</span>
          </button>
        </div>
      )}
    </div>
  );
};
