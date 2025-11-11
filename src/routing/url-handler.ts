import { parseRecipientsFromURL } from '../keys/key-manager';
import { generateX25519KeyPair, storeKeyPairLocally } from '../keys/key-manager';

export interface URLParams {
  recipients: string[];
  receiveMode: boolean;
  fileId?: string;
}

/**
 * Parses URL parameters and returns structured data
 */
export function parseURLParams(): URLParams {
  const params = new URLSearchParams(window.location.search);
  
  const recipients = parseRecipientsFromURL();
  const receiveMode = params.has('receive_mode');
  const fileId = params.get('file') || undefined;
  
  return {
    recipients,
    receiveMode,
    fileId,
  };
}

/**
 * Handles receive mode: auto-generates keypair and sets up decrypt mode
 */
export async function handleReceiveMode(): Promise<{
  keyPair: { privateKey: string; publicKey: string };
  shouldSetDecryptMode: boolean;
}> {
  const urlParams = parseURLParams();
  
  if (!urlParams.receiveMode) {
    return {
      keyPair: { privateKey: '', publicKey: '' },
      shouldSetDecryptMode: false,
    };
  }
  
  // Auto-generate keypair for receive mode
  const keyPair = await generateX25519KeyPair();
  
  // Store the keypair locally
  await storeKeyPairLocally(keyPair, 'Receive Mode Key');
  
  return {
    keyPair,
    shouldSetDecryptMode: true,
  };
}

/**
 * Clears URL parameters (useful for resetting the UI state)
 */
export function clearURLParams(): void {
  const url = new URL(window.location.href);
  url.search = '';
  window.history.replaceState({}, '', url.toString());
}

/**
 * Updates URL with new parameters
 */
export function updateURLParams(params: Partial<URLParams>): void {
  const url = new URL(window.location.href);
  
  // Clear existing recipient parameters
  url.searchParams.delete('r');
  
  // Add new recipients
  if (params.recipients) {
    params.recipients.forEach(recipient => {
      url.searchParams.append('r', recipient);
    });
  }
  
  // Set receive mode
  if (params.receiveMode) {
    url.searchParams.set('receive_mode', '1');
  } else {
    url.searchParams.delete('receive_mode');
  }
  
  // Set file ID
  if (params.fileId) {
    url.searchParams.set('file', params.fileId);
  } else {
    url.searchParams.delete('file');
  }
  
  window.history.replaceState({}, '', url.toString());
}

