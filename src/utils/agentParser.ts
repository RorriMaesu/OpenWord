export interface ToolCallEvent {
  type: 'edit' | 'insert' | 'delete';
  index: number;
  blockType?: string; // e.g. heading, paragraph
  content: string;
  isFinal: boolean;
}

export class AgentStreamParser {
  private buffer = '';
  private conversationalText = '';
  private currentTool: {
    type: 'edit' | 'insert' | 'delete';
    index: number;
    blockType?: string;
    contentBuffer: string;
  } | null = null;

  private finalizedEvents: ToolCallEvent[] = [];

  private onConversationalUpdate: (text: string) => void;
  private onToolCall: (event: ToolCallEvent) => void;

  constructor(
    onConversationalUpdate: (text: string) => void,
    onToolCall: (event: ToolCallEvent) => void
  ) {
    this.onConversationalUpdate = onConversationalUpdate;
    this.onToolCall = onToolCall;
  }

  /**
   * Append a new stream chunk and parse operations.
   */
  public appendChunk(chunk: string) {
    this.buffer += chunk;
    this.parseBuffer();
  }

  /**
   * Get the accumulated conversational text.
   */
  public getConversationalText(): string {
    return this.cleanConversationalText(this.conversationalText);
  }

  /**
   * Get the list of all successfully completed (finalized) tool call events.
   */
  public getFinalizedEvents(): ToolCallEvent[] {
    return this.finalizedEvents;
  }

  /**
   * Strips any leftover XML tags from conversational output.
   */
  private cleanConversationalText(text: string): string {
    return text.replace(/<\/?(?:edit|insert|delete)_block[^>]*>/gi, '');
  }

  /**
   * Parse the accumulated buffer.
   */
  private parseBuffer() {
    let changed = true;

    while (changed) {
      changed = false;

      if (!this.currentTool) {
        // 1. Not in a tool call. Look for opening tags:
        // Supports index="N", index='N', index=N, and case-insensitive matching
        const editMatch = this.buffer.match(/<edit_block\s+index\s*=\s*["']?(-?\d+)["']?\s*>/i);
        const insertMatch = this.buffer.match(/<insert_block\s+after\s*=\s*["']?(-?\d+)["']?(?:\s+type\s*=\s*["']?([a-zA-Z]+)["']?)?\s*>/i);
        const deleteMatch = this.buffer.match(/<delete_block\s+index\s*=\s*["']?(-?\d+)["']?\s*\/?>/i);

        // Find the earliest match index in the current buffer
        const editIdx = editMatch && editMatch.index !== undefined ? editMatch.index : Infinity;
        const insertIdx = insertMatch && insertMatch.index !== undefined ? insertMatch.index : Infinity;
        const deleteIdx = deleteMatch && deleteMatch.index !== undefined ? deleteMatch.index : Infinity;

        const earliestIdx = Math.min(editIdx, insertIdx, deleteIdx);

        if (earliestIdx !== Infinity) {
          // Consume text before the tag as conversational text
          const textBefore = this.buffer.substring(0, earliestIdx);
          if (textBefore) {
            this.conversationalText += textBefore;
            this.onConversationalUpdate(this.cleanConversationalText(this.conversationalText));
          }

          // Cut the consumed buffer up to the tag start
          this.buffer = this.buffer.substring(earliestIdx);

          if (earliestIdx === editIdx && editMatch) {
            this.currentTool = {
              type: 'edit',
              index: parseInt(editMatch[1], 10),
              contentBuffer: ''
            };
            this.buffer = this.buffer.substring(editMatch[0].length);
          } else if (earliestIdx === insertIdx && insertMatch) {
            this.currentTool = {
              type: 'insert',
              index: parseInt(insertMatch[1], 10),
              blockType: insertMatch[2] || 'paragraph',
              contentBuffer: ''
            };
            this.buffer = this.buffer.substring(insertMatch[0].length);
          } else if (earliestIdx === deleteIdx && deleteMatch) {
            const targetIndex = parseInt(deleteMatch[1], 10);
            
            // Delete is instantaneous, track it as finalized immediately
            this.finalizedEvents.push({
              type: 'delete',
              index: targetIndex,
              content: '',
              isFinal: true
            });

            this.onToolCall({
              type: 'delete',
              index: targetIndex,
              content: '',
              isFinal: true
            });
            this.buffer = this.buffer.substring(deleteMatch[0].length);
          }

          changed = true;
        } else {
          // No opening tags found. If there are partial tags starts (e.g. "<edit"),
          // we should leave them in buffer. Otherwise, we yield all safe text.
          const openBracketIdx = this.buffer.lastIndexOf('<');
          if (openBracketIdx !== -1 && !this.buffer.includes('>', openBracketIdx)) {
            // Keep the trailing potential tag part in the buffer if it is within a reasonable limit
            if (this.buffer.length - openBracketIdx < 100) {
              const safeText = this.buffer.substring(0, openBracketIdx);
              if (safeText) {
                this.conversationalText += safeText;
                this.onConversationalUpdate(this.cleanConversationalText(this.conversationalText));
                this.buffer = this.buffer.substring(openBracketIdx);
              }
              changed = false; // Stop parsing to wait for more chunks
            } else {
              // Too long, probably not a tag, yield it
              this.conversationalText += this.buffer;
              this.onConversationalUpdate(this.cleanConversationalText(this.conversationalText));
              this.buffer = '';
            }
          } else {
            // Yield entire buffer as conversational text
            this.conversationalText += this.buffer;
            this.onConversationalUpdate(this.cleanConversationalText(this.conversationalText));
            this.buffer = '';
          }
        }
      } else {
        // 2. Currently inside a tool call. Look for the closing tag:
        // </edit_block> or </insert_block> (case-insensitive and whitespace tolerant)
        const closeTagPattern = this.currentTool.type === 'edit' 
          ? /<\/edit_block\s*>/i 
          : /<\/insert_block\s*>/i;
        const closeMatch = this.buffer.match(closeTagPattern);

        if (closeMatch && closeMatch.index !== undefined) {
          // We found the closing tag!
          const closeIdx = closeMatch.index;
          const innerContent = this.buffer.substring(0, closeIdx);
          this.currentTool.contentBuffer += innerContent;

          this.finalizedEvents.push({
            type: this.currentTool.type,
            index: this.currentTool.index,
            blockType: this.currentTool.blockType,
            content: this.currentTool.contentBuffer,
            isFinal: true
          });

          // Trigger final callback
          this.onToolCall({
            type: this.currentTool.type,
            index: this.currentTool.index,
            blockType: this.currentTool.blockType,
            content: this.currentTool.contentBuffer,
            isFinal: true
          });

          // Consume buffer past the closing tag
          this.buffer = this.buffer.substring(closeIdx + closeMatch[0].length);
          this.currentTool = null;
          changed = true;
        } else {
          // No closing tag yet. Check if we have safe content inside the buffer.
          // Leave some trailing text in buffer in case the closing tag is partially written
          const safeLen = Math.max(0, this.buffer.length - 20);
          if (safeLen > 0) {
            const safeContent = this.buffer.substring(0, safeLen);
            this.currentTool.contentBuffer += safeContent;
            this.buffer = this.buffer.substring(safeLen);

            // Trigger progress callback
            this.onToolCall({
              type: this.currentTool.type,
              index: this.currentTool.index,
              blockType: this.currentTool.blockType,
              content: this.currentTool.contentBuffer,
              isFinal: false
            });
          }
        }
      }
    }
  }

  /**
   * Finalize parsing at the end of the stream (handles unclosed tags gracefully).
   */
  public finalize() {
    if (this.currentTool) {
      // Force finalize the current active tool
      this.currentTool.contentBuffer += this.buffer;
      
      this.finalizedEvents.push({
        type: this.currentTool.type,
        index: this.currentTool.index,
        blockType: this.currentTool.blockType,
        content: this.currentTool.contentBuffer,
        isFinal: true
      });

      this.onToolCall({
        type: this.currentTool.type,
        index: this.currentTool.index,
        blockType: this.currentTool.blockType,
        content: this.currentTool.contentBuffer,
        isFinal: true
      });
      this.currentTool = null;
      this.buffer = '';
    } else if (this.buffer) {
      this.conversationalText += this.buffer;
      this.onConversationalUpdate(this.cleanConversationalText(this.conversationalText));
      this.buffer = '';
    }
  }
}
