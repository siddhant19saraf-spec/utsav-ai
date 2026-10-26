import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { App } from './App';
import { AppErrorBoundary } from './AppErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Application root element "#root" was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <WorkspaceProvider>
            <App />
          </WorkspaceProvider>
        </BrowserRouter>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
