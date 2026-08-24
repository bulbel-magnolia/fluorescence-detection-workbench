import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import { App } from './app/App';
import './theme/tokens.css';
import './theme/global.css';
import './theme/cyber-scientific.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Application root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
