import React from 'react';
import ReactDOM from 'react-dom/client';
import { OptionsPage } from './components/OptionsPage';
import { AccessibilityThemeProvider } from './context/AccessibilityThemeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccessibilityThemeProvider>
      <OptionsPage />
    </AccessibilityThemeProvider>
  </React.StrictMode>
);
