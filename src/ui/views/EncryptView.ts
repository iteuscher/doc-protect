import { createFileDropZone } from '../components/FileInput';
import { createTextarea } from '../components/Textarea';
import { createButton } from '../components/Button';
import { readFileAsUint8Array, downloadFile } from '../../files/file-manager';
import { encryptFile, Recipient } from '../../encryption/age-encryption';
import { validatePublicKey } from '../../keys/key-manager';
import { parseRecipientsFromURL } from '../../keys/key-manager';
import { createWebAuthnRecipient } from '../../auth/webauthn';

export class EncryptView {
  private container: HTMLDivElement;
  private selectedFile: File | null = null;
  private recipientKeys: string[] = [];

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.recipientKeys = parseRecipientsFromURL();
  }

  render(): void {
    this.container.innerHTML = '';
    
    const title = document.createElement('h2');
    title.textContent = 'Encrypt File';
    this.container.appendChild(title);

    // File selection
    const fileSection = document.createElement('div');
    fileSection.className = 'section';
    
    const fileLabel = document.createElement('label');
    fileLabel.textContent = 'Select file to encrypt:';
    fileSection.appendChild(fileLabel);
    
    const dropZone = createFileDropZone((file) => {
      this.selectedFile = file;
      this.updateFileDisplay();
    });
    fileSection.appendChild(dropZone);
    
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.id = 'file-info';
    fileSection.appendChild(fileInfo);
    
    this.container.appendChild(fileSection);

    // Recipient keys
    const recipientsSection = document.createElement('div');
    recipientsSection.className = 'section';
    
    const recipientsLabel = document.createElement('label');
    recipientsLabel.textContent = 'Recipient public keys (one per line or comma-separated):';
    recipientsSection.appendChild(recipientsLabel);
    
    const recipientsTextarea = createTextarea(
      'age1... or leave empty to use your passkey',
      this.recipientKeys.join('\n'),
      5
    );
    recipientsTextarea.id = 'recipients-input';
    recipientsTextarea.addEventListener('input', () => {
      this.parseRecipients(recipientsTextarea.value);
    });
    recipientsSection.appendChild(recipientsTextarea);
    
    const recipientsInfo = document.createElement('div');
    recipientsInfo.className = 'info';
    recipientsInfo.id = 'recipients-info';
    recipientsInfo.textContent = 'Leave empty to encrypt with your passkey only';
    recipientsSection.appendChild(recipientsInfo);
    
    this.container.appendChild(recipientsSection);

    // Encrypt button
    const encryptButton = createButton('Encrypt File', () => this.handleEncrypt());
    encryptButton.className = 'btn btn-primary';
    encryptButton.id = 'encrypt-button';
    this.container.appendChild(encryptButton);

    // Result display
    const resultSection = document.createElement('div');
    resultSection.className = 'section';
    resultSection.id = 'encrypt-result';
    resultSection.style.display = 'none';
    this.container.appendChild(resultSection);

    this.updateFileDisplay();
  }

  private updateFileDisplay(): void {
    const fileInfo = document.getElementById('file-info');
    if (fileInfo && this.selectedFile) {
      fileInfo.textContent = `Selected: ${this.selectedFile.name} (${this.formatFileSize(this.selectedFile.size)})`;
    } else if (fileInfo) {
      fileInfo.textContent = '';
    }
  }

  private parseRecipients(input: string): void {
    const lines = input.split(/[,\n]/).map(line => line.trim()).filter(line => line.length > 0);
    this.recipientKeys = lines.filter(key => {
      if (validatePublicKey(key)) {
        return true;
      } else if (key.length > 0) {
        console.warn(`Invalid public key format: ${key}`);
        return false;
      }
      return false;
    });
    
    const recipientsInfo = document.getElementById('recipients-info');
    if (recipientsInfo) {
      if (this.recipientKeys.length > 0) {
        recipientsInfo.textContent = `${this.recipientKeys.length} valid recipient key(s)`;
      } else {
        recipientsInfo.textContent = 'Leave empty to encrypt with your passkey only';
      }
    }
  }

  private async handleEncrypt(): Promise<void> {
    if (!this.selectedFile) {
      alert('Please select a file to encrypt');
      return;
    }

    const encryptButton = document.getElementById('encrypt-button') as HTMLButtonElement;
    if (encryptButton) {
      encryptButton.disabled = true;
      encryptButton.textContent = 'Encrypting...';
    }

    try {
      // Read file as Uint8Array
      const fileData = await readFileAsUint8Array(this.selectedFile);

      // Build recipients list
      const recipients: Recipient[] = [];
      
      // Always add owner's WebAuthn recipient
      recipients.push({ type: 'webauthn', value: '' });
      
      // Add X25519 recipients if provided
      for (const publicKey of this.recipientKeys) {
        recipients.push({ type: 'x25519', value: publicKey });
      }

      // Encrypt the file
      const encryptedBlob = await encryptFile(fileData, recipients);

      // Display result
      this.showEncryptResult(encryptedBlob, this.selectedFile.name);
    } catch (error) {
      console.error('Encryption error:', error);
      alert(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (encryptButton) {
        encryptButton.disabled = false;
        encryptButton.textContent = 'Encrypt File';
      }
    }
  }

  private showEncryptResult(encryptedBlob: string, originalFilename: string): void {
    const resultSection = document.getElementById('encrypt-result');
    if (!resultSection) return;

    resultSection.style.display = 'block';
    resultSection.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = 'Encryption Complete';
    resultSection.appendChild(title);

    const downloadButton = createButton('Download Encrypted File', () => {
      const blob = new Blob([encryptedBlob], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${originalFilename}.age`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    downloadButton.className = 'btn btn-primary';
    resultSection.appendChild(downloadButton);

    const copyButton = createButton('Copy Encrypted Text', () => {
      navigator.clipboard.writeText(encryptedBlob).then(() => {
        alert('Encrypted text copied to clipboard');
      });
    });
    copyButton.className = 'btn btn-secondary';
    resultSection.appendChild(copyButton);

    const textarea = createTextarea('', encryptedBlob, 10);
    textarea.readOnly = true;
    textarea.style.fontFamily = 'monospace';
    textarea.style.fontSize = '12px';
    resultSection.appendChild(textarea);
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}

