/**
 * WebAuthn Credential Type Definitions
 * 
 * Defines types for WebAuthn credentials used in DocProtect.
 * Supports both PRF-enabled and fallback credentials.
 * 
 * References:
 * - WebAuthn: https://w3c.github.io/webauthn/
 * - PRF: https://w3c.github.io/webauthn/#prf-extension
 */

export interface WebAuthnCredential {
    /** Unique credential identifier */
    credentialId: string;
    
    /** 
     * age identity string (AGE-PLUGIN-FIDO2PRF-1...) 
     * For PRF credentials: returned by age.webauthn.createCredential()
     * For fallback: generated credential ID
     */
    identity: string;
    
    /** Credential type */
    type: 'passkey' | 'security-key';
    
    /** Human-readable name */
    keyName: string;
    
    /** User identifier (email or username) */
    userId: string;
    
    /** User display name */
    userName: string;
    
    /** Whether PRF is supported for this credential */
    prfEnabled: boolean;
    
    /** Creation timestamp */
    createdAt: string;
    
    /** Last used timestamp */
    lastUsed?: string;
    
    /** Additional metadata */
    metadata?: CredentialMetadata;
  }
  
  export interface CredentialMetadata {
    /** Browser/platform info */
    userAgent?: string;
    
    /** Authenticator AAGUID (if available) */
    aaguid?: string;
    
    /** Whether credential is backed up (synced) */
    backupEligible?: boolean;
    
    /** Whether credential is currently backed up */
    backupState?: boolean;
    
    /** Relying party ID */
    rpId?: string;
  }
  
  export interface CreateCredentialOptions {
    /** User identifier (email) - optional, defaults to 'user@docprotect.local' */
    userId?: string;

    /** User display name - optional, defaults to 'DocProtect User' */
    userName?: string;

    /** Human-readable key name - optional, will default to generated name */
    keyName?: string;

    /** Credential type (defaults to passkey) */
    type?: 'passkey' | 'security-key';

    /** Force fallback mode (for testing) */
    forceFallback?: boolean;
  }
  
  export interface PRFSupport {
    /** Whether PRF extension is supported */
    supported: boolean;
    
    /** Whether fallback encryption is required */
    fallbackRequired: boolean;
    
    /** Fallback method to use */
    fallbackMethod?: 'pbkdf2-webauthn' | 'passphrase';
    
    /** Browser/platform info */
    platform?: string;
    
    /** Detected at timestamp */
    detectedAt?: string;
  }
  
export interface FallbackCredential extends Omit<WebAuthnCredential, 'identity' | 'type'> {
    /** Standard WebAuthn credential ID (not age identity) */
    credentialId: string;
    
    /** Always 'fallback-pbkdf2' */
    type: 'fallback-pbkdf2';
    
    /** PRF is always false for fallback */
    prfEnabled: false;
    
    /** Salt used for PBKDF2 derivation */
    salt?: string;
  }
  
  /**
   * Stored credential format in IndexedDB
   */
  export interface StoredCredential {
    id: string;
    credential: WebAuthnCredential | FallbackCredential;
    encryptedAt?: string;
    decryptedAt?: string;
  }