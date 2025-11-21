/**
 * DocProtect Bundle Type Definitions
 * 
 * Based on OpenTDF manifest structure with age encryption
 * References:
 * - OpenTDF: https://opentdf.io/spec/schema/opentdf/manifest
 * - age spec: https://age-encryption.org/v1
 */

export interface DocProtectBundle {
    /** Unique bundle identifier (UUID v4) */
    bundleId: string;
    
    /** Blob containing the .dpf file (zip) */
    blob: Blob;
    
    /** Parsed manifest from bundle */
    manifest: DocProtectManifest;
    
    /** Creation timestamp */
    createdAt: Date;
  }
  
  export interface DocProtectManifest {
    /** Manifest version (semver) */
    version: string;
    
    /** Information about the original file */
    fileInfo: FileInfo;
    
    /** Encryption metadata */
    encryptionInfo: EncryptionInfo;
    
    /** Access control policy (TDF-inspired) */
    policy: PolicyObject;
    
    /** Manifest creation timestamp */
    createdAt: string;
    
    /** Manifest version number (incremented on updates) */
    manifestVersion: number;
    
    /** Optional warnings (e.g., PRF fallback) */
    warnings?: string[];
  }
  
  export interface FileInfo {
    /** Original filename */
    name: string;
    
    /** MIME type */
    type: string;
    
    /** Size of encrypted payload in bytes */
    encryptedSize: number;
    
    /** Optional: Original file size (before encryption) */
    originalSize?: number;
  }
  
  export interface EncryptionInfo {
    /** Encryption algorithm identifier */
    algorithm: 'age' | 'age-fallback';
    
    /** age format version */
    format: 'age-encryption.org/v1';
    
    /** List of recipients who can decrypt */
    recipients: RecipientInfo[];
    
    /** Optional: Additional encryption metadata */
    metadata?: Record<string, unknown>;
  }
  
  export interface RecipientInfo {
    /** Recipient type */
    type: 'webauthn-passkey' | 'webauthn-securitykey' | 'x25519' | 'fallback-pbkdf2';
    
    /** age identity string (for WebAuthn PRF or X25519) */
    identity?: string;
    
    /** X25519 public key (for standard age recipients) */
    publicKey?: string;
    
    /** WebAuthn credential ID (for fallback mode) */
    credentialId?: string;
    
    /** Role: owner can update policy, recipients can only read */
    role: 'owner' | 'recipient';
    
    /** Optional: Salt for fallback encryption */
    salt?: string;
    
    /** Optional: Human-readable label */
    label?: string;
  }
  
  export interface PolicyObject {
    /** Unique policy identifier (UUID v4) */
    uuid: string;
    
    /** Policy version number */
    version: number;
    
    /** Policy creation timestamp */
    createdAt: string;
    
    /** Last update timestamp */
    updatedAt: string;
    
    /** Policy body (ABAC-compatible structure) */
    body: PolicyBody;
    
    /** ABAC rules (scaffolding for Phase 3) */
    abacRules: ABACRules;
  }
  
  export interface PolicyBody {
    /**
     * Data attributes required to access (OpenTDF ABAC)
     * MVP: Empty array
     * Future: ["https://docprotect.app/attr/clearance/value/secret"]
     */
    dataAttributes: DataAttribute[];
    
    /**
     * Dissemination list - identities/public keys allowed to access
     * MVP: Simple string array of age identities/public keys
     */
    dissem: string[];
  }
  
  export interface DataAttribute {
    /** Fully-qualified attribute URI */
    attribute: string;
    
    /** Human-readable label */
    displayName?: string;
  }
  
  export interface ABACRules {
    /** Whether ABAC evaluation is enabled (false for MVP) */
    enabled: boolean;
    
    /** Attribute rules (empty for MVP) */
    rules: AttributeRule[];
  }
  
  export interface AttributeRule {
    /** Attribute namespace (e.g., "https://docprotect.app") */
    attributeNamespace: string;
    
    /** Canonical attribute name */
    canonicalName: string;
    
    /** Rule type for comparison */
    ruleType: 'allOf' | 'anyOf' | 'hierarchy';
    
    /** For hierarchy rules: ordered list of values */
    order?: string[];
    
    /** For anyOf/allOf rules: allowed values */
    allowedValues?: string[];
  }