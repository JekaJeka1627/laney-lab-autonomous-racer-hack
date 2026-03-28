'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface OrientationState {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  supported: boolean;
  permissionGranted: boolean;
}

type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const DEVICE_ORIENTATION_SUPPORTED = typeof DeviceOrientationEvent !== 'undefined';

export function useDeviceOrientation() {
  const [state, setState] = useState<OrientationState>({
    alpha: null,
    beta: null,
    gamma: null,
    supported: DEVICE_ORIENTATION_SUPPORTED,
    permissionGranted: false,
  });
  const calibrationOffset = useRef({ beta: 0, gamma: 0 });

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof DeviceOrientationEvent === 'undefined') return false;

    const orientationEvent = DeviceOrientationEvent as IOSDeviceOrientationEvent;
    if (typeof orientationEvent.requestPermission === 'function') {
      try {
        const result = await orientationEvent.requestPermission();
        const granted = result === 'granted';
        setState((current) => ({ ...current, permissionGranted: granted }));
        return granted;
      } catch {
        return false;
      }
    }

    setState((current) => ({ ...current, permissionGranted: true }));
    return true;
  }, []);

  const calibrate = useCallback(() => {
    setState((current) => {
      calibrationOffset.current = {
        beta: current.beta ?? 0,
        gamma: current.gamma ?? 0,
      };
      return current;
    });
  }, []);

  const getCalibratedBeta = useCallback(() => {
    return (state.beta ?? 0) - calibrationOffset.current.beta;
  }, [state.beta]);

  const getCalibratedGamma = useCallback(() => {
    return (state.gamma ?? 0) - calibrationOffset.current.gamma;
  }, [state.gamma]);

  useEffect(() => {
    if (!DEVICE_ORIENTATION_SUPPORTED) return;

    function handler(event: DeviceOrientationEvent) {
      setState((current) => ({
        ...current,
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
      }));
    }

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, []);

  return {
    ...state,
    requestPermission,
    calibrate,
    getCalibratedBeta,
    getCalibratedGamma,
    calibrationOffset,
  };
}
