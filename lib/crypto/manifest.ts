/**
 * Rico Manifest Generation
 *
 * Creates TDF-inspired manifests with embedded ABAC policies.
 *
 * References:
 * - OpenTDF manifest: https://opentdf.io/spec/schema/opentdf/manifest
 * - TDF spec: https://github.com/virtru/tdf-spec
 */

import type {
  RicoManifest,
  PolicyObject,
  RecipientInfo
} from '@/lib/types/bundle';
import type { WebAuthnCredential, FallbackCredential } from '@/lib/types/credential';
import type { KeypairCredential } from '@/lib/types/encryption-credential';

export interface CreateManifestOptions {
  fileName: string;
  fileType: string;
  originalSize: number;
  encryptedSize: number;
  ownerCredential: WebAuthnCredential | FallbackCredential | KeypairCredential;
  recipients: RecipientInfo[];
  policy?: PolicyObject;
  warnings?: string[];
}

/**
 * Create Rico manifest
 */
export function createManifest(options: CreateManifestOptions): RicoManifest {
  const {
    fileName,
    fileType,
    originalSize,
    encryptedSize,
    ownerCredential,
    recipients,
    policy,
    warnings = []
  } = options;

  const timestamp = new Date().toISOString();
  const manifestRecipients = [
    credentialToRecipient(ownerCredential, 'owner'),
    ...recipients
  ];

  const policyObject =
    policy ??
    createDefaultPolicy(resolveCredentialIdentity(ownerCredential), manifestRecipients);

  const policyValidation = validatePolicy(policyObject);
  if (!policyValidation.valid) {
    throw new Error(
      `Invalid policy configuration: ${policyValidation.errors.join(', ')}`
    );
  }

  const manifestWarnings = [...warnings];
  if (ownerCredential.type === 'fallback-pbkdf2') {
    manifestWarnings.push(
      'Encrypted using WebAuthn fallback (PBKDF2). Not compatible with age CLI.'
    );
  }

  return {
    version: '1.0.0',
    manifestVersion: 1,
    createdAt: timestamp,
    fileInfo: {
      name: fileName,
      type: fileType || 'application/octet-stream',
      encryptedSize,
      originalSize
    },
    encryptionInfo: {
      algorithm: ownerCredential.type === 'fallback-pbkdf2'
        ? 'age-fallback'
        : ownerCredential.type === 'pq-keypair'
        ? 'age-pq'
        : ownerCredential.type === 'x25519-keypair'
        ? 'age-x25519'
        : 'age',
      format: 'age-encryption.org/v1',
      recipients: manifestRecipients
    },
    policy: policyObject,
    warnings: manifestWarnings.length ? manifestWarnings : undefined
  };
}

/**
 * Create default policy object
 */
export function createDefaultPolicy(
  ownerIdentity: string,
  recipients: RecipientInfo[]
): PolicyObject {
  const now = new Date().toISOString();
  const dissemSet = new Set<string>();
  dissemSet.add(ownerIdentity);

  recipients.forEach((recipient) => {
    const identifier = recipient.identity || recipient.publicKey || recipient.credentialId;
    if (identifier) {
      dissemSet.add(identifier);
    }
  });

  return {
    uuid: safeUUID(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    body: {
      dataAttributes: [],
      dissem: Array.from(dissemSet)
    },
    abacRules: {
      enabled: false,
      rules: []
    }
  };
}

export function createABACPolicy(): PolicyObject {
  throw new Error('ABAC not implemented in MVP - use createDefaultPolicy()');
}

/**
 * Validate policy object
 */
export function validatePolicy(policy: PolicyObject): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isValidUUID(policy.uuid)) {
    errors.push('Policy UUID must be a valid UUID');
  }

  if (!Number.isInteger(policy.version) || policy.version < 1) {
    errors.push('Policy version must be a positive integer');
  }

  if (!isValidISODate(policy.createdAt) || !isValidISODate(policy.updatedAt)) {
    errors.push('Policy timestamps must be ISO-8601 strings');
  }

  if (!Array.isArray(policy.body?.dissem)) {
    errors.push('Policy body.dissem must be an array');
  }

  if (!Array.isArray(policy.body?.dataAttributes)) {
    errors.push('Policy body.dataAttributes must be an array');
  }

  if (policy.abacRules.enabled && !Array.isArray(policy.abacRules.rules)) {
    errors.push('ABAC rules must be provided when ABAC is enabled');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Update policy (increment version, update timestamp)
 */
export function updatePolicy(
  existingPolicy: PolicyObject,
  changes: {
    addDissem?: string[];
    removeDissem?: string[];
    addAttributes?: Array<{ attribute: string; displayName: string }>;
    removeAttributes?: string[];
  }
): PolicyObject {
  const now = new Date().toISOString();
  const updatedDissem = new Set(existingPolicy.body.dissem);

  changes.addDissem?.forEach((id) => updatedDissem.add(id));
  changes.removeDissem?.forEach((id) => updatedDissem.delete(id));

  const updatedAttributes = [...existingPolicy.body.dataAttributes];

  changes.addAttributes?.forEach((attr) => {
    if (!updatedAttributes.find((existing) => existing.attribute === attr.attribute)) {
      updatedAttributes.push(attr);
    }
  });

  if (changes.removeAttributes?.length) {
    for (const attrId of changes.removeAttributes) {
      const index = updatedAttributes.findIndex((attr) => attr.attribute === attrId);
      if (index >= 0) {
        updatedAttributes.splice(index, 1);
      }
    }
  }

  return {
    ...existingPolicy,
    version: existingPolicy.version + 1,
    updatedAt: now,
    body: {
      dataAttributes: updatedAttributes,
      dissem: Array.from(updatedDissem)
    }
  };
}
  
  /**
   * Check if identity is in policy's dissem list
   * 
   * @param policy - Policy to check
   * @param identity - age identity or public key
   * @returns True if identity has access
   */
  export function checkPolicyAccess(
    policy: PolicyObject,
    identity: string
  ): boolean {
    // TODO: Implement access check
    // MVP: Simple dissem list lookup
    // Phase 3: Full ABAC evaluation
    
    return policy.body.dissem.includes(identity);
  }

function credentialToRecipient(
  credential: WebAuthnCredential | FallbackCredential | KeypairCredential,
  role: 'owner' | 'recipient'
): RecipientInfo {
  if (credential.type === 'fallback-pbkdf2') {
    return {
      type: 'fallback-pbkdf2',
      credentialId: credential.credentialId,
      identity: credential.credentialId,
      role,
      label: credential.keyName
    };
  }

  if (credential.type === 'pq-keypair') {
    return {
      type: 'pq-hybrid',
      publicKey: credential.recipient,
      identity: credential.identity,
      role,
      label: credential.label,
    };
  }

  if (credential.type === 'x25519-keypair') {
    return {
      type: 'x25519',
      publicKey: credential.recipient,
      identity: credential.identity,
      role,
      label: credential.label,
    };
  }

  // At this point, credential must be WebAuthnCredential
  const webauthnCred = credential as WebAuthnCredential;
  return {
    type: webauthnCred.type === 'security-key' ? 'webauthn-securitykey' : 'webauthn-passkey',
    identity: webauthnCred.identity,
    credentialId: webauthnCred.credentialId,
    role,
    label: webauthnCred.keyName
  };
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isValidISODate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function resolveCredentialIdentity(
  credential: WebAuthnCredential | FallbackCredential | KeypairCredential
): string {
  if (credential.type === 'fallback-pbkdf2') return credential.credentialId;
  if (credential.type === 'pq-keypair' || credential.type === 'x25519-keypair') return credential.recipient;
  return credential.identity;
}