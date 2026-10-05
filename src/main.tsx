import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { StorageGate } from './features/settings/StorageGate';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { applyTextScale, useTextScale } from './ui/textScale';
import { applyTheme, useThemeStore } from './ui/theme';
import { requestPersistence } from './core';
import { searchClient } from './features/search/searchClient';
import { ensureAllPdfText } from './features/search/pdfText';
import './ui/global.css';

applyTheme(useThemeStore.getState().mode);
applyTextScale(useTextScale.getState().scale, false);
void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StorageGate>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StorageGate>
    </ErrorBoundary>
  </StrictMode>,
);

// Warm up search in the background shortly after start: build the index in its worker and finish
// reading text from any PDFs that are still missing it. Neither blocks the first paint.
window.setTimeout(() => {
  searchClient.start();
  void ensureAllPdfText();
}, 1500);
