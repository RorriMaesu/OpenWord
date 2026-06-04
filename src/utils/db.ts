// Lightweight, robust IndexedDB wrapper for OpenWord autosave and binary asset caching

const DB_NAME = 'OpenWordDB';
const DB_VERSION = 2;
const DOC_STORE = 'documents';
const ASSET_STORE = 'assets';

export interface DocumentState {
  id: string;
  title: string;
  content: any; // Tiptap JSON content
  headers: {
    default: string;
    firstPage?: string;
    differentFirstPage: boolean;
  };
  footers: {
    default: string;
    differentFirstPage: boolean;
  };
  margins: {
    top: number; // in px or mm
    bottom: number;
    left: number;
    right: number;
  };
  orientation: 'portrait' | 'landscape';
  pageSize: 'A4' | 'Letter';
  zoom: number;
  lastSaved: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOC_STORE)) {
        db.createObjectStore(DOC_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        db.createObjectStore(ASSET_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveDocument(doc: DocumentState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readwrite');
    const store = transaction.objectStore(DOC_STORE);
    const request = store.put(doc);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getDocument(id: string): Promise<DocumentState | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readonly');
    const store = transaction.objectStore(DOC_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllDocuments(): Promise<DocumentState[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readonly');
    const store = transaction.objectStore(DOC_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOC_STORE, 'readwrite');
    const store = transaction.objectStore(DOC_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Binary asset caching methods
export async function saveAsset(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE, 'readwrite');
    const store = transaction.objectStore(ASSET_STORE);
    const request = store.put(blob, id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAsset(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE, 'readonly');
    const store = transaction.objectStore(ASSET_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE, 'readwrite');
    const store = transaction.objectStore(ASSET_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
