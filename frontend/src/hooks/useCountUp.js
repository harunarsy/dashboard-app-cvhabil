import { useEffect, useRef, useState } from 'react';
import { UI_MOTION } from '../constants/ui';
import useReducedMotion from './useReducedMotion';

function toNumber(value) {
  const next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : 0;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function useCountUp(value, duration = UI_MOTION.duration.countUp, loading = false) {
  const reducedMotion = useReducedMotion();
  const frameRef = useRef(0);
  const lastValueRef = useRef(toNumber(value));
  const [displayValue, setDisplayValue] = useState(lastValueRef.current);

  useEffect(() => {
    const target = toNumber(value);
    const cancelFrame = () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };

    if (loading || reducedMotion) {
      cancelFrame();
      lastValueRef.current = target;
      setDisplayValue(target);
      return cancelFrame;
    }

    const startValue = lastValueRef.current;
    if (startValue === target) {
      setDisplayValue(target);
      return cancelFrame;
    }

    const startAt = performance.now();
    const delta = target - startValue;

    const tick = (now) => {
      const progress = Math.min(1, (now - startAt) / duration);
      const eased = easeOutCubic(progress);
      const nextValue = startValue + (delta * eased);
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        lastValueRef.current = target;
        frameRef.current = 0;
      }
    };

    cancelFrame();
    frameRef.current = requestAnimationFrame(tick);
    return cancelFrame;
  }, [duration, loading, reducedMotion, value]);

  return displayValue;
}
