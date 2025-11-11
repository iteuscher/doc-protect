import { createButton } from '../components/Button';
import { createPasskeyCredential, createSecurityKeyCredential, getStoredIdentities } from '../../auth/webauthn';
import { generateX25519KeyPair, getStoredKeyPairs } from '../../keys/key-manager';

export class SettingsView {
  private container: HTMLDivElement;

  constructor(container: HTMLDivElement) {
    this.container = container;
  }

  async render(): Promise<void> {
    this.container.innerHTML = '';
    
    const title = document.createElement('h2');
    title.textContent = 'Settings';
    this.container.appendChild(title);

    // WebAuthn Credentials Section
    const webauthnSection = document.createElement('div');
    webauthnSection.className = 'section';
    
    const webauthnTitle = document.createElement('h3');
    webauthnTitle.textContent = 'WebAuthn Credentials';
    webauthnSection.appendChild(webauthnTitle);

    const createPasskeyButton = createButton('Create Passkey', () => this.handleCreatePasskey());
    createPasskeyButton.className = 'btn btn-primary';
    webauthnSection.appendChild(createPasskeyButton);

    const createSecurityKeyButton = createButton('Create Security Key', () => this.handleCreateSecurityKey());
    createSecurityKeyButton.className = 'btn btn-secondary';
    webauthnSection.appendChild(createSecurityKeyButton);

    const identitiesList = document.createElement('div');
    identitiesList.className = 'identities-list';
    identitiesList.id = 'identities-list';
    webauthnSection.appendChild(identitiesList);

    this.container.appendChild(webauthnSection);

    // X25519 Keys Section
    const keysSection = document.createElement('div');
    keysSection.className = 'section';
    
    const keysTitle = document.createElement('h3');
    keysTitle.textContent = 'X25519 Keys';
    keysSection.appendChild(keysTitle);

    const generateKeyButton = createButton('Generate New Key Pair', () => this.handleGenerateKeyPair());
    generateKeyButton.className = 'btn btn-primary';
    keysSection.appendChild(generateKeyButton);

    const keysList = document.createElement('div');
    keysList.className = 'keys-list';
    keysList.id = 'keys-list';
    keysSection.appendChild(keysList);

    this.container.appendChild(keysSection);

    // Load existing credentials and keys
    await this.loadIdentities();
    await this.loadKeyPairs();
  }

  private async handleCreatePasskey(): Promise<void> {
    try {
      const keyName = prompt('Enter a name for your passkey:', 'Doc Protect Encryption Key');
      if (!keyName) return;

      const identity = await createPasskeyCredential({ keyName });
      alert(`Passkey created successfully!\n\nIdentity: ${identity.substring(0, 50)}...`);
      await this.loadIdentities();
    } catch (error) {
      console.error('Failed to create passkey:', error);
      alert(`Failed to create passkey: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleCreateSecurityKey(): Promise<void> {
    try {
      const keyName = prompt('Enter a name for your security key:', 'Doc Protect Security Key');
      if (!keyName) return;

      const identity = await createSecurityKeyCredential({ keyName });
      alert(`Security key created successfully!\n\nIdentity: ${identity}\n\nIMPORTANT: Save this identity string! You will need it to decrypt files.`);
      await this.loadIdentities();
    } catch (error) {
      console.error('Failed to create security key:', error);
      alert(`Failed to create security key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleGenerateKeyPair(): Promise<void> {
    try {
      const keyPair = await generateX25519KeyPair();
      
      const display = document.createElement('div');
      display.className = 'key-pair-display';
      
      const privateKeyLabel = document.createElement('label');
      privateKeyLabel.textContent = 'Private Key (keep secret):';
      display.appendChild(privateKeyLabel);
      
      const privateKeyInput = document.createElement('textarea');
      privateKeyInput.value = keyPair.privateKey;
      privateKeyInput.readOnly = true;
      privateKeyInput.style.width = '100%';
      privateKeyInput.style.fontFamily = 'monospace';
      privateKeyInput.style.fontSize = '12px';
      display.appendChild(privateKeyInput);
      
      const publicKeyLabel = document.createElement('label');
      publicKeyLabel.textContent = 'Public Key (share this):';
      display.appendChild(publicKeyLabel);
      
      const publicKeyInput = document.createElement('textarea');
      publicKeyInput.value = keyPair.publicKey;
      publicKeyInput.readOnly = true;
      publicKeyInput.style.width = '100%';
      publicKeyInput.style.fontFamily = 'monospace';
      publicKeyInput.style.fontSize = '12px';
      display.appendChild(publicKeyInput);
      
      const copyPublicButton = createButton('Copy Public Key', () => {
        navigator.clipboard.writeText(keyPair.publicKey);
        alert('Public key copied to clipboard');
      });
      copyPublicButton.className = 'btn btn-sm btn-secondary';
      display.appendChild(copyPublicButton);
      
      if (confirm('Key pair generated! Copy the keys before closing this dialog.')) {
        // User acknowledged
      }
    } catch (error) {
      console.error('Failed to generate key pair:', error);
      alert(`Failed to generate key pair: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async loadIdentities(): Promise<void> {
    const identitiesList = document.getElementById('identities-list');
    if (!identitiesList) return;

    try {
      const identities = await getStoredIdentities();
      
      if (identities.length === 0) {
        identitiesList.innerHTML = '<p>No stored identities</p>';
        return;
      }

      identitiesList.innerHTML = '';
      for (const identity of identities) {
        const item = document.createElement('div');
        item.className = 'identity-item';
        
        const type = document.createElement('div');
        type.textContent = `Type: ${identity.type}`;
        item.appendChild(type);
        
        const identityText = document.createElement('div');
        identityText.textContent = identity.identity.substring(0, 60) + '...';
        identityText.style.fontFamily = 'monospace';
        identityText.style.fontSize = '12px';
        item.appendChild(identityText);
        
        identitiesList.appendChild(item);
      }
    } catch (error) {
      console.error('Failed to load identities:', error);
      identitiesList.innerHTML = '<p>Failed to load identities</p>';
    }
  }

  private async loadKeyPairs(): Promise<void> {
    const keysList = document.getElementById('keys-list');
    if (!keysList) return;

    try {
      const keyPairs = await getStoredKeyPairs();
      
      if (keyPairs.length === 0) {
        keysList.innerHTML = '<p>No stored key pairs</p>';
        return;
      }

      keysList.innerHTML = '';
      for (const keyPair of keyPairs) {
        const item = document.createElement('div');
        item.className = 'key-item';
        
        const publicKey = document.createElement('div');
        publicKey.textContent = `Public: ${keyPair.publicKey.substring(0, 50)}...`;
        publicKey.style.fontFamily = 'monospace';
        publicKey.style.fontSize = '12px';
        item.appendChild(publicKey);
        
        keysList.appendChild(item);
      }
    } catch (error) {
      console.error('Failed to load key pairs:', error);
      keysList.innerHTML = '<p>Failed to load key pairs</p>';
    }
  }
}

