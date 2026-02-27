import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * Accessibility theme modes — mirrors GitHub's color-blind theme system.
 * Each mode maps to a `[data-a11y-theme]` attribute on <html>.
 */
export type A11yTheme =
  | 'default'
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'high-contrast';

export interface ThemeMeta {
  id: A11yTheme;
  label: string;
  description: string;
  icon: string;           // emoji icon for non-color visual cue
  shortLabel: string;     // badge text for compact view
}

export const THEME_OPTIONS: ThemeMeta[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Standard color palette',
    icon: '🎨',
    shortLabel: 'Default',
  },
  {
    id: 'protanopia',
    label: 'Protanopia Mode',
    description: 'Optimized for red-blind color vision',
    icon: '🔵',
    shortLabel: 'Protanopia',
  },
  {
    id: 'deuteranopia',
    label: 'Deuteranopia Mode',
    description: 'Optimized for green-blind color vision',
    icon: '🟡',
    shortLabel: 'Deuteranopia',
  },
  {
    id: 'tritanopia',
    label: 'Tritanopia Mode',
    description: 'Optimized for blue-yellow color vision',
    icon: '🟢',
    shortLabel: 'Tritanopia',
  },
  {
    id: 'high-contrast',
    label: 'High Contrast Mode',
    description: 'Maximum contrast for low vision',
    icon: '⬛',
    shortLabel: 'Hi-Contrast',
  },
];

const STORAGE_KEY = 'snap-a11y-theme';

interface AccessibilityThemeContextType {
  theme: A11yTheme;
  setTheme: (theme: A11yTheme) => void;
  themeMeta: ThemeMeta;
}

const AccessibilityThemeContext = createContext<AccessibilityThemeContextType>({
  theme: 'default',
  setTheme: () => {},
  themeMeta: THEME_OPTIONS[0],
});

/** Apply the data attribute to <html> so CSS variables activate globally. */
function applyThemeToDOM(theme: A11yTheme) {
  document.documentElement.setAttribute('data-a11y-theme', theme);
}

/** Read saved theme from localStorage, falling back to 'default'. */
function getSavedTheme(): A11yTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEME_OPTIONS.some(t => t.id === stored)) {
      return stored as A11yTheme;
    }
  } catch {
    // localStorage may not be available in some contexts
  }
  return 'default';
}

/**
 * Notify ALL open tabs about the theme change.
 * Strategy:
 *  1) Save to chrome.storage.sync so content scripts pick it up on new pages
 *  2) Send message to service worker to broadcast to all tabs
 *  3) Also directly inject into the active tab via chrome.scripting.executeScript
 *     as a guaranteed fallback
 */
function notifyWebpageTheme(theme: A11yTheme) {
  try {
    if (typeof chrome === 'undefined') return;

    // 1) Persist to sync storage (content scripts read this on page load)
    if (chrome.storage?.sync) {
      chrome.storage.sync.set({ snapA11yTheme: theme });
    }

    // 2) Tell service worker to broadcast to all tabs
    if (chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'snapSetA11yTheme',
        theme,
      }).catch(() => {});
    }

    // 3) Direct injection into the active tab (most reliable)
    if (chrome.tabs?.query && chrome.scripting?.executeScript) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs?.[0]?.id;
        if (!tabId) return;

        // First ensure content script is loaded
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content/content-script.js'],
        }, () => {
          // Then send the theme change message
          chrome.tabs.sendMessage(tabId, {
            type: 'snapA11yThemeChange',
            theme,
          }).catch(() => {});
        });
      });
    }
  } catch {
    // extension context might not be available in dev
  }
}

export function AccessibilityThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<A11yTheme>(getSavedTheme);

  // Apply theme on mount and whenever it changes
  useEffect(() => {
    applyThemeToDOM(theme);
    notifyWebpageTheme(theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: A11yTheme) => {
    setThemeState(newTheme);
    applyThemeToDOM(newTheme);
    notifyWebpageTheme(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // silent fail if storage is unavailable
    }
  }, []);

  const themeMeta = THEME_OPTIONS.find(t => t.id === theme) || THEME_OPTIONS[0];

  return (
    <AccessibilityThemeContext.Provider value={{ theme, setTheme, themeMeta }}>
      {children}
    </AccessibilityThemeContext.Provider>
  );
}

/** Hook to read/write the current accessibility theme. */
export function useAccessibilityTheme() {
  return useContext(AccessibilityThemeContext);
}
