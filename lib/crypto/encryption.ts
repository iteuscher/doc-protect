/**
 * Rico Encryption Engine
 * 
 * Wrapper around typage (age-encryption npm package) for Rico-specific
 * encryption workflows.
 * 
 * References:
 * - typage: https://github.com/FiloSottile/typage
 * - age spec: https://age-encryption.org/v1
 * - typage README: docs/typage_README.md (see "Encrypt and decrypt a file with a passkey")
 */

import * as age from 'age-encryption';
import type {
  RicoBundle,
  RecipientInfo,
  PolicyObject,
  RicoManifest
} from '@/lib/types/bundle';
import type { WebAuthnCredential, FallbackCredential } from '@/lib/types/credential';
import type { KeypairCredential } from '@/lib/types/encryption-credential';
import { createBundle, parseBundle } from './bundle';
import { createManifest, updatePolicy } from './manifest';
import {
  encryptWithFallback,
  decryptWithFallback,
  isFallbackCredential
} from '@/lib/auth/fallback';

export interface EncryptOptions {
  /** File to encrypt */
  file: File;

  /** Owner's credential (for encryption) */
  ownerCredential: WebAuthnCredential | FallbackCredential | KeypairCredential;

  /** Additional recipients (optional) */
  recipients?: RecipientInfo[];

  /** Access control policy (optional, defaults created if not provided) */
  policy?: PolicyObject;
}

export interface DecryptOptions {
  /** Rico bundle to decrypt */
  bundle: RicoBundle;

  /** Credential to use for decryption (optional - will prompt if not provided) */
  credential?: WebAuthnCredential | FallbackCredential | KeypairCredential;
}

export interface DecryptResult {
  /** Decrypted file data */
  data: Uint8Array;
  
  /** Original filename */
  fileName: string;
  
  /** MIME type */
  mimeType: string;
  
  /** Policy that governed access */
  policy: PolicyObject;
}

/**
 * Main encryption function
 * 
 * @param options - Encryption options
 * @returns Encrypted Rico bundle
 * 
 * @example
 * ```typescript
 * const credential = await createCredential({ ... });
 * const bundle = await encryptFile({
 *   file: myFile,
 *   ownerCredential: credential,
 *   recipients: [
 *     { type: 'x25519', publicKey: 'age1...', role: 'recipient' }
 *   ]
 * });
 * ```
 */
export async function encryptFile(options: EncryptOptions): Promise<RicoBundle> {
  const { file, ownerCredential, recipients = [], policy } = options;
  if (!file) {
    throw new Error('File is required for encryption');
  }

  const fileBuffer = new Uint8Array(await file.arrayBuffer());
  let encryptedPayload: Uint8Array;
  const manifestRecipients = [...recipients];
  const warnings: string[] = [];
  let fallbackSalt: string | null = null;

  if (ownerCredential.type === 'fallback-pbkdf2') {
    if (recipients.length > 0) {
      throw new Error('Fallback mode currently supports only the owner credential');
    }

    const { encryptedData, salt } = await encryptWithFallback(
      file,
      ownerCredential as FallbackCredential
    );

    warnings.push(
      'Encrypted using WebAuthn fallback (PBKDF2). Not compatible with age CLI.'
    );

    encryptedPayload = encryptedData;
    fallbackSalt = arrayBufferToBase64(salt);
  } else if (ownerCredential.type === 'pq-keypair' || ownerCredential.type === 'x25519-keypair') {
    const encrypter = await createEncrypterWithRecipients(ownerCredential, recipients);
    encryptedPayload = await encrypter.encrypt(fileBuffer);
  } else {
    const encrypter = await createEncrypterWithRecipients(ownerCredential, recipients);
    encryptedPayload = await encrypter.encrypt(fileBuffer);
  }

  const manifest = createManifest({
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    originalSize: file.size,
    encryptedSize: encryptedPayload.length,
    ownerCredential,
    recipients: manifestRecipients,
    policy,
    warnings
  });

  // If fallback mode was used, inject salt into owner recipient entry
  if (ownerCredential.type === 'fallback-pbkdf2' && manifest.encryptionInfo.recipients[0]) {
    manifest.encryptionInfo.recipients[0].salt = fallbackSalt ?? manifest.encryptionInfo.recipients[0].salt;
    manifest.encryptionInfo.recipients[0].identity =
      manifest.encryptionInfo.recipients[0].identity ?? ownerCredential.credentialId;
  }

  return createBundle(manifest, encryptedPayload);
}

/**
 * Main decryption function
 * 
 * @param options - Decryption options
 * @returns Decrypted file data and metadata
 * 
 * @example
 * ```typescript
 * const decrypted = await decryptFile({
 *   bundle: downloadedBundle,
 *   credential: myCredential  // Optional
 * });
 * 
 * // Save decrypted file
 * const blob = new Blob([decrypted.data], { type: decrypted.mimeType });
 * saveAs(blob, decrypted.fileName);
 * ```
 */
export async function decryptFile(options: DecryptOptions): Promise<DecryptResult> {
  const { bundle, credential } = options;
  
  try {
    const parsed = await parseBundle(bundle.blob);
    const { manifest, encryptedPayload } = parsed;

    // Diagnostic: Log bundle info for debugging
    console.log('Decrypting bundle:', {
      algorithm: manifest.encryptionInfo.algorithm,
      recipientCount: manifest.encryptionInfo.recipients.length,
      recipientTypes: manifest.encryptionInfo.recipients.map(r => r.type),
      credentialType: credential?.type,
      credentialId: credential && 'credentialId' in credential ? credential.credentialId : undefined
    });

    let decrypted: Uint8Array;

    if (manifest.encryptionInfo.algorithm === 'age-fallback') {
      if (!credential || !isFallbackCredential(credential)) {
        throw new Error(
          'Fallback decryption requires the original fallback credential. ' +
          'The bundle was encrypted with fallback mode, but the selected credential is not a fallback credential.'
        );
      }

      console.log('Fallback decryption - checking recipients:', {
        bundleRecipients: manifest.encryptionInfo.recipients.map(r => ({
          credentialId: r.credentialId,
          type: r.type,
          hasSalt: !!r.salt,
          label: r.label
        })),
        selectedCredentialId: credential.credentialId
      });

      const ownerRecipient = manifest.encryptionInfo.recipients.find(
        (recipient) => recipient.credentialId === credential.credentialId
      );

      if (!ownerRecipient) {
        // Get user-friendly names for better error message
        const bundleCredentialName = manifest.encryptionInfo.recipients[0]?.label || 
          manifest.encryptionInfo.recipients[0]?.credentialId?.substring(0, 8) + '...' || 
          'unknown credential';
        const bundleCredentialType = manifest.encryptionInfo.recipients[0]?.type === 'fallback-pbkdf2' 
          ? 'fallback credential' 
          : manifest.encryptionInfo.recipients[0]?.type === 'webauthn-passkey'
          ? 'passkey'
          : manifest.encryptionInfo.recipients[0]?.type === 'webauthn-securitykey'
          ? 'security key'
          : 'credential';
        
        const selectedCredentialName = credential.keyName || 
          credential.credentialId.substring(0, 8) + '...';
        
        throw new Error(
          `Wrong credential selected.\n\n` +
          `You selected: "${selectedCredentialName}"\n` +
          `But this file was encrypted with: "${bundleCredentialName}" (${bundleCredentialType})\n\n` +
          `Please select the credential that was used to encrypt this file.`
        );
      }

      if (!ownerRecipient?.salt) {
        throw new Error('Fallback salt missing from manifest. The bundle may be corrupted or was encrypted incorrectly.');
      }

      console.log('Fallback decryption - using salt:', {
        saltLength: ownerRecipient.salt.length,
        encryptedPayloadLength: encryptedPayload.length
      });

      try {
        decrypted = await decryptWithFallback(
          encryptedPayload,
          base64ToUint8(ownerRecipient.salt),
          credential
        );
        console.log('Fallback decryption successful, decrypted length:', decrypted.length);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Fallback decryption error:', error);
        throw new Error(
          `Failed to decrypt fallback bundle: ${errorMessage}\n\n` +
          `Debug info:\n` +
          `- Credential ID: ${credential.credentialId}\n` +
          `- Salt present: ${!!ownerRecipient.salt}\n` +
          `- Encrypted payload length: ${encryptedPayload.length}\n\n` +
          `Possible causes:\n` +
          `1. Wrong credential (not the one used to encrypt)\n` +
          `2. File was corrupted or modified\n` +
          `3. Bundle was encrypted with PRF but manifest incorrectly says fallback\n` +
          `4. Salt encoding/decoding issue`
        );
      }
    } else {
      // Standard age decryption (WebAuthn PRF, PQ hybrid, or x25519)
      if (credential && isFallbackCredential(credential)) {
        throw new Error('Cannot use fallback credential to decrypt age-encrypted bundle');
      }

      const isKeypairCredential = credential && (credential.type === 'pq-keypair' || credential.type === 'x25519-keypair');

      // Verify credential matches bundle (if provided)
      if (credential && !isKeypairCredential && 'identity' in credential && credential.identity) {
        const matchingRecipient = manifest.encryptionInfo.recipients.find(
          (recipient) => recipient.identity === credential.identity
        );

        if (!matchingRecipient) {
          const bundleCredentialName = manifest.encryptionInfo.recipients[0]?.label ||
            manifest.encryptionInfo.recipients[0]?.identity?.substring(0, 20) + '...' ||
            'unknown credential';
          const bundleCredentialType = manifest.encryptionInfo.recipients[0]?.type === 'webauthn-passkey'
            ? 'passkey'
            : manifest.encryptionInfo.recipients[0]?.type === 'webauthn-securitykey'
            ? 'security key'
            : 'credential';

          const webauthnCred = credential as WebAuthnCredential;
          const selectedCredentialName = webauthnCred.keyName ||
            webauthnCred.identity.substring(0, 20) + '...';

          throw new Error(
            `Wrong credential selected.\n\n` +
            `You selected: "${selectedCredentialName}"\n` +
            `But this file was encrypted with: "${bundleCredentialName}" (${bundleCredentialType})\n\n` +
            `Please select the credential that was used to encrypt this file.`
          );
        }
      }

      // For keypair credentials, verify the recipient matches
      if (isKeypairCredential) {
        const keypairCred = credential as KeypairCredential;
        const matchingRecipient = manifest.encryptionInfo.recipients.find(
          (recipient) => recipient.publicKey === keypairCred.recipient || recipient.identity === keypairCred.identity
        );

        if (!matchingRecipient) {
          throw new Error(
            `Wrong keypair selected.\n\n` +
            `You selected: "${keypairCred.label}"\n` +
            `But this file was not encrypted with this keypair.\n\n` +
            `Please select the keypair that was used to encrypt this file.`
          );
        }
      }

      // Build the decrypter
      let decrypterCredential: WebAuthnCredential | KeypairCredential | undefined;
      if (isKeypairCredential) {
        decrypterCredential = credential as KeypairCredential;
      } else if (credential && !isFallbackCredential(credential)) {
        decrypterCredential = credential as WebAuthnCredential;
      }

      const decrypter = createDecrypterWithIdentity(decrypterCredential);
      
      try {
        decrypted = await decrypter.decrypt(encryptedPayload);
      } catch (decryptError: unknown) {
        const errorMessage = decryptError instanceof Error ? decryptError.message : 'Decryption failed';
        
        // Provide more helpful error messages
        if (errorMessage.includes('No identity') || errorMessage.includes('authentication')) {
          throw new Error('WebAuthn authentication failed. Please try again and make sure to complete the passkey prompt.');
        } else if (errorMessage.includes('recipient') || errorMessage.includes('identity')) {
          throw new Error('This credential cannot decrypt this bundle. Make sure you\'re using the correct credential.');
        }
        
        throw new Error(`Decryption failed: ${errorMessage}`);
      }
    }

    return {
      data: decrypted,
      fileName: manifest.fileInfo.name,
      mimeType: manifest.fileInfo.type,
      policy: manifest.policy
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error during decryption');
  }
}

/**
 * Add recipient to existing bundle (requires re-encryption)
 * 
 * NOTE: This requires the owner's credential to decrypt, add recipient, and re-encrypt
 * 
 * @param bundle - Existing bundle
 * @param ownerCredential - Owner's credential
 * @param newRecipient - New recipient to add
 * @returns Updated bundle with new recipient
 */
export async function addRecipient(
  bundle: RicoBundle,
  ownerCredential: WebAuthnCredential,
  newRecipient: RecipientInfo
): Promise<RicoBundle> {
  const decrypted = await decryptFile({ bundle, credential: ownerCredential });
  const updatedManifest = await getUpdatedManifest(bundle, (manifest) => {
    const recipients = [...manifest.encryptionInfo.recipients, newRecipient];
    return {
      ...manifest,
      encryptionInfo: {
        ...manifest.encryptionInfo,
        recipients
      },
      policy: updatePolicy(manifest.policy, {
        addDissem: [recipientIdentifier(newRecipient)]
      })
    };
  });

  const file = new File([decrypted.data as BlobPart], decrypted.fileName, { type: decrypted.mimeType });
  return encryptFile({
    file,
    ownerCredential,
    recipients: updatedManifest.encryptionInfo.recipients.filter((r) => r.role !== 'owner'),
    policy: updatedManifest.policy
  });
}

/**
 * Remove recipient from bundle (requires re-encryption for true revocation)
 * 
 * NOTE: Simply removing from manifest doesn't prevent decryption if recipient
 * already has the encrypted bundle. True revocation requires re-encryption.
 * 
 * @param bundle - Existing bundle
 * @param ownerCredential - Owner's credential
 * @param recipientToRemove - Identity or public key to remove
 * @returns Updated bundle without the recipient
 */
export async function removeRecipient(
  bundle: RicoBundle,
  ownerCredential: WebAuthnCredential,
  recipientToRemove: string
): Promise<RicoBundle> {
  const decrypted = await decryptFile({ bundle, credential: ownerCredential });

  const updatedManifest = await getUpdatedManifest(bundle, (manifest) => {
    const recipients = manifest.encryptionInfo.recipients.filter((recipient) => {
      const identifier = recipient.identity || recipient.publicKey || recipient.credentialId;
      return identifier !== recipientToRemove;
    });

    return {
      ...manifest,
      encryptionInfo: {
        ...manifest.encryptionInfo,
        recipients
      },
      policy: updatePolicy(manifest.policy, {
        removeDissem: [recipientToRemove]
      })
    };
  });

  const file = new File([decrypted.data as BlobPart], decrypted.fileName, { type: decrypted.mimeType });

  return encryptFile({
    file,
    ownerCredential,
    recipients: updatedManifest.encryptionInfo.recipients.filter((r) => r.role !== 'owner'),
    policy: updatedManifest.policy
  });
}

// ====================
// INTERNAL HELPERS
// ====================

/**
 * Create age.Encrypter with recipients
 * 
 * @internal
 */
async function createEncrypterWithRecipients(
  ownerCredential: WebAuthnCredential | KeypairCredential,
  recipients: RecipientInfo[]
): Promise<age.Encrypter> {
  const encrypter = new age.Encrypter();

  // Add owner as first recipient
  if (ownerCredential.type === 'pq-keypair' || ownerCredential.type === 'x25519-keypair') {
    // PQ and x25519: pass recipient string directly
    encrypter.addRecipient(ownerCredential.recipient);
  } else if (ownerCredential.type === 'passkey' || ownerCredential.type === 'security-key') {
    // WebAuthn: use WebAuthnRecipient object
    encrypter.addRecipient(
      new age.webauthn.WebAuthnRecipient({
        identity: ownerCredential.identity
      })
    );
  }

  // Add additional recipients
  for (const recipient of recipients) {
    if (recipient.type === 'pq-hybrid' && recipient.publicKey) {
      encrypter.addRecipient(recipient.publicKey);
    } else if (recipient.type === 'webauthn-passkey') {
      encrypter.addRecipient(
        new age.webauthn.WebAuthnRecipient({
          identity: recipient.identity
        })
      );
    } else if (recipient.type === 'webauthn-securitykey' && recipient.identity) {
      encrypter.addRecipient(
        new age.webauthn.WebAuthnRecipient({ identity: recipient.identity })
      );
    } else if (recipient.type === 'x25519' && recipient.publicKey) {
      encrypter.addRecipient(recipient.publicKey);
    }
  }

  return encrypter;
}

/**
 * Create age.Decrypter with identity
 * 
 * @internal
 */
function createDecrypterWithIdentity(credential?: WebAuthnCredential | KeypairCredential): age.Decrypter {
  const decrypter = new age.Decrypter();

  if (credential) {
    if (credential.type === 'pq-keypair' || credential.type === 'x25519-keypair') {
      // PQ and x25519: pass identity string directly
      decrypter.addIdentity(credential.identity);
    } else {
      // WebAuthn: use WebAuthnIdentity object
      decrypter.addIdentity(
        new age.webauthn.WebAuthnIdentity({ identity: credential.identity })
      );
    }
  } else {
    // Let user select passkey from browser prompt
    decrypter.addIdentity(new age.webauthn.WebAuthnIdentity());
  }

  return decrypter;
}

async function getUpdatedManifest(
  bundle: RicoBundle,
  updater: (manifest: RicoManifest) => RicoManifest
): Promise<RicoManifest> {
  const { manifest } = await parseBundle(bundle.blob);
  return updater({
    ...manifest,
    manifestVersion: manifest.manifestVersion + 1
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function recipientIdentifier(recipient: RecipientInfo): string {
  return recipient.identity || recipient.publicKey || recipient.credentialId || '';
}