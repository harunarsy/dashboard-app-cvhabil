import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useReducedMotion from '../../hooks/useReducedMotion';
import { UI_MOTION } from '../../constants/ui';

const EDGE_MARGIN = 8;
const OFFSET = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCoordinates(preferred, triggerRect, tooltipRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centers = {
    top: {
      top: triggerRect.top - tooltipRect.height - OFFSET,
      left: triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2),
    },
    right: {
      top: triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2),
      left: triggerRect.right + OFFSET,
    },
    bottom: {
      top: triggerRect.bottom + OFFSET,
      left: triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2),
    },
    left: {
      top: triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2),
      left: triggerRect.left - tooltipRect.width - OFFSET,
    },
  };

  let placement = preferred;
  let top = centers[placement].top;
  let left = centers[placement].left;

  const wouldOverflowTop = top < EDGE_MARGIN;
  const wouldOverflowBottom = top + tooltipRect.height > viewportHeight - EDGE_MARGIN;
  const wouldOverflowLeft = left < EDGE_MARGIN;
  const wouldOverflowRight = left + tooltipRect.width > viewportWidth - EDGE_MARGIN;

  if (placement === 'top' && wouldOverflowTop) placement = 'bottom';
  if (placement === 'bottom' && wouldOverflowBottom) placement = 'top';
  if (placement === 'left' && wouldOverflowLeft) placement = 'right';
  if (placement === 'right' && wouldOverflowRight) placement = 'left';

  top = centers[placement].top;
  left = centers[placement].left;

  const maxLeft = viewportWidth - tooltipRect.width - EDGE_MARGIN;
  const maxTop = viewportHeight - tooltipRect.height - EDGE_MARGIN;

  return {
    placement,
    top: clamp(top, EDGE_MARGIN, maxTop),
    left: clamp(left, EDGE_MARGIN, maxLeft),
  };
}

export default function Tooltip({ children, text, position = 'top', delay = 400, className = '', disabled = false, wrapperClassName = '', wrapperStyle = {} }) {
  const id = useId();
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const unmountTimerRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: position });
  const reducedMotion = useReducedMotion();
  const showDelay = reducedMotion ? 0 : delay;
  const hideDelay = reducedMotion ? 0 : UI_MOTION.duration.fast;

  const clearTimers = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  };

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const next = getCoordinates(position, triggerRect, tooltipRect);
    setCoords(next);
  }, [position]);

  useLayoutEffect(() => {
    if (!visible || typeof window === 'undefined') return undefined;
    updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [position, visible, updatePosition]);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const show = () => {
    if (disabled) return;
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      setMounted(true);
      setVisible(true);
    }, showDelay);
  };

  const hide = () => {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      unmountTimerRef.current = window.setTimeout(() => setMounted(false), hideDelay + 20);
    }, hideDelay);
  };

  const child = React.Children.only(children);
  const wrappedChild = React.cloneElement(child, {
    ref: triggerRef,
    'aria-describedby': mounted ? id : undefined,
    onMouseEnter: (event) => {
      child.props?.onMouseEnter?.(event);
      show();
    },
    onMouseLeave: (event) => {
      child.props?.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event) => {
      child.props?.onFocus?.(event);
      show();
    },
    onBlur: (event) => {
      child.props?.onBlur?.(event);
      hide();
    },
  });

  return (
    <>
      <span className={`ui-tooltip-anchor ${wrapperClassName}`.trim()} style={wrapperStyle}>{wrappedChild}</span>
      {mounted && typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          className={`ui-tooltip ${className}`.trim()}
          data-open={visible ? 'true' : 'false'}
          data-placement={coords.placement}
          style={{
            top: coords.top,
            left: coords.left,
            '--tooltip-fade-duration': `${UI_MOTION.duration.fast}ms`,
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}
