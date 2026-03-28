'use client';

import { useEffect, useState } from 'react';

function detectCoarsePointer() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

export function useIsCoarsePointer() {
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(detectCoarsePointer());

    update();
    mediaQuery.addEventListener('change', update);
    window.addEventListener('resize', update);

    return () => {
      mediaQuery.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return isCoarsePointer;
}
