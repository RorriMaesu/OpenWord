// File System Access API wrapper with legacy fallback downloads

// TypeScript global interfaces for File System Access API
declare global {
  interface Window {
    showOpenFilePicker?: (options?: any) => Promise<any[]>;
    showSaveFilePicker?: (options?: any) => Promise<any>;
  }
}

let activeFileHandle: any = null;

export interface FileData {
  name: string;
  data: ArrayBuffer;
  handle: any;
}

export const fileSystemHelper = {
  // Check if browser supports modern File System Access API
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  },

  // Set the current file handle
  setHandle(handle: any) {
    activeFileHandle = handle;
  },

  // Clear current file handle
  clearHandle() {
    activeFileHandle = null;
  },

  // Get active handle
  getHandle() {
    return activeFileHandle;
  },

  // Open a file using showOpenFilePicker
  async openFile(options?: {
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }): Promise<FileData | null> {
    if (!this.isSupported()) {
      throw new Error('File System Access API is not supported in this browser.');
    }

    try {
      const [handle] = await window.showOpenFilePicker!({
        multiple: false,
        ...options,
      });

      const file = await handle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      activeFileHandle = handle;

      return {
        name: file.name,
        data: arrayBuffer,
        handle,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null; // User cancelled the picker
      }
      throw err;
    }
  },

  // Save changes directly back to the active handle (Ctrl+S)
  async saveToActiveHandle(content: ArrayBuffer | string | Blob): Promise<boolean> {
    if (!activeFileHandle) return false;

    try {
      // Query writable permission
      const options = { mode: 'readwrite' };
      if ((await activeFileHandle.queryPermission(options)) !== 'granted') {
        if ((await activeFileHandle.requestPermission(options)) !== 'granted') {
          throw new Error('Write permission was denied by the user.');
        }
      }

      const writable = await activeFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err) {
      console.error('Failed to save to active file handle:', err);
      throw err;
    }
  },

  // Save as a new file using showSaveFilePicker
  async saveAsNewFile(
    content: ArrayBuffer | string | Blob,
    defaultName: string,
    options?: {
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }
  ): Promise<string | null> {
    if (!this.isSupported()) {
      // Fallback to legacy download
      this.legacyDownload(content, defaultName);
      return defaultName;
    }

    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName: defaultName,
        ...options,
      });

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();

      activeFileHandle = handle;
      return handle.name;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null; // User cancelled the picker
      }
      // Fallback if writing fails
      this.legacyDownload(content, defaultName);
      return defaultName;
    }
  },

  // Legacy fallback download method
  legacyDownload(content: ArrayBuffer | string | Blob, filename: string) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
