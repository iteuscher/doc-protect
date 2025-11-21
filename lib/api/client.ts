/**
 * Lightweight API client for DocProtect serverless routes.
 *
 * All functions throw when the underlying fetch request fails.
 */

import type { DocProtectManifest } from '@/lib/types/bundle';

export interface UploadBundleRequest {
  ownerIdentity: string;
  manifest: DocProtectManifest;
  bundleBlob: Blob;
  fileName: string;
}

export async function uploadBundle(request: UploadBundleRequest) {
  const formData = new FormData();
  formData.append('ownerIdentity', request.ownerIdentity);
  formData.append('manifest', JSON.stringify(request.manifest));
  formData.append('bundle', request.bundleBlob, request.fileName);

  const response = await fetch('/api/bundles', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw await response.json();
  }

  return response.json();
}

export async function listBundles(ownerIdentity?: string) {
  if (typeof window === 'undefined') {
    throw new Error('listBundles can only run in the browser');
  }

  const url = new URL('/api/bundles', window.location.origin);
  if (ownerIdentity) {
    url.searchParams.set('ownerIdentity', ownerIdentity);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw await response.json();
  }

  return response.json();
}

export async function fetchBundleDetails(bundleId: string) {
  const response = await fetch(`/api/bundles/${bundleId}`);
  if (!response.ok) {
    throw await response.json();
  }

  return response.json();
}

export async function requestWebAuthnChallenge() {
  const response = await fetch('/api/auth/challenge');
  if (!response.ok) {
    throw await response.json();
  }

  return response.json();
}
