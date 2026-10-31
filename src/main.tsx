import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DialogProvider } from './context/DialogContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </React.StrictMode>
);

// Register PWA Service Worker for standalone macOS App installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('EasyMD PWA ServiceWorker registered:', reg.scope))
      .catch((err) => console.warn('EasyMD ServiceWorker registration failed:', err));
  });
}
