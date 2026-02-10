import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RicoManifest } from '@/lib/types/bundle';
import {
  uploadBundle,
  listBundles,
  fetchBundleDetails,
  requestWebAuthnChallenge
} from '@/lib/api/client';

const fetchMock = vi.fn();
const testManifest: RicoManifest = {
  version: '1.0.0',
  manifestVersion: 1,
  createdAt: new Date().toISOString(),
  fileInfo: {
    name: 'secret.rico',
    type: 'application/zip',
    encryptedSize: 10
  },
  encryptionInfo: {
    algorithm: 'age',
    format: 'age-encryption.org/v1',
    recipients: []
  },
  policy: {
    uuid: crypto.randomUUID(),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    body: {
      dataAttributes: [],
      dissem: ['AGE-OWNER']
    },
    abacRules: {
      enabled: false,
      rules: []
    }
  }
};

describe('API client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });
  });

  it('uploads bundle with multipart form data', async () => {
    await uploadBundle({
      ownerIdentity: 'AGE-OWNER',
      manifest: testManifest,
      bundleBlob: new Blob(['data']),
      fileName: 'secret.rico'
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/bundles', expect.objectContaining({ method: 'POST' }));
  });

  it('lists bundles for owner', async () => {
    // set window location origin for URL constructor
    Object.defineProperty(window, 'location', {
      value: new URL('https://rico.local'),
      writable: true
    });

    await listBundles('AGE-OWNER');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('fetches bundle details', async () => {
    await fetchBundleDetails('123');
    expect(fetchMock).toHaveBeenCalledWith('/api/bundles/123');
  });

  it('retrieves WebAuthn challenge', async () => {
    await requestWebAuthnChallenge();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/challenge');
  });
});

