import { createFileDropZone } from '../components/FileInput';
import { createButton } from '../components/Button';
import { decryptFile } from '../../encryption/age-encryption';
import { downloadFile } from '../../files/file-manager';

export class DecryptView {
  private container: HTMLDivElement;
  private encryptedBlob: string | null = null;

  constructor(container: HTMLDivElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = '';
    
    const title = document.createElement('h2');
    title.textContent = 'Decrypt File';
    this.container.appendChild(title);

    // Encrypted file input
    const inputSection = document.createElement('div');
    inputSection.className = 'section';
    
    const inputLabel = document.createElement('label');
    inputLabel.textContent = 'Select encrypted file to decrypt:';
    inputSection.appendChild(inputLabel);
    
    const dropZone = createFileDropZone(async (file) => {
      const text = await file.text();
      this.encryptedBlob = text.trim();
      this.updateFileDisplay(file);
    });
    dropZone.textContent = 'Drop encrypted file here or click to select';
    inputSection.appendChild(dropZone);
    
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.id = 'decrypt-file-info';
    inputSection.appendChild(fileInfo);
    
    this.container.appendChild(inputSection);

    // Decrypt button
    const decryptButton = createButton('Decrypt File', () => this.handleDecrypt());
    decryptButton.className = 'btn btn-primary';
    decryptButton.id = 'decrypt-button';
    this.container.appendChild(decryptButton);

    // Result display
    const resultSection = document.createElement('div');
    resultSection.className = 'section';
    resultSection.id = 'decrypt-result';
    resultSection.style.display = 'none';
    this.container.appendChild(resultSection);
  }

  private updateFileDisplay(file?: File): void {
    const fileInfo = document.getElementById('decrypt-file-info');
    if (fileInfo && file) {
      fileInfo.textContent = `Selected: ${file.name} (${this.formatFileSize(file.size)})`;
    } else if (fileInfo && this.encryptedBlob) {
      fileInfo.textContent = 'Encrypted file loaded';
    } else if (fileInfo) {
      fileInfo.textContent = '';
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  private async handleDecrypt(): Promise<void> {
    if (!this.encryptedBlob || this.encryptedBlob.length === 0) {
      alert('Please select an encrypted file');
      return;
    }

    const decryptButton = document.getElementById('decrypt-button') as HTMLButtonElement;
    if (decryptButton) {
      decryptButton.disabled = true;
      decryptButton.textContent = 'Decrypting...';
    }

    try {
      // Decrypt the file (will prompt for WebAuthn authentication)
      const decryptedData = await decryptFile(this.encryptedBlob);

      // Display result
      this.showDecryptResult(decryptedData);
    } catch (error) {
      console.error('Decryption error:', error);
      alert(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (decryptButton) {
        decryptButton.disabled = false;
        decryptButton.textContent = 'Decrypt File';
      }
    }
  }

  private showDecryptResult(decryptedData: Uint8Array): void {
    const resultSection = document.getElementById('decrypt-result');
    if (!resultSection) return;

    resultSection.style.display = 'block';
    resultSection.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = 'Decryption Complete';
    resultSection.appendChild(title);

    // Try to detect file type
    // Create a new Uint8Array to ensure we have a proper ArrayBuffer
    const buffer = new Uint8Array(decryptedData).buffer;
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    
    const downloadButton = createButton('Download Decrypted File', () => {
      downloadFile(decryptedData, 'decrypted-file', blob.type);
    });
    downloadButton.className = 'btn btn-primary';
    resultSection.appendChild(downloadButton);

    // Try to display as text if possible
    try {
      const text = new TextDecoder().decode(decryptedData);
      if (text.length < 10000) { // Only show preview for small files
        const preview = document.createElement('div');
        preview.className = 'preview';
        const pre = document.createElement('pre');
        pre.textContent = text;
        pre.style.overflow = 'auto';
        pre.style.maxHeight = '400px';
        preview.appendChild(pre);
        resultSection.appendChild(preview);
      }
    } catch {
      // Not text, skip preview
    }
  }
}

