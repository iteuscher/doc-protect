import { getLocalFiles, deleteLocalFile, LocalFile } from '../../files/file-manager';
import { createButton } from '../components/Button';
import { decryptFile } from '../../encryption/age-encryption';
import { downloadFile } from '../../files/file-manager';
import { DocProtectAPI, ServerFile } from '../../api/client';
import { getStoredIdentities } from '../../auth/webauthn';

export class MyFilesView {
  private container: HTMLDivElement;
  private api: DocProtectAPI;

  constructor(container: HTMLDivElement) {
    this.container = container;
    // TODO: Get baseUrl from config
    this.api = new DocProtectAPI('http://localhost:3000');
  }

  async render(): Promise<void> {
    this.container.innerHTML = '';
    
    const title = document.createElement('h2');
    title.textContent = 'My Files';
    this.container.appendChild(title);

    // Local files section
    const localSection = document.createElement('div');
    localSection.className = 'section';
    
    const localTitle = document.createElement('h3');
    localTitle.textContent = 'Local Files';
    localSection.appendChild(localTitle);

    const localFiles = await getLocalFiles();

    if (localFiles.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.textContent = 'No files stored locally. Encrypt a file to see it here.';
      emptyMessage.className = 'empty-message';
      localSection.appendChild(emptyMessage);
    } else {
      const filesList = document.createElement('div');
      filesList.className = 'files-list';

      for (const file of localFiles) {
        const fileItem = this.createLocalFileItem(file);
        filesList.appendChild(fileItem);
      }

      localSection.appendChild(filesList);
    }

    this.container.appendChild(localSection);

    // Server files section
    const serverSection = document.createElement('div');
    serverSection.className = 'section';
    
    const serverTitle = document.createElement('h3');
    serverTitle.textContent = 'Server Files';
    serverSection.appendChild(serverTitle);

    const loadServerFilesButton = createButton('Load Server Files', () => this.handleLoadServerFiles());
    loadServerFilesButton.className = 'btn btn-primary';
    serverSection.appendChild(loadServerFilesButton);

    const serverFilesList = document.createElement('div');
    serverFilesList.className = 'files-list';
    serverFilesList.id = 'server-files-list';
    serverSection.appendChild(serverFilesList);

    this.container.appendChild(serverSection);
  }

  private createLocalFileItem(file: LocalFile): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'file-item';

    const info = document.createElement('div');
    info.className = 'file-info';
    
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.metadata.name;
    info.appendChild(name);

    const size = document.createElement('div');
    size.className = 'file-size';
    size.textContent = this.formatFileSize(file.metadata.size);
    info.appendChild(size);

    const date = document.createElement('div');
    date.className = 'file-date';
    date.textContent = new Date(file.metadata.createdAt).toLocaleString();
    info.appendChild(date);

    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'file-actions';

    const decryptButton = createButton('Decrypt', () => this.handleDecrypt(file));
    decryptButton.className = 'btn btn-sm btn-primary';
    actions.appendChild(decryptButton);

    const deleteButton = createButton('Delete', () => this.handleDelete(file.id));
    deleteButton.className = 'btn btn-sm btn-danger';
    actions.appendChild(deleteButton);

    item.appendChild(actions);

    return item;
  }

  private async handleDecrypt(file: LocalFile): Promise<void> {
    try {
      // For local files, use authentication flow (not registration)
      // This will prompt user to select their passkey
      const decryptedData = await decryptFile(file.encryptedBlob);
      downloadFile(decryptedData, file.metadata.name, file.metadata.type);
    } catch (error) {
      console.error('Decryption error:', error);
      alert(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleLoadServerFiles(): Promise<void> {
    const serverFilesList = document.getElementById('server-files-list');
    if (!serverFilesList) return;

    try {
      serverFilesList.innerHTML = '<p>Loading server files...</p>';

      // Step 1: Get all stored passkey identities
      // These are the owner identities from files we've encrypted
      const storedIdentities = await getStoredIdentities();
      const passkeyIdentities = storedIdentities
        .filter(id => id.type === 'passkey')
        .map(id => id.identity);

      if (passkeyIdentities.length === 0) {
        serverFilesList.innerHTML = '<p>No passkeys found. Encrypt a file first to create a passkey and upload files to the server.</p>';
        return;
      }

      // Step 2: For each passkey identity, fetch files from server
      // This uses authentication flow - we're using stored identities to query files
      const allFiles: ServerFile[] = [];
      for (const identity of passkeyIdentities) {
        try {
          const files = await this.api.listFiles(identity);
          allFiles.push(...files);
        } catch (error) {
          console.warn(`Failed to load files for identity ${identity.substring(0, 20)}...:`, error);
          // Continue with other identities
        }
      }

      // Step 3: Display files
      if (allFiles.length === 0) {
        serverFilesList.innerHTML = '<p>No files found on server for your passkeys.</p>';
        return;
      }

      serverFilesList.innerHTML = '';
      for (const file of allFiles) {
        const fileItem = this.createServerFileItem(file);
        serverFilesList.appendChild(fileItem);
      }
    } catch (error) {
      console.error('Failed to load server files:', error);
      serverFilesList.innerHTML = `<p>Failed to load server files: ${error instanceof Error ? error.message : 'Unknown error'}</p>`;
    }
  }

  private createServerFileItem(file: ServerFile): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'file-item';

    const info = document.createElement('div');
    info.className = 'file-info';
    
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.metadata.name;
    info.appendChild(name);

    const size = document.createElement('div');
    size.className = 'file-size';
    size.textContent = this.formatFileSize(file.metadata.size);
    info.appendChild(size);

    const date = document.createElement('div');
    date.className = 'file-date';
    date.textContent = new Date(file.createdAt).toLocaleString();
    info.appendChild(date);

    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'file-actions';

    const decryptButton = createButton('Decrypt', () => this.handleSelectServerFile(file));
    decryptButton.className = 'btn btn-sm btn-primary';
    actions.appendChild(decryptButton);

    item.appendChild(actions);

    return item;
  }

  private async handleSelectServerFile(file: ServerFile): Promise<void> {
    try {
      // Step 1: Download the encrypted file from server
      const response = await this.api.downloadEncryptedFile(file.id);
      
      // Step 2: Authenticate with WebAuthn PRF (authentication flow, not registration)
      // This will prompt the user to select their passkey to verify access
      // The decryption will use WebAuthn PRF to derive the key and decrypt
      // If the user doesn't have the correct passkey, decryption will fail
      const decryptedData = await decryptFile(response.encryptedBlob);
      
      // Step 3: Download the decrypted file
      downloadFile(decryptedData, response.metadata.name, response.metadata.type);
    } catch (error) {
      console.error('Failed to access server file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('decrypt') || errorMessage.includes('NotAllowed') || errorMessage.includes('cancel')) {
        alert(`Access denied or cancelled: ${errorMessage}\n\nYou may need to request access to this file, or use the correct passkey.`);
      } else {
        alert(`Failed to access file: ${errorMessage}`);
      }
    }
  }

  private async handleDelete(fileId: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      await deleteLocalFile(fileId);
      await this.render(); // Refresh the list
    } catch (error) {
      console.error('Delete error:', error);
      alert(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}

