import React, { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

interface DropdownProps {
  title?: ReactNode;
  style?: CSSProperties;
  children: ReactNode;
}

export default function Dropdown({ children, style, title }: DropdownProps) {
  const node = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (node.current && !node.current.contains(e.target as Node)) {
        setShow(false);
      }
    };

    document.addEventListener('mousedown', clickOutside);
    return () => {
      document.removeEventListener('mousedown', clickOutside);
    };
  }, []);

  return (
    <div className="dropdown" style={{ position: 'relative' }} ref={node}>
      <button type="button" onClick={() => setShow((v) => !v)}>
        {title}
      </button>
      <div
        className="bg-white dropdown-content shadow br-7"
        style={{
          position: 'absolute',
          left: '105%',
          top: 0,
          zIndex: 9999,
          overflow: 'hidden',
          display: show ? 'block' : 'none',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}
