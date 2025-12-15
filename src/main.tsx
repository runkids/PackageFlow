import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TerminalWindowPage } from './components/project/TerminalWindowPage';
import { ScriptExecutionProvider } from './contexts/ScriptExecutionContext';
import { ShortcutsProvider } from './contexts/ShortcutsContext';
import { WorkflowExecutionProvider } from './contexts/WorkflowExecutionContext';
import { ExecutionHistoryProvider } from './contexts/ExecutionHistoryContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { tauriAPI, aiAPI } from './lib/tauri-api';
import './styles.css';

// Expose APIs for debugging in development
if (import.meta.env.DEV) {
  (window as unknown as { tauriAPI: typeof tauriAPI; aiAPI: typeof aiAPI }).tauriAPI = tauriAPI;
  (window as unknown as { tauriAPI: typeof tauriAPI; aiAPI: typeof aiAPI }).aiAPI = aiAPI;
}

function getTerminalExecutionId(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/terminal\/(.+)$/);
  return match ? match[1] : null;
}

function Root() {
  const terminalExecutionId = getTerminalExecutionId();

  if (terminalExecutionId) {
    return <TerminalWindowPage executionId={terminalExecutionId} />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <ScriptExecutionProvider>
          <WorkflowExecutionProvider>
            <ExecutionHistoryProvider>
              <ShortcutsProvider>
                <Root />
              </ShortcutsProvider>
            </ExecutionHistoryProvider>
          </WorkflowExecutionProvider>
        </ScriptExecutionProvider>
      </SettingsProvider>
    </ThemeProvider>
  </React.StrictMode>
);
