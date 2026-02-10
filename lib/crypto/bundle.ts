/**
 * Rico Bundle Creation and Parsing
 *
 * Handles the .rico (Rico File) format, which is a zip containing:
 * - manifest.json (metadata and policy)
 * - 0.payload (age-encrypted binary)
 *
 * References:
 * - JSZip: https://stuk.github.io/jszip/
 * - OpenTDF manifest: https://opentdf.io/spec/schema/opentdf/manifest
 */

import JSZip from 'jszip';
import type { RicoBundle, RicoManifest } from '@/lib/types/bundle';
import { validatePolicy } from './manifest';

/**
 * Create Rico bundle (.rico file)
 *
 * Creates a zip file containing:
 * 1. manifest.json - Metadata, policy, recipient list
 * 2. 0.payload - age-encrypted file (binary)
 *
 * @param manifest - Rico manifest object
 * @param encryptedPayload - age-encrypted file data
 * @returns Rico bundle with blob
 *
 * @example
 * ```typescript
 * const bundle = await createBundle(manifest, encryptedData);
 *
 * // Download bundle
 * const url = URL.createObjectURL(bundle.blob);
 * const a = document.createElement('a');
 * a.href = url;
 * a.download = 'document.rico';
 * a.click();
 * ```
 */
export async function createBundle(
  manifest: RicoManifest,
  encryptedPayload: Uint8Array,
  existingBundleId?: string
): Promise<RicoBundle> {
  const zip = new JSZip();
  zip.file('manifest.json', compressManifest(manifest));
  zip.file('0.payload', encryptedPayload);

  const zipData = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  const blob = new Blob([zipData as BlobPart], { type: 'application/zip' });
  const bundleId =
    existingBundleId ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`);

  return {
    bundleId,
    blob,
    manifest,
    createdAt: new Date()
  };
}

/**
 * Parse Rico bundle
 *
 * Extracts manifest and encrypted payload from .rico file
 *
 * @param bundleBlob - Bundle file (.rico)
 * @returns Parsed bundle with manifest and payload
 *
 * @throws Error if bundle is invalid or corrupted
 *
 * @example
 * ```typescript
 * const bundle = await parseBundle(uploadedFile);
 * console.log(`File: ${bundle.manifest.fileInfo.name}`);
 * console.log(`Recipients: ${bundle.manifest.encryptionInfo.recipients.length}`);
 * ```
 */
export async function parseBundle(bundleBlob: Blob): Promise<{
  manifest: RicoManifest;
  encryptedPayload: Uint8Array;
  bundleId: string;
}> {
  const zip = await loadZip(bundleBlob);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Bundle missing manifest.json');
  }

  const manifestContent = await manifestFile.async('string');
  let manifest: RicoManifest;

  try {
    manifest = JSON.parse(manifestContent);
  } catch {
    throw new Error('manifest.json is not valid JSON');
  }

  if (!validateManifestSchema(manifest)) {
    throw new Error('Manifest schema invalid');
  }

  const payloadFile = zip.file('0.payload');
  if (!payloadFile) {
    throw new Error('Bundle missing encrypted payload');
  }

  const encryptedPayload = await payloadFile.async('uint8array');
  if (!encryptedPayload.length) {
    throw new Error('Encrypted payload is empty');
  }

  return {
    manifest,
    encryptedPayload,
    bundleId: manifest.policy?.uuid ?? ''
  };
}

/**
 * Validate bundle structure
 *
 * Checks that bundle contains required files and valid manifest
 *
 * @param bundleBlob - Bundle to validate
 * @returns Validation result
 */
export async function validateBundle(bundleBlob: Blob): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const zip = await loadZip(bundleBlob);
    const manifestFile = zip.file('manifest.json');

    if (!manifestFile) {
      errors.push('Missing manifest.json');
    } else {
      try {
        const manifest = JSON.parse(await manifestFile.async('string'));
        if (!validateManifestSchema(manifest)) {
          errors.push('Manifest missing required fields');
        }

        const policyResult = validatePolicy(manifest.policy);
        if (!policyResult.valid) {
          errors.push(...policyResult.errors);
        }
      } catch {
        errors.push('Manifest is not valid JSON');
      }
    }

    const payloadFile = zip.file('0.payload');
    if (!payloadFile) {
      errors.push('Missing 0.payload');
    } else {
      const payload = await payloadFile.async('uint8array');
      if (!payload.length) {
        errors.push('Encrypted payload is empty');
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Invalid bundle: ${message}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract bundle metadata without decrypting
 *
 * Useful for displaying file info before decryption
 *
 * @param bundleBlob - Bundle file
 * @returns Metadata (filename, size, recipient count, policy)
 */
export async function getBundleMetadata(bundleBlob: Blob): Promise<{
  fileName: string;
  fileType: string;
  encryptedSize: number;
  recipientCount: number;
  ownerIdentity: string;
  createdAt: string;
  hasABAC: boolean;
}> {
  const zip = await loadZip(bundleBlob);
  const manifestFile = zip.file('manifest.json');

  if (!manifestFile) {
    throw new Error('Bundle missing manifest.json');
  }

  const manifest = JSON.parse(await manifestFile.async('string')) as RicoManifest;

  return {
    fileName: manifest.fileInfo.name,
    fileType: manifest.fileInfo.type,
    encryptedSize: manifest.fileInfo.encryptedSize,
    recipientCount: manifest.encryptionInfo.recipients.length,
    ownerIdentity: manifest.policy.body.dissem[0] ?? '',
    createdAt: manifest.createdAt,
    hasABAC: manifest.policy.abacRules.enabled
  };
}

/**
 * Update bundle manifest (for access control changes)
 *
 * NOTE: Only updates manifest, does not re-encrypt payload.
 * For true revocation, must re-encrypt entire bundle.
 *
 * @param bundle - Existing bundle
 * @param updatedManifest - New manifest
 * @returns Updated bundle
 */
export async function updateBundleManifest(
  bundle: RicoBundle,
  updatedManifest: RicoManifest
): Promise<RicoBundle> {
  const { encryptedPayload } = await parseBundle(bundle.blob);
  const manifest: RicoManifest = {
    ...updatedManifest,
    manifestVersion: (updatedManifest.manifestVersion ?? bundle.manifest.manifestVersion) + 1,
    createdAt: updatedManifest.createdAt ?? bundle.manifest.createdAt
  };

  return createBundle(manifest, encryptedPayload, bundle.bundleId);
}

// ====================
// INTERNAL HELPERS
// ====================

/**
 * Compress manifest JSON for smaller bundle size
 * @internal
 */
function compressManifest(manifest: RicoManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Validate manifest schema
 * @internal
 */
function validateManifestSchema(manifest: unknown): manifest is RicoManifest {
  if (!manifest || typeof manifest !== 'object') {
    return false;
  }

  const candidate = manifest as Partial<RicoManifest>;
  return (
    typeof candidate.version === 'string' &&
    !!candidate.fileInfo &&
    typeof candidate.fileInfo.name === 'string' &&
    typeof candidate.fileInfo.type === 'string' &&
    typeof candidate.fileInfo.encryptedSize === 'number' &&
    !!candidate.encryptionInfo &&
    Array.isArray(candidate.encryptionInfo.recipients) &&
    !!candidate.policy &&
    Array.isArray(candidate.policy.body?.dissem)
  );
}

async function loadZip(blob: Blob): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(blob);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid bundle archive';
    throw new Error(message);
  }
}
