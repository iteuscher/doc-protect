import { Recipient } from '../encryption/age-encryption';
import { DocProtectAPI } from '../api/client';

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  recipients: string[];
  createdAt: number;
  updatedAt: number;
}

export interface LocalFile {
  id: string;
  file: File;
  encryptedBlob: string;
  metadata: FileMetadata;
}

const FILES_STORE = 'encrypted-files';
const DB_NAME = 'doc-protect-db';
const DB_VERSION = 1;

/**
 * Stores an encrypted file locally in IndexedDB
 */
export async function storeLocally(
  file: File,
  encryptedBlob: string,
  recipients: string[]
): Promise<string> {
  const fileId = crypto.randomUUID();
  
  const metadata: FileMetadata = {
    name: file.name,
    size: file.size,
    type: file.type,
    recipients,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const localFile: LocalFile = {
    id: fileId,
    file,
    encryptedBlob,
    metadata,
  };

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([FILES_STORE], 'readwrite');
      const store = transaction.objectStore(FILES_STORE);
      
      const addRequest = store.add(localFile);
      addRequest.onsuccess = () => resolve(fileId);
      addRequest.onerror = () => reject(addRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const objectStore = db.createObjectStore(FILES_STORE, {
          keyPath: 'id',
        });
        objectStore.createIndex('name', 'metadata.name', { unique: false });
        objectStore.createIndex('createdAt', 'metadata.createdAt', { unique: false });
      }
    };
  });
}

/**
 * Retrieves all locally stored files
 */
export async function getLocalFiles(): Promise<LocalFile[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([FILES_STORE], 'readonly');
      const store = transaction.objectStore(FILES_STORE);
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        resolve(getAllRequest.result);
      };
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const objectStore = db.createObjectStore(FILES_STORE, {
          keyPath: 'id',
        });
        objectStore.createIndex('name', 'metadata.name', { unique: false });
        objectStore.createIndex('createdAt', 'metadata.createdAt', { unique: false });
      }
    };
  });
}

/**
 * Gets a specific local file by ID
 */
export async function getLocalFile(fileId: string): Promise<LocalFile | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([FILES_STORE], 'readonly');
      const store = transaction.objectStore(FILES_STORE);
      const getRequest = store.get(fileId);
      
      getRequest.onsuccess = () => {
        resolve(getRequest.result || null);
      };
      getRequest.onerror = () => reject(getRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const objectStore = db.createObjectStore(FILES_STORE, {
          keyPath: 'id',
        });
        objectStore.createIndex('name', 'metadata.name', { unique: false });
        objectStore.createIndex('createdAt', 'metadata.createdAt', { unique: false });
      }
    };
  });
}

/**
 * Deletes a local file
 */
export async function deleteLocalFile(fileId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([FILES_STORE], 'readwrite');
      const store = transaction.objectStore(FILES_STORE);
      const deleteRequest = store.delete(fileId);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const objectStore = db.createObjectStore(FILES_STORE, {
          keyPath: 'id',
        });
        objectStore.createIndex('name', 'metadata.name', { unique: false });
        objectStore.createIndex('createdAt', 'metadata.createdAt', { unique: false });
      }
    };
  });
}

/**
 * Reads a file as Uint8Array
 */
export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Uploads an encrypted file to the server
 */
export async function uploadEncryptedFile(
  blob: string,
  metadata: FileMetadata,
  ownerIdentity: string,
  apiBaseUrl?: string
): Promise<string> {
  const api = new DocProtectAPI(apiBaseUrl);
  const response = await api.uploadEncryptedFile({
    encryptedBlob: blob,
    metadata,
    ownerIdentity,
  });
  return response.fileId;
}

/**
 * Downloads an encrypted file from the server
 */
export async function downloadEncryptedFile(
  fileId: string,
  apiBaseUrl?: string
): Promise<{ encryptedBlob: string; metadata: FileMetadata }> {
  const api = new DocProtectAPI(apiBaseUrl);
  return api.downloadEncryptedFile(fileId);
}

/**
 * Downloads a file to the user's device
 */
export function downloadFile(data: Uint8Array, filename: string, mimeType?: string): void {
  const blob = new Blob([data], { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

