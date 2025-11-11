import { createFileDropZone } from '../components/FileInput';
import { createTextarea } from '../components/Textarea';
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
    inputLabel.textContent = 'Paste encrypted text or select encrypted file:';
    inputSection.appendChild(inputLabel);
    
    const textarea = createTextarea('Paste encrypted text here...', '', 10);
    textarea.id = 'encrypted-input';
    textarea.style.fontFamily = 'monospace';
    textarea.style.fontSize = '12px';
    textarea.addEventListener('input', () => {
      this.encryptedBlob = textarea.value.trim();
    });
    inputSection.appendChild(textarea);
    
    const orDiv = document.createElement('div');
    orDiv.textContent = 'or';
    orDiv.style.textAlign = 'center';
    orDiv.style.margin = '10px 0';
    inputSection.appendChild(orDiv);
    
    const dropZone = createFileDropZone(async (file) => {
      const text = await file.text();
      textarea.value = text;
      this.encryptedBlob = text.trim();
    });
    dropZone.textContent = 'Drop encrypted file here';
    inputSection.appendChild(dropZone);
    
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

  private async handleDecrypt(): Promise<void> {
    if (!this.encryptedBlob || this.encryptedBlob.length === 0) {
      alert('Please provide encrypted text or file');
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
    const blob = new Blob([decryptedData]);
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

