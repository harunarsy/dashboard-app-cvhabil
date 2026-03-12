import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import Skeleton from './Skeleton';

describe('Skeleton Component', () => {
  test('renders with default styles', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveClass('skeleton');
    expect(skeleton).toHaveClass('animate-pulse');
    
    // JSDOM might convert 1rem to 16px and 0.5rem to 8px depending on setup
    const style = window.getComputedStyle(skeleton);
    expect(style.width).toBe('100%');
    expect(style.height).toMatch(/1rem|16px|20px/);
    expect(style.borderRadius).toMatch(/0.5rem|8px|10px/);
  });

  test('renders with custom width and height', () => {
    const { container } = render(<Skeleton width="200px" height="50px" />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveStyle({
      width: '200px',
      height: '50px'
    });
  });

  test('renders with custom borderRadius', () => {
    const { container } = render(<Skeleton borderRadius="10px" />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveStyle({
      borderRadius: '10px'
    });
  });

  test('applies custom className', () => {
    const { container } = render(<Skeleton className="custom-class" />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveClass('custom-class');
  });

  test('applies custom style prop', () => {
    const { container } = render(<Skeleton style={{ opacity: 0.5 }} />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveStyle({
      opacity: '0.5'
    });
  });
});
