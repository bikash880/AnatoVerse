import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { AppShell } from './components/AppShell';
import { initModels } from './modelsInit';

// load the real-anatomy catalog (if built) before the first render
initModels().finally(() =>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppShell />
    </React.StrictMode>,
  ),
);
