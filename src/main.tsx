import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { useAppStore } from './store/useAppStore';

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__i3d = { store: useAppStore };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
