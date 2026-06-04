// Autosave and Recovery Layer for OpenWord
import { saveDocument, getDocument, saveAsset, getAsset } from './db';
import type { DocumentState } from './db';

// Helper to extract assets from Blob URLs and replace them with persistent keys in JSON content
export async function serializeDocumentAssets(content: any): Promise<any> {
  if (!content) return content;
  
  // Create a deep copy to prevent mutating the active editor state
  const serialized = JSON.parse(JSON.stringify(content));
  
  const traverseAndSerialize = async (node: any) => {
    if (!node) return;
    
    if (node.type === 'image' && node.attrs && typeof node.attrs.src === 'string') {
      const src = node.attrs.src;
      
      if (src.startsWith('blob:')) {
        try {
          // Extract UUID from the blob URL (e.g. blob:http://localhost:5173/uuid)
          const uuid = src.split('/').pop() || Math.random().toString(36).substring(2, 11);
          
          // Fetch raw binary Blob from browser memory
          const res = await fetch(src);
          const blob = await res.blob();
          
          // Cache the binary Blob in IndexedDB
          await saveAsset(uuid, blob);
          
          // Replace URL with reference token
          node.attrs.src = `asset:${uuid}`;
        } catch (err) {
          console.error('Failed to serialize image blob URL:', src, err);
        }
      }
    }
    
    if (Array.isArray(node.content)) {
      await Promise.all(node.content.map(traverseAndSerialize));
    }
  };
  
  await traverseAndSerialize(serialized);
  return serialized;
}

// Helper to hydrate reference tokens back into session-active Blob URLs
export async function hydrateDocumentAssets(content: any): Promise<any> {
  if (!content) return content;
  
  const hydrated = JSON.parse(JSON.stringify(content));
  
  const traverseAndHydrate = async (node: any) => {
    if (!node) return;
    
    if (node.type === 'image' && node.attrs && typeof node.attrs.src === 'string') {
      const src = node.attrs.src;
      
      if (src.startsWith('asset:')) {
        const uuid = src.replace('asset:', '');
        try {
          // Retrieve the binary Blob from IndexedDB
          const blob = await getAsset(uuid);
          if (blob) {
            // Re-create a session-valid Blob URL
            const blobUrl = URL.createObjectURL(blob);
            node.attrs.src = blobUrl;
          } else {
            console.warn(`Binary blob not found in database for asset: ${uuid}`);
            node.attrs.src = ''; // Clear source to prevent broken image displays
          }
        } catch (err) {
          console.error(`Failed to hydrate asset: ${uuid}`, err);
          node.attrs.src = '';
        }
      }
    }
    
    if (Array.isArray(node.content)) {
      await Promise.all(node.content.map(traverseAndHydrate));
    }
  };
  
  await traverseAndHydrate(hydrated);
  return hydrated;
}

// Save document state to DB, serializing blob images
export async function autoSaveDocument(docState: Omit<DocumentState, 'lastSaved'>): Promise<DocumentState> {
  const serializedContent = await serializeDocumentAssets(docState.content);
  const fullDocState: DocumentState = {
    ...docState,
    content: serializedContent,
    lastSaved: Date.now()
  };
  await saveDocument(fullDocState);
  return fullDocState;
}

// Restore document state from DB, hydrating reference assets to active Blob URLs
export async function loadDocumentAndHydrate(id: string): Promise<DocumentState | null> {
  const docState = await getDocument(id);
  if (!docState) return null;
  
  const hydratedContent = await hydrateDocumentAssets(docState.content);
  return {
    ...docState,
    content: hydratedContent
  };
}
