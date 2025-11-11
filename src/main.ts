import { App } from './ui/app';
import './styles.css';

async function main() {
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    throw new Error('App container not found');
  }

  const app = new App(appContainer);
  await app.init();
}

main().catch(console.error);

