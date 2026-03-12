import React from 'react';

/**
 * Reusable Skeleton component for loading states
 * @param {string} width - Width of the skeleton (e.g., '100%', '200px')
 * @param {string} height - Height of the skeleton
 * @param {string} borderRadius - Border radius
 * @param {string} className - Additional Tailwind/Custom classes
 * @param {object} style - Inline styles
 */
const Skeleton = ({ width, height, borderRadius, className = '', style = {} }) => {
  return (
    <div
      className={`skeleton animate-pulse ${className}`}
      style={{
        width: width || '100%',
        height: height || '20px',
        borderRadius: borderRadius || '8px',
        ...style
      }}
    />
  );
};

export default Skeleton;
