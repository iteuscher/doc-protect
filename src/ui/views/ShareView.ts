import { createButton } from '../components/Button';
import { createTextarea } from '../components/Textarea';
import { createShareLink, createReceiveModeLink } from '../../sharing/sharing-manager';
import { getLocalFiles } from '../../files/file-manager';

export class ShareView {
  private container: HTMLDivElement;

  constructor(container: HTMLDivElement) {
    this.container = container;
  }

  async render(): Promise<void> {
    this.container.innerHTML = '';
    
    const title = document.createElement('h2');
    title.textContent = 'Share Files';
    this.container.appendChild(title);

    // Share Link Generator
    const shareSection = document.createElement('div');
    shareSection.className = 'section';
    
    const shareTitle = document.createElement('h3');
    shareTitle.textContent = 'Generate Share Link';
    shareSection.appendChild(shareTitle);

    const recipientsLabel = document.createElement('label');
    recipientsLabel.textContent = 'Recipient public keys (one per line):';
    shareSection.appendChild(recipientsLabel);

    const recipientsTextarea = createTextarea('age1...', '', 5);
    recipientsTextarea.id = 'share-recipients';
    shareSection.appendChild(recipientsTextarea);

    const generateButton = createButton('Generate Share Link', () => {
      this.handleGenerateShareLink(recipientsTextarea.value);
    });
    generateButton.className = 'btn btn-primary';
    shareSection.appendChild(generateButton);

    const shareLinkResult = document.createElement('div');
    shareLinkResult.id = 'share-link-result';
    shareLinkResult.style.display = 'none';
    shareSection.appendChild(shareLinkResult);

    this.container.appendChild(shareSection);

    // Receive Mode Link
    const receiveSection = document.createElement('div');
    receiveSection.className = 'section';
    
    const receiveTitle = document.createElement('h3');
    receiveTitle.textContent = 'Generate Receive Mode Link';
    receiveSection.appendChild(receiveTitle);

    const receiveInfo = document.createElement('p');
    receiveInfo.textContent = 'This link will auto-generate a keypair for the recipient and set up decrypt mode.';
    receiveInfo.className = 'info';
    receiveSection.appendChild(receiveInfo);

    const generateReceiveButton = createButton('Generate Receive Mode Link', () => {
      this.handleGenerateReceiveLink();
    });
    generateReceiveButton.className = 'btn btn-secondary';
    receiveSection.appendChild(generateReceiveButton);

    const receiveLinkResult = document.createElement('div');
    receiveLinkResult.id = 'receive-link-result';
    receiveLinkResult.style.display = 'none';
    receiveSection.appendChild(receiveLinkResult);

    this.container.appendChild(receiveSection);

    // My Files for Sharing
    const filesSection = document.createElement('div');
    filesSection.className = 'section';
    
    const filesTitle = document.createElement('h3');
    filesTitle.textContent = 'Share Local Files';
    filesSection.appendChild(filesTitle);

    const filesList = document.createElement('div');
    filesList.id = 'share-files-list';
    filesSection.appendChild(filesList);

    this.container.appendChild(filesSection);

    await this.loadFilesForSharing();
  }

  private handleGenerateShareLink(recipientsInput: string): void {
    const recipients = recipientsInput
      .split(/[,\n]/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.startsWith('age1'));

    if (recipients.length === 0) {
      alert('Please enter at least one recipient public key');
      return;
    }

    const shareLink = createShareLink(recipients);
    this.showShareLinkResult(shareLink);
  }

  private handleGenerateReceiveLink(): void {
    const receiveLink = createReceiveModeLink();
    this.showReceiveLinkResult(receiveLink);
  }

  private showShareLinkResult(link: string): void {
    const resultDiv = document.getElementById('share-link-result');
    if (!resultDiv) return;

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '';

    const label = document.createElement('label');
    label.textContent = 'Share Link:';
    resultDiv.appendChild(label);

    const linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.value = link;
    linkInput.readOnly = true;
    linkInput.style.width = '100%';
    linkInput.style.padding = '8px';
    linkInput.style.marginTop = '5px';
    linkInput.style.fontFamily = 'monospace';
    linkInput.style.fontSize = '12px';
    resultDiv.appendChild(linkInput);

    const copyButton = createButton('Copy Link', () => {
      navigator.clipboard.writeText(link);
      alert('Link copied to clipboard');
    });
    copyButton.className = 'btn btn-sm btn-secondary';
    copyButton.style.marginTop = '10px';
    resultDiv.appendChild(copyButton);
  }

  private showReceiveLinkResult(link: string): void {
    const resultDiv = document.getElementById('receive-link-result');
    if (!resultDiv) return;

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '';

    const label = document.createElement('label');
    label.textContent = 'Receive Mode Link:';
    resultDiv.appendChild(label);

    const linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.value = link;
    linkInput.readOnly = true;
    linkInput.style.width = '100%';
    linkInput.style.padding = '8px';
    linkInput.style.marginTop = '5px';
    linkInput.style.fontFamily = 'monospace';
    linkInput.style.fontSize = '12px';
    resultDiv.appendChild(linkInput);

    const copyButton = createButton('Copy Link', () => {
      navigator.clipboard.writeText(link);
      alert('Link copied to clipboard');
    });
    copyButton.className = 'btn btn-sm btn-secondary';
    copyButton.style.marginTop = '10px';
    resultDiv.appendChild(copyButton);
  }

  private async loadFilesForSharing(): Promise<void> {
    const filesList = document.getElementById('share-files-list');
    if (!filesList) return;

    try {
      const files = await getLocalFiles();

      if (files.length === 0) {
        filesList.innerHTML = '<p>No files available for sharing</p>';
        return;
      }

      filesList.innerHTML = '';
      for (const file of files) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        const fileInfo = document.createElement('div');
        fileInfo.textContent = file.metadata.name;
        fileItem.appendChild(fileInfo);

        const shareButton = createButton('Get Share Link', () => {
          // For now, just show a message - in full implementation, this would
          // generate a link that includes the file ID
          alert('Share link generation for specific files coming soon. Use the share link generator above with recipient keys.');
        });
        shareButton.className = 'btn btn-sm btn-primary';
        fileItem.appendChild(shareButton);

        filesList.appendChild(fileItem);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
      filesList.innerHTML = '<p>Failed to load files</p>';
    }
  }
}

