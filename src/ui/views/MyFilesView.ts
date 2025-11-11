import { getLocalFiles, deleteLocalFile, LocalFile } from '../../files/file-manager';
import { createButton } from '../components/Button';
import { decryptFile } from '../../encryption/age-encryption';
import { downloadFile } from '../../files/file-manager';

export class MyFilesView {
  private container: HTMLDivElement;

  constructor(container: HTMLDivElement) {
    this.container = container;
  }

  async render(): Promise<void> {
    this.container.innerHTML = '';
    
    const title = document.createElement('h2');
    title.textContent = 'My Files';
    this.container.appendChild(title);

    const files = await getLocalFiles();

    if (files.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.textContent = 'No files stored locally. Encrypt a file to see it here.';
      emptyMessage.className = 'empty-message';
      this.container.appendChild(emptyMessage);
      return;
    }

    const filesList = document.createElement('div');
    filesList.className = 'files-list';

    for (const file of files) {
      const fileItem = this.createFileItem(file);
      filesList.appendChild(fileItem);
    }

    this.container.appendChild(filesList);
  }

  private createFileItem(file: LocalFile): HTMLDivElement {
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
      const decryptedData = await decryptFile(file.encryptedBlob);
      downloadFile(decryptedData, file.metadata.name, file.metadata.type);
    } catch (error) {
      console.error('Decryption error:', error);
      alert(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

