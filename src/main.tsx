import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { applyTheme, useThemeStore } from './ui/theme';
import { requestPersistence } from './core';
import './ui/global.css';

applyTheme(useThemeStore.getState().mode);
void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
