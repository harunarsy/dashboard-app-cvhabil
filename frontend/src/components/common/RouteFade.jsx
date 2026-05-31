import React from 'react';
import { useLocation } from 'react-router-dom';
import useReducedMotion from '../../hooks/useReducedMotion';

export default function RouteFade({ children }) {
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      return undefined;
    }
    setEntered(false);
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, reducedMotion]);

  return (
    <div
      key={location.pathname}
      className={reducedMotion ? undefined : `route-fade${entered ? ' route-fade--entered' : ''}`}
    >
      {children}
    </div>
  );
}
