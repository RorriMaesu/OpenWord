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

export class VirtualIndexMapper {
  private map = new Map<number, number>();

  constructor(originalCount: number) {
    for (let i = 0; i < originalCount; i++) {
      this.map.set(i, i);
    }
  }

  public getActualIndex(virtualIndex: number): number {
    const actual = this.map.get(virtualIndex);
    if (actual === undefined) {
      return virtualIndex;
    }
    return actual;
  }

  public registerInsert(afterVirtualIndex: number) {
    const actualIndex = this.getActualIndex(afterVirtualIndex);
    const entries = Array.from(this.map.entries()).sort((a, b) => b[0] - a[0]);

    for (const [v, a] of entries) {
      let nextV = v;
      let nextA = a;

      if (a > actualIndex) {
        nextA = a + 1;
      }
      if (v > afterVirtualIndex) {
        nextV = v + 1;
        this.map.delete(v);
      }

      this.map.set(nextV, nextA);
    }

    this.map.set(afterVirtualIndex + 1, actualIndex + 1);
  }

  public registerDelete(virtualIndex: number) {
    const actualIndex = this.getActualIndex(virtualIndex);
    this.map.delete(virtualIndex);

    const entries = Array.from(this.map.entries()).sort((a, b) => a[0] - b[0]);

    for (const [v, a] of entries) {
      let nextV = v;
      let nextA = a;

      if (a > actualIndex) {
        nextA = a - 1;
      }
      if (v > virtualIndex) {
        nextV = v - 1;
        this.map.delete(v);
      }

      this.map.set(nextV, nextA);
    }
  }
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
 * Applies a list of block-level operations in sequential order using VirtualIndexMapper.
 */
export function applyBlockOperations(editor: Editor, operations: BlockOperation[]) {
  const mapper = new VirtualIndexMapper(serializeEditorToBlocks(editor).length);

  for (const op of operations) {
    const blocks = serializeEditorToBlocks(editor);
    const actualIndex = mapper.getActualIndex(op.index);

    if (op.type === 'insert' && op.index === -1 && op.html) {
      editor.chain().focus().insertContentAt(0, op.html).run();
      mapper.registerInsert(-1);
      continue;
    }

    const targetBlock = blocks.find(b => b.index === actualIndex);
    if (!targetBlock) continue;

    if (op.type === 'edit' && op.html) {
      editor.chain().focus().insertContentAt({ from: targetBlock.start, to: targetBlock.end }, op.html).run();
    } else if (op.type === 'delete') {
      editor.chain().focus().deleteRange({ from: targetBlock.start, to: targetBlock.end }).run();
      mapper.registerDelete(op.index);
    } else if (op.type === 'insert' && op.html) {
      editor.chain().focus().insertContentAt(targetBlock.end, op.html).run();
      mapper.registerInsert(op.index);
    }
  }
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

  editor.chain().insertContentAt({ from: targetBlock.start, to: targetBlock.end }, finalHtml).run();
}

/**
 * Create a new empty block after a specific index.
 * Returns the index of the newly created block.
 */
export function insertPlaceholderBlock(editor: Editor, afterIndex: number, type = 'paragraph'): number {
  const blocks = serializeEditorToBlocks(editor);
  
  if (afterIndex === -1) {
    const content = type === 'heading' ? '<h1><mark>...</mark></h1>' : '<p><mark>...</mark></p>';
    editor.chain().insertContentAt(0, content).run();
    return 0;
  }

  const targetBlock = blocks.find(b => b.index === afterIndex);
  if (!targetBlock) return -1;

  const content = type === 'heading' ? '<h1><mark>...</mark></h1>' : '<p><mark>...</mark></p>';
  editor.chain().insertContentAt(targetBlock.end, content).run();
  
  return afterIndex + 1;
}

/**
 * Delete a block at a specific index.
 */
export function executeDeleteBlock(editor: Editor, index: number) {
  const blocks = serializeEditorToBlocks(editor);
  const targetBlock = blocks.find(b => b.index === index);
  if (!targetBlock) return;

  editor.chain().deleteRange({ from: targetBlock.start, to: targetBlock.end }).run();
}

