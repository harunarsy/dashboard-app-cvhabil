import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'habil_glass_mode';
const URL_PARAM = 'glass';

/**
 * Liquid Glass theme state hook (v1.5.0).
 *
 * Resolution order (priority high → low):
 *   1. URL param `?glass=off|on` — emergency kill / force
 *   2. OS `prefers-reduced-transparency: reduce` — auto-disable
 *   3. localStorage `habil_glass_mode` — user preference
 *
 * Side effect: toggles body.classList `liquid-glass-active` to drive CSS.
 * Guarded with try-catch — auto-disable + console.warn on any failure.
 */
export default function useGlassMode() {
  const [enabled, setEnabledState] = useState(() => {
    try {
      // 1. URL kill switch wins
      const params = new URLSearchParams(window.location.search);
      const urlVal = params.get(URL_PARAM);
      if (urlVal === 'off') return false;
      if (urlVal === 'on') {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {
          console.warn('[GlassMode] localStorage persist failed:', e.message);
        }
        return true;
      }
      // 2. OS preference wins
      if (window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return false;
      // 3. localStorage — v1.8.7: default ON kalau user belum pernah toggle
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === '1';
    } catch (e) {
      console.warn('[GlassMode] init state failed:', e);
      return false;
    }
  });

  const setEnabled = useCallback((val) => {
    setEnabledState((prev) => {
      const next = typeof val === 'function' ? val(prev) : !!val;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); }
      catch (e) { console.warn('[GlassMode] localStorage persist failed:', e.message); }
      return next;
    });
  }, []);

  // Sync body class — guarded
  useEffect(() => {
    try {
      if (enabled) document.body.classList.add('liquid-glass-active');
      else document.body.classList.remove('liquid-glass-active');
    } catch (e) {
      console.warn('[GlassMode] body class toggle failed — disabling:', e.message);
      setEnabledState(false);
    }
  }, [enabled]);

  return [enabled, setEnabled];
}
