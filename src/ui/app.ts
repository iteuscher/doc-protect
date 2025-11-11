import { EncryptView } from './views/EncryptView';
import { DecryptView } from './views/DecryptView';
import { MyFilesView } from './views/MyFilesView';
import { ShareView } from './views/ShareView';
import { SettingsView } from './views/SettingsView';
import { handleReceiveMode } from '../routing/url-handler';

type View = 'encrypt' | 'decrypt' | 'files' | 'share' | 'settings';

export class App {
  private container: HTMLElement;
  private currentView: View = 'encrypt';
  private views: {
    encrypt: EncryptView;
    decrypt: DecryptView;
    files: MyFilesView;
    share: ShareView;
    settings: SettingsView;
  };

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Initialize views
    const viewsContainer = document.createElement('div');
    viewsContainer.id = 'views-container';
    this.container.appendChild(viewsContainer);

    this.views = {
      encrypt: new EncryptView(viewsContainer),
      decrypt: new DecryptView(viewsContainer),
      files: new MyFilesView(viewsContainer),
      settings: new SettingsView(viewsContainer),
    };
  }

  async init(): Promise<void> {
    // Check for receive mode
    const receiveModeResult = await handleReceiveMode();
    if (receiveModeResult.shouldSetDecryptMode) {
      this.currentView = 'decrypt';
      // Pre-fill public key if in receive mode
      const textarea = document.getElementById('encrypted-input') as HTMLTextAreaElement;
      if (textarea) {
        // Could show the generated public key to the user
        console.log('Receive mode: Generated public key:', receiveModeResult.keyPair.publicKey);
      }
    }

    this.render();
  }

  private render(): void {
    // Create navigation
    const nav = document.createElement('nav');
    nav.className = 'nav';

    const encryptNav = this.createNavItem('Encrypt', 'encrypt');
    const decryptNav = this.createNavItem('Decrypt', 'decrypt');
    const filesNav = this.createNavItem('My Files', 'files');
    const shareNav = this.createNavItem('Share', 'share');
    const settingsNav = this.createNavItem('Settings', 'settings');

    nav.appendChild(encryptNav);
    nav.appendChild(decryptNav);
    nav.appendChild(filesNav);
    nav.appendChild(shareNav);
    nav.appendChild(settingsNav);

    // Clear container and add nav
    this.container.innerHTML = '';
    this.container.appendChild(nav);

    // Add views container
    const viewsContainer = document.createElement('div');
    viewsContainer.id = 'views-container';
    this.container.appendChild(viewsContainer);

    // Re-initialize views with new container
    this.views = {
      encrypt: new EncryptView(viewsContainer),
      decrypt: new DecryptView(viewsContainer),
      files: new MyFilesView(viewsContainer),
      share: new ShareView(viewsContainer),
      settings: new SettingsView(viewsContainer),
    };

    // Render current view
    this.showView(this.currentView);
  }

  private createNavItem(text: string, view: View): HTMLElement {
    const item = document.createElement('button');
    item.textContent = text;
    item.className = 'nav-item';
    if (this.currentView === view) {
      item.classList.add('active');
    }
    item.addEventListener('click', () => {
      this.showView(view);
    });
    return item;
  }

  private showView(view: View): void {
    this.currentView = view;
    
    // Update nav
    const navItems = this.container.querySelectorAll('.nav-item');
    navItems.forEach((item, index) => {
      const views: View[] = ['encrypt', 'decrypt', 'files', 'share', 'settings'];
      if (views[index] === view) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Render view
    if (view === 'files') {
      this.views.files.render();
    } else if (view === 'share') {
      this.views.share.render();
    } else if (view === 'settings') {
      this.views.settings.render();
    } else if (view === 'decrypt') {
      this.views.decrypt.render();
    } else {
      this.views.encrypt.render();
    }
  }
}

