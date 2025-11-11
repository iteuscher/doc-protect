import * as age from 'age-encryption';
import { createWebAuthnRecipient, getWebAuthnIdentity } from '../auth/webauthn';

export type RecipientType = 'webauthn' | 'x25519';

export interface Recipient {
  type: RecipientType;
  value: string; // public key for x25519, identity string (optional) for webauthn
}

/**
 * Encrypts a file with multiple recipients
 */
export async function encryptFile(
  fileData: Uint8Array | string,
  recipients: Recipient[]
): Promise<string> {
  const encrypter = new age.Encrypter();

  // Add all recipients
  for (const recipient of recipients) {
    if (recipient.type === 'webauthn') {
      const webauthnRecipient = createWebAuthnRecipient(
        recipient.value || undefined
      );
      encrypter.addRecipient(webauthnRecipient);
    } else if (recipient.type === 'x25519') {
      // X25519 recipients are added as strings (age1... format)
      encrypter.addRecipient(recipient.value);
    } else {
      throw new Error(`Unsupported recipient type: ${recipient.type}`);
    }
  }

  // Encrypt the data
  const ciphertext = await encrypter.encrypt(fileData);

  // ASCII-armor the ciphertext for easy storage/transfer
  const armored = age.armor.encode(ciphertext);

  return armored;
}

/**
 * Decrypts a file using WebAuthn identity or X25519 private key
 */
export async function decryptFile(
  encryptedBlob: string,
  identity?: string,
  x25519PrivateKey?: string
): Promise<Uint8Array> {
  // Decode the armored ciphertext
  const decoded = age.armor.decode(encryptedBlob);

  const decrypter = new age.Decrypter();

  // Add WebAuthn identity if provided
  if (identity || !x25519PrivateKey) {
    const webauthnIdentity = await getWebAuthnIdentity(identity);
    decrypter.addIdentity(webauthnIdentity);
  }

  // Add X25519 identity if provided
  if (x25519PrivateKey) {
    decrypter.addIdentity(x25519PrivateKey);
  }

  // Decrypt the data
  const decrypted = await decrypter.decrypt(decoded, 'binary');

  return decrypted;
}

/**
 * Encodes binary data to ASCII-armored format
 */
export function armorEncode(ciphertext: Uint8Array): string {
  return age.armor.encode(ciphertext);
}

/**
 * Decodes ASCII-armored data to binary
 */
export function armorDecode(armored: string): Uint8Array {
  return age.armor.decode(armored);
}

