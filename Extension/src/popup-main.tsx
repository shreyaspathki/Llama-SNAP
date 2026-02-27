import React from 'react';
import ReactDOM from 'react-dom/client';
import { SnapPopup } from './components/SnapPopup';
import { AccessibilityThemeProvider } from './context/AccessibilityThemeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccessibilityThemeProvider>
      <SnapPopup />
    </AccessibilityThemeProvider>
  </React.StrictMode>
);
