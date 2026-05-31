import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import FOG from 'vanta/dist/vanta.fog.min';

const STORAGE_KEY = 'habil_vanta_mode';
const URL_PARAM = 'vanta';

/**
 * Vanta.js animated background hook (v1.8.6).
 *
 * Resolution order (priority high → low):
 *   1. URL param `?vanta=off|on` — emergency kill / force
 *   2. OS `prefers-reduced-motion: reduce` — auto-disable
 *   3. Low-memory device (navigator.deviceMemory < 4) — auto-disable
 *   4. localStorage `habil_vanta_mode` — user preference (default ON)
 *
 * Side effect:
 *   - Mounts Vanta FOG effect ke ref element
 *   - Re-init saat isDarkMode berubah (colors swap)
 *   - Destroy on unmount or disable
 *   - Toggles body.classList `vanta-active` untuk CSS hook
 *
 * Guarded: any WebGL/runtime failure → auto-disable + console.warn.
 *
 * Returns: [containerRef, enabled, setEnabled]
 */
export default function useVantaBackground(isDarkMode = false) {
  const containerRef = useRef(null);
  const effectRef = useRef(null);

  const [enabled, setEnabledState] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlVal = params.get(URL_PARAM);
      if (urlVal === 'off') return false;
      if (urlVal === 'on') {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {
          console.warn('[Vanta] localStorage persist failed:', e.message);
        }
        return true;
      }
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
      if (typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory < 4) return false;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return true; // default ON
      return stored === '1';
    } catch (e) {
      console.warn('[Vanta] init state failed:', e);
      return false;
    }
  });

  const setEnabled = useCallback((val) => {
    setEnabledState((prev) => {
      const next = typeof val === 'function' ? val(prev) : !!val;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); }
      catch (e) { console.warn('[Vanta] localStorage persist failed:', e.message); }
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      if (enabled) document.body.classList.add('vanta-active');
      else document.body.classList.remove('vanta-active');
    } catch (e) {
      console.warn('[Vanta] body class toggle failed:', e);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      if (effectRef.current) {
        try { effectRef.current.destroy(); } catch (e) {
          console.warn('[Vanta] destroy failed:', e);
        }
        effectRef.current = null;
      }
      return;
    }
    if (!containerRef.current) return;

    // Destroy prev instance sebelum re-init (dark mode swap)
    if (effectRef.current) {
      try { effectRef.current.destroy(); } catch (e) {
        console.warn('[Vanta] destroy failed:', e);
      }
      effectRef.current = null;
    }

    // v1.8.6.2: persis setting dari vantajs.com preset (per request user) —
    // static fog (speed 0) dgn highlight blue + midtone red + base pink.
    // Apply sama untuk light + dark mode.
    const colors = {
      highlightColor: 0x1e00ff,
      midtoneColor: 0xff1f00,
      lowlightColor: 0xffffff,
      baseColor: 0xffebeb,
      blurFactor: 0.70,
      speed: 0.00,
      zoom: 0.20,
    };

    try {
      effectRef.current = FOG({
        el: containerRef.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        ...colors,
      });
    } catch (e) {
      console.warn('[Vanta] init failed — disabling:', e.message);
      setEnabledState(false);
      try { localStorage.setItem(STORAGE_KEY, '0'); } catch (persistErr) {
        console.warn('[Vanta] localStorage persist failed:', persistErr.message);
      }
    }

    return () => {
      if (effectRef.current) {
        try { effectRef.current.destroy(); } catch (e) {
          console.warn('[Vanta] destroy failed:', e);
        }
        effectRef.current = null;
      }
    };
  }, [enabled, isDarkMode]);

  return [containerRef, enabled, setEnabled];
}
