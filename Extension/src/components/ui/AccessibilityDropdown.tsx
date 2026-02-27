import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Check, ChevronDown } from 'lucide-react';
import {
  useAccessibilityTheme,
  THEME_OPTIONS,
  type A11yTheme,
} from '../../context/AccessibilityThemeContext';

/**
 * Accessibility dropdown — matches the Settings page card-style theme picker.
 * Uses a portal so it's not clipped by parent overflow:hidden.
 */
export function AccessibilityDropdown() {
  const { theme, setTheme, themeMeta } = useAccessibilityTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // Calculate position relative to viewport when opening
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  // close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Select accessibility theme"
      className="w-72 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden"
      style={{
        position: 'fixed',
        top: pos.top,
        right: pos.right,
        zIndex: 9999,
        animation: 'fadeSlideIn 150ms ease-out',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/60">
        <div className="flex items-center gap-2 font-bold text-[11px] uppercase tracking-wider" style={{ color: 'var(--snap-primary)' }}>
          <Eye size={14} aria-hidden="true" />
          Color Vision Accessibility
        </div>
        <p className="text-[10px] text-zinc-400 mt-0.5">
          Choose a color palette optimized for your vision
        </p>
      </div>

      {/* Theme cards */}
      <div className="p-2 grid gap-1.5">
        {THEME_OPTIONS.map(opt => {
          const isActive = theme === opt.id;
          return (
            <button
              key={opt.id}
              role="option"
              aria-selected={isActive}
              onClick={() => {
                setTheme(opt.id as A11yTheme);
                setOpen(false);
              }}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                isActive
                  ? 'border-[var(--snap-primary)] bg-[var(--snap-primary-light)] shadow-sm'
                  : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200 hover:bg-white'
              }`}
            >
              <span className="text-lg select-none w-7 text-center" aria-hidden="true">
                {opt.icon}
              </span>
              <div className="flex-1 min-w-0">
                <span className={`block text-xs font-bold leading-tight ${
                  isActive ? 'text-zinc-900' : 'text-zinc-700'
                }`}>
                  {opt.label}
                </span>
                <span className="block text-[10px] text-zinc-400 mt-0.5 leading-tight">
                  {opt.description}
                </span>
              </div>
              {isActive && (
                <Check
                  size={16}
                  className="shrink-0"
                  style={{ color: 'var(--snap-primary)' }}
                  aria-label="Active"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Accessibility theme: ${themeMeta.label}. Click to change.`}
        title="Adaptive Color Mode"
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold
                   border transition-all duration-150 snap-focus-ring
                   border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100 text-zinc-600"
        style={{
          borderColor: theme !== 'default' ? 'var(--snap-primary)' : undefined,
          color: theme !== 'default' ? 'var(--snap-primary)' : undefined,
        }}
      >
        <Eye size={14} aria-hidden="true" />
        <span className="hidden sm:inline">{themeMeta.shortLabel}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {panel}

      {/* Inline keyframes */}
      {open && (
        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateY(-4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      )}
    </>
  );
}
