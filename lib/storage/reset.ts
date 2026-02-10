/**
 * Reset Functions for Rico
 * 
 * Provides functions to clear all stored data and reset the application state.
 * Useful for testing and debugging.
 */

import { clearAllData } from './indexeddb';
import { clearPRFCache } from '@/lib/auth/prf-detection';

/**
 * Reset all Rico data
 * 
 * Clears:
 * - All stored credentials
 * - All stored bundles
 * - PRF support cache
 * 
 * WARNING: This is irreversible! All local data will be lost.
 * 
 * @returns Promise that resolves when reset is complete
 */
export async function resetAllData(): Promise<void> {
  await clearAllData();
  clearPRFCache();
}

/**
 * Reset only credentials (keeps bundles and PRF cache)
 * 
 * @returns Promise that resolves when reset is complete
 */
export async function resetCredentials(): Promise<void> {
  const { clearCredentials } = await import('./indexeddb');
  if (clearCredentials) {
    await clearCredentials();
  }
}

