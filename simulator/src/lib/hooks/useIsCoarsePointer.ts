'use client';

import { useEffect, useState } from 'react';

function isLikelyMobileOrTablet() {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent || navigator.vendor || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 1024;
  const mobilePattern = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const ipadOs = platform === 'MacIntel' && maxTouchPoints > 1;

  return (mobilePattern.test(userAgent) || ipadOs) && smallViewport;
}

function detectCoarsePointer() {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return coarsePointer && isLikelyMobileOrTablet();
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
