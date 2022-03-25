import React, { useEffect, useRef, useState } from 'react';

interface IProps {
  title?: any,
  style?: object
  children: any,
}

export default function Dropdown({ children, style, title }: IProps) {

  const node = useRef<any>();
  const [show, setShow] = useState<boolean>(false);

  const clickOutside = (e: any) => {
    if (node && !node.current.contains(e.target)) {
      setShow(false);      
    }
  }

  useEffect(() => {
    document.addEventListener('mousedown', clickOutside);
    return () => {
      document.removeEventListener('mousedown', clickOutside);
    }
  }, [])

  return <div className='dropdown' style={{ position: 'relative' }} ref={node}>
    <button onClick={() => { setShow(!show) }}>{title}</button>
    <div className='bg-white dropdown-content shadow br-7'
      style={{
        position: 'absolute',
        left: '105%',
        top: 0,
        zIndex: 9999,
        overflow: 'hidden',
        display: show ? 'block' : 'none',
        ...style
      }}>
      {children}
    </div>
  </div>
}
