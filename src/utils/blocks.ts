import { Editor } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';

export interface DocumentBlock {
  index: number;
  type: string;
  text: string;
  html: string;
  start: number;
  end: number;
}

export interface BlockOperation {
  type: 'edit' | 'insert' | 'delete';
  index: number; // For 'edit' and 'delete', the target block index. For 'insert', after this block index (or -1 for the very start).
  html?: string; // Content html to insert or replace with
}

/**
 * Serialize the Tiptap editor document into a list of top-level blocks.
 */
export function serializeEditorToBlocks(editor: Editor): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let idx = 0;

  editor.state.doc.forEach((node, offset) => {
    // Generate HTML for the single node
    const serializer = DOMSerializer.fromSchema(editor.schema);
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(serializer.serializeNode(node));
    const html = tempDiv.innerHTML;
    const text = node.textContent;

    blocks.push({
      index: idx++,
      type: node.type.name,
      text,
      html,
      start: offset,
      end: offset + node.nodeSize
    });
  });

  return blocks;
}

/**
 * Applies a list of block-level operations in a stable bottom-to-top order.
 */
export function applyBlockOperations(editor: Editor, operations: BlockOperation[]) {
  // 1. Get current document blocks with their original positions
  const blocks = serializeEditorToBlocks(editor);

  // 2. Sort operations in descending order of block index.
  // For the same index, 'insert' operations must run before 'edit' or 'delete'
  // so that the insertion happens at the original end boundary before the block content is mutated.
  const sortedOps = [...operations].sort((a, b) => {
    if (b.index !== a.index) {
      return b.index - a.index;
    }
    if (a.type === 'insert' && b.type !== 'insert') return -1;
    if (b.type === 'insert' && a.type !== 'insert') return 1;
    return 0;
  });

  // Apply operations sequentially inside a single transaction chain
  const chain = editor.chain().focus();

  for (const op of sortedOps) {
    if (op.type === 'insert' && op.index === -1 && op.html) {
      chain.insertContentAt(0, op.html);
      continue;
    }

    const targetBlock = blocks.find(b => b.index === op.index);
    if (!targetBlock) continue;

    if (op.type === 'edit' && op.html) {
      chain.insertContentAt({ from: targetBlock.start, to: targetBlock.end }, op.html);
    } else if (op.type === 'delete') {
      chain.deleteRange({ from: targetBlock.start, to: targetBlock.end });
    } else if (op.type === 'insert' && op.html) {
      chain.insertContentAt(targetBlock.end, op.html);
    }
  }

  chain.run();
}

/**
 * Helper to wrap the inner content of a block HTML tag with a <mark> tag.
 */
function wrapInnerHtmlInMark(html: string): string {
  const match = html.trim().match(/^<([a-zA-Z0-9]+)([^>]*)>([\s\S]*)<\/([a-zA-Z0-9]+)>$/);
  if (match && match[1] === match[4]) {
    const tagName = match[1];
    const attrs = match[2];
    const innerContent = match[3];
    return `<${tagName}${attrs}><mark>${innerContent}</mark></${tagName}>`;
  }
  return `<p><mark>${html.replace(/<\/?p>/g, '')}</mark></p>`;
}

export function streamEditBlock(editor: Editor, index: number, html: string, isFinal = false) {
  const blocks = serializeEditorToBlocks(editor);
  const targetBlock = blocks.find(b => b.index === index);
  if (!targetBlock) return;

  let contentHtml = html.trim();
  
  // If the content doesn't start with an HTML tag, wrap it using the original block's tag structure
  if (!contentHtml.startsWith('<')) {
    const tagMatch = targetBlock.html.trim().match(/^<([a-zA-Z0-9]+)([^>]*)>/);
    if (tagMatch) {
      const tagName = tagMatch[1];
      const attrs = tagMatch[2];
      contentHtml = `<${tagName}${attrs}>${contentHtml}</${tagName}>`;
    } else {
      contentHtml = `<p>${contentHtml}</p>`;
    }
  }

  const finalHtml = isFinal ? contentHtml : wrapInnerHtmlInMark(contentHtml);

  editor.chain().focus().insertContentAt({ from: targetBlock.start, to: targetBlock.end }, finalHtml).run();
}

/**
 * Create a new empty block after a specific index.
 * Returns the index of the newly created block.
 */
export function insertPlaceholderBlock(editor: Editor, afterIndex: number, type = 'paragraph'): number {
  const blocks = serializeEditorToBlocks(editor);
  
  if (afterIndex === -1) {
    const content = type === 'heading' ? '<h1><mark>...</mark></h1>' : '<p><mark>...</mark></p>';
    editor.chain().focus().insertContentAt(0, content).run();
    return 0;
  }

  const targetBlock = blocks.find(b => b.index === afterIndex);
  if (!targetBlock) return -1;

  const content = type === 'heading' ? '<h1><mark>...</mark></h1>' : '<p><mark>...</mark></p>';
  editor.chain().focus().insertContentAt(targetBlock.end, content).run();
  
  return afterIndex + 1;
}

/**
 * Delete a block at a specific index.
 */
export function executeDeleteBlock(editor: Editor, index: number) {
  const blocks = serializeEditorToBlocks(editor);
  const targetBlock = blocks.find(b => b.index === index);
  if (!targetBlock) return;

  editor.chain().focus().deleteRange({ from: targetBlock.start, to: targetBlock.end }).run();
}

