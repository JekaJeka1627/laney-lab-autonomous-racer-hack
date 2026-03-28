# Simulator Mobile Controls Overhaul -- Codex Execution Guide

This document describes the work to replace the broken binary touch buttons with a proper tilt-to-steer + analog-throttle mobile control scheme for the Deep Racer simulator. The goal is better training data quality (analog signals instead of binary on/off) and a more intuitive driving experience for students.

---

## CRITICAL GUARDRAILS -- READ BEFORE ANY WORK

- Do NOT delete or modify any existing run data in `.data/` or IndexedDB schemas
- Do NOT change the `ControlFrame` interface shape -- training data format must stay backward-compatible
- Do NOT break keyboard controls -- they must continue working exactly as-is on desktop
- Do NOT break the AI autonomous driving mode -- the `isAuto` branch in `Car3D.tsx` must be untouched
- Do NOT add emojis to code, UI text, or generated content
- Preserve all existing comments and documentation unless the task explicitly says to change them
- Run `npm run lint` and `npm run build` after each task

### Verification commands

```bash
npm run lint
npm run build
npm test
```

---

## Background: Why the Current Touch Controls Are Broken

### Current implementation

`src/components/hud/TouchDriveControls.tsx` renders 4 hold-buttons (Left, Right, Gas, Brake). Each is a binary `setManualControl('left', true/false)` toggle using PointerCapture events.

### Why "throttle drag" doesn't work

The throttle bar and speed bar in `src/components/hud/ControlsHUD.tsx` (lines 70-97) are read-only displays, not interactive. Users see the bar, try to drag it, and nothing happens. The underlying `manualControls` state is purely boolean:

```ts
manualControls: { left: boolean; right: boolean; accelerate: boolean; brake: boolean; }
```

There is no analog (0.0 to 1.0) input path from touch controls.

### Why this matters for training data

The `ControlFrame` logged at ~10 FPS captures `steering` and `throttle` as floats. With binary buttons, steering is always -1, 0, or 1 (ramped slightly by `STEER_RAMP`), and throttle is always 0 or 1. This produces low-information training data. Analog tilt input produces diverse values (0.3, -0.6, 0.15, etc.) which gives the ML model much richer signal.

---

## Architecture Overview

### Control flow (current -- keyboard + touch buttons)

```
KeyboardHandler.tsx -> store.setKey() + store.setManualControl()
TouchDriveControls.tsx -> store.setManualControl()
                               |
                               v
Car3D.tsx useFrame() reads store.keys + store.manualControls (booleans)
  -> sets car.steerTarget to -1, 0, or 1
  -> sets car.throttleTarget to 0 or 1
  -> ramps car.steering and car.throttle toward targets
  -> applies physics (acceleration, braking, friction)
  -> store.updateCar()
```

### Control flow (new -- tilt + analog touch)

```
KeyboardHandler.tsx -> store.setKey() + store.setManualControl()  [unchanged]
TiltDriveControls.tsx -> store.setAnalogSteer(float) + store.setAnalogThrottle(float)
                               |
                               v
Car3D.tsx useFrame() checks store.controlScheme
  if 'buttons': use store.manualControls (booleans) as before [unchanged]
  if 'tilt': use store.analogSteer and store.analogThrottle (floats) directly as targets
  -> ramps car.steering and car.throttle toward targets [same ramp logic]
  -> applies physics [unchanged]
  -> store.updateCar()
```

The key insight: `Car3D.tsx` already has a `steerTarget` / `throttleTarget` -> ramp -> physics pipeline. The tilt scheme just feeds analog floats into `steerTarget` and `throttleTarget` instead of binary -1/0/1.

---

## Task 1: Add Analog Input State to Game Store

**File to modify:** `src/lib/stores/game-store.ts`

### 1a. Add new state fields to the `GameState` interface (after the `manualControls` block, around line 72)

```ts
// Analog input (tilt / touch-zone controls)
controlScheme: 'buttons' | 'tilt';
setControlScheme: (scheme: 'buttons' | 'tilt') => void;
analogSteer: number;    // -1.0 (left) to 1.0 (right), from gyroscope
analogThrottle: number; // 0.0 to 1.0, from touch zone
setAnalogSteer: (value: number) => void;
setAnalogThrottle: (value: number) => void;
```

### 1b. Add initializers and setters in the `create<GameState>` call (after `resetManualControls`, around line 172)

```ts
controlScheme: 'buttons',
setControlScheme: (scheme) => {
  set({ controlScheme: scheme });
  if (typeof window !== 'undefined') {
    localStorage.setItem('deepracer-control-scheme', scheme);
  }
},
analogSteer: 0,
analogThrottle: 0,
setAnalogSteer: (value) => set({ analogSteer: Math.max(-1, Math.min(1, value)) }),
setAnalogThrottle: (value) => set({ analogThrottle: Math.max(0, Math.min(1, value)) }),
```

### 1c. Load saved control scheme preference on init

Add a loader function near `loadLabRandomizationEnabled()` (around line 119):

```ts
function loadControlScheme(): 'buttons' | 'tilt' {
  if (typeof window === 'undefined') return 'buttons';
  const saved = localStorage.getItem('deepracer-control-scheme');
  return saved === 'tilt' ? 'tilt' : 'buttons';
}
```

Then set the initial value: `controlScheme: loadControlScheme(),`

### Acceptance criteria

- `npm run build` passes with no type errors
- Existing `manualControls` still works -- nothing removed, only new fields added
- `controlScheme` defaults to `'buttons'` (backward compatible)
- `analogSteer` and `analogThrottle` are clamped to their valid ranges

---

## Task 2: Wire Analog Input Into Car Physics

**File to modify:** `src/components/game/Car3D.tsx`

### What to change

In the `else` branch (manual driving, starting at line 127), add a condition that checks `store.controlScheme`:

```ts
} else {
  // --- Manual input ---
  if (store.controlScheme === 'tilt') {
    // Tilt mode: analog values feed directly into targets
    car.steerTarget = store.analogSteer;
    car.throttleTarget = store.analogThrottle;

    // Ramp steering toward target (same as button mode)
    car.steering += clamp(car.steerTarget - car.steering, -STEER_RAMP * dt, STEER_RAMP * dt);
    // Gentle auto-recenter when steer is near zero
    if (Math.abs(store.analogSteer) < 0.05) {
      car.steering *= 1 - (STEER_DAMP * dt);
    }
    car.steering = clamp(car.steering, -1, 1);
    if (Math.abs(car.steering) < 0.01) car.steering = 0;

    // Ramp throttle toward target
    car.throttle += clamp(car.throttleTarget - car.throttle, -THROTTLE_RAMP * dt, THROTTLE_RAMP * dt);
    car.throttle = clamp(car.throttle, 0, 1);

    // Apply acceleration from throttle
    if (car.throttle > 0.01) {
      car.speed = Math.min(car.speed + ACCELERATION * car.throttle * dt, effectiveMaxSpeed);
    }
    // Coast friction when throttle is released
    if (car.throttle < 0.05) {
      if (car.speed > 0) car.speed = Math.max(0, car.speed - FRICTION * dt);
      else if (car.speed < 0) car.speed = Math.min(0, car.speed + FRICTION * dt);
    }
  } else {
    // --- Button/keyboard mode (EXISTING CODE -- do not modify) ---
    const keys = store.keys;
    const controls = store.manualControls;
    // ... rest of existing button logic unchanged ...
  }
}
```

### Important

- Do NOT modify the existing button/keyboard branch at all -- wrap it in the `else` of the `controlScheme` check
- Do NOT modify the AI (`isAuto`) branch
- The tilt branch reuses the same `STEER_RAMP`, `THROTTLE_RAMP`, `STEER_DAMP` constants
- Brake in tilt mode is handled by `analogThrottle = 0` (coast to stop). A separate brake touch zone is added in Task 3.

### Acceptance criteria

- Keyboard driving still works identically (controlScheme defaults to 'buttons')
- When `controlScheme === 'tilt'`, `analogSteer` and `analogThrottle` drive the car
- `npm run build` passes

---

## Task 3: Create TiltDriveControls Component

**File to create:** `src/components/hud/TiltDriveControls.tsx`

This is the main new component that replaces `TouchDriveControls` on mobile when tilt mode is active.

### Behavior

1. **Steering:** Uses `DeviceOrientationEvent` to read device tilt (gamma axis = left/right tilt)
2. **Throttle:** Right half of screen is a touch zone. Vertical finger position maps to throttle: bottom = 0, top = 1.0
3. **Brake:** Left half of screen tap = brake (sets throttle to 0 and applies brief deceleration)
4. **Center controls:** Pause, Restart, End Run buttons (same as current `TouchDriveControls`)

### Implementation details

**Gyroscope steering:**

```ts
// Request permission on iOS
async function requestGyroPermission(): Promise<boolean> {
  if (typeof DeviceOrientationEvent !== 'undefined'
      && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
    try {
      const permission = await (DeviceOrientationEvent as any).requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }
  // Android and other platforms: permission not needed
  return true;
}

// In the deviceorientation handler:
function handleOrientation(e: DeviceOrientationEvent) {
  const gamma = e.gamma ?? 0; // left/right tilt in degrees (-90 to 90)
  const maxTilt = 30; // degrees for full lock
  const raw = gamma / maxTilt;
  const clamped = Math.max(-1, Math.min(1, raw));
  store.setAnalogSteer(clamped);
}
```

**Calibration:** Add a "Calibrate" button that saves the current gamma as the zero-offset. Store as a ref. Subtract the offset in the handler so the user can hold the device at any comfortable angle.

```ts
const calibrationOffset = useRef(0);

function calibrate() {
  // Next orientation event saves current gamma as the new "center"
  calibrationOffset.current = lastGamma.current;
}

// In handler:
const adjusted = (gamma - calibrationOffset.current) / maxTilt;
```

**Throttle touch zone (right half of screen):**

```ts
// A transparent div covering the right 50% of the viewport
// onPointerDown + onPointerMove: calculate vertical position
function handleThrottleTouch(e: React.PointerEvent) {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const normalized = 1 - (y / rect.height); // 0 at bottom, 1 at top
  const clamped = Math.max(0, Math.min(1, normalized));
  store.setAnalogThrottle(clamped);
}
// onPointerUp / onPointerCancel: release throttle
function handleThrottleRelease() {
  store.setAnalogThrottle(0);
}
```

**Brake touch zone (left half of screen):**

```ts
// A transparent div covering the left 50% of the viewport
// Tapping sets analogThrottle to 0 and applies a brief braking flag
// Use a ref to track brake state, feed into a store brake signal
```

Alternatively, use the existing `manualControls.brake` for the left-side brake tap so `Car3D.tsx` can apply `BRAKE_FORCE`. In the tilt branch of Car3D, also check `store.manualControls.brake`:

```ts
if (store.manualControls.brake) {
  car.speed = Math.max(car.speed - BRAKE_FORCE * dt, 0);
  car.throttleTarget = 0;
}
```

**Center controls (Pause/Restart/End):** Copy the center button cluster from `TouchDriveControls.tsx` (lines 130-155). Same styling, same actions.

**Gyro availability detection:** If `DeviceOrientationEvent` is not supported or permission is denied, auto-fall back to `controlScheme: 'buttons'` and show a toast or message in `MobileDriveHelp`.

### Visual layout

```
+--------------------------------------------------+
|                                                  |
|   [BRAKE ZONE]          [THROTTLE ZONE]          |
|   left 50%              right 50%                |
|   tap = brake           drag up/down = gas       |
|                                                  |
|          [Pause] [Restart] [End]                 |
+--------------------------------------------------+
```

- Both zones are transparent overlays (no visible UI except subtle edge hints)
- The throttle zone shows a thin vertical track on the right edge with a small dot indicator showing current throttle level
- The brake zone shows a subtle "BRAKE" label that flashes on tap

### Acceptance criteria

- Tilting device left/right steers the car with analog precision (-1.0 to 1.0)
- Right-side vertical touch controls throttle (0.0 to 1.0)
- Left-side tap brakes
- Calibrate button works (resets center point)
- iOS permission prompt fires correctly
- Falls back to buttons if gyro unavailable
- Pause/Restart/End buttons work
- `npm run build` passes

---

## Task 4: Create useDeviceOrientation Hook

**File to create:** `src/lib/hooks/useDeviceOrientation.ts`

Extract the gyroscope logic into a reusable hook so `TiltDriveControls` stays clean.

```ts
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface OrientationState {
  alpha: number | null; // compass direction (0-360)
  beta: number | null;  // front/back tilt (-180 to 180)
  gamma: number | null; // left/right tilt (-90 to 90)
  supported: boolean;
  permissionGranted: boolean;
}

export function useDeviceOrientation() {
  const [state, setState] = useState<OrientationState>({
    alpha: null, beta: null, gamma: null,
    supported: false, permissionGranted: false,
  });
  const calibrationOffset = useRef(0);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        const granted = result === 'granted';
        setState(s => ({ ...s, permissionGranted: granted }));
        return granted;
      } catch { return false; }
    }
    // Non-iOS: no permission needed
    setState(s => ({ ...s, permissionGranted: true }));
    return true;
  }, []);

  const calibrate = useCallback(() => {
    setState(s => {
      calibrationOffset.current = s.gamma ?? 0;
      return s;
    });
  }, []);

  const getCalibratedGamma = useCallback((): number => {
    return (state.gamma ?? 0) - calibrationOffset.current;
  }, [state.gamma]);

  useEffect(() => {
    const supported = typeof DeviceOrientationEvent !== 'undefined';
    setState(s => ({ ...s, supported }));
    if (!supported) return;

    function handler(e: DeviceOrientationEvent) {
      setState(s => ({
        ...s,
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
      }));
    }

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, []);

  return { ...state, requestPermission, calibrate, getCalibratedGamma, calibrationOffset };
}
```

### Acceptance criteria

- Hook returns orientation data, support flag, and permission state
- `requestPermission()` handles iOS permission flow
- `calibrate()` saves current gamma as zero-offset
- `getCalibratedGamma()` returns offset-adjusted value
- `npm run build` passes

---

## Task 5: Update TouchDriveControls to Respect Control Scheme

**File to modify:** `src/components/hud/TouchDriveControls.tsx`

### Change

Add a check for `controlScheme` so the button overlay only renders in button mode:

At line 73, after existing store reads, add:

```ts
const controlScheme = useGameStore((s) => s.controlScheme);
```

At line 81, update the early-return condition:

```ts
if (!isCoarsePointer || driveMode !== 'manual' || (mode !== 'driving' && mode !== 'paused') || controlScheme === 'tilt') {
  return null;
}
```

This ensures when tilt mode is active, the old button controls hide and `TiltDriveControls` takes over.

### Acceptance criteria

- Button mode: `TouchDriveControls` renders as before
- Tilt mode: `TouchDriveControls` returns null, `TiltDriveControls` renders instead
- `npm run build` passes

---

## Task 6: Update MobileDriveHelp With Control Scheme Toggle

**File to modify:** `src/components/hud/MobileDriveHelp.tsx`

### Changes

1. Add a control scheme toggle to the help overlay so users can choose between "Tilt" and "Buttons"
2. Show different instructions based on the selected scheme
3. If gyro is not supported, disable the tilt option and show a note

### Implementation

- Import `useGameStore` to read/set `controlScheme`
- Import `useDeviceOrientation` to check `supported` flag
- Add two toggle buttons: "Tilt steering" and "Button controls"
- When "Tilt steering" is selected and gyro requires permission, call `requestPermission()` before switching
- Update instruction text:
  - Tilt mode: "Tilt your device to steer. Right side of screen controls gas (slide up/down). Tap left side to brake."
  - Button mode: "Left side steers. Right side controls gas and brake." (existing text)

### Acceptance criteria

- Users can toggle between tilt and button modes before starting
- Tilt option is disabled with explanation if gyro unavailable
- iOS permission prompt fires when selecting tilt for the first time
- Selected scheme persists in localStorage
- `npm run build` passes

---

## Task 7: Mount TiltDriveControls in GameHUD

**File to modify:** `src/components/hud/GameHUD.tsx`

### What to add

Import and render `TiltDriveControls` alongside the existing `TouchDriveControls`. Both components self-gate based on `controlScheme`, so only one renders at a time.

Find where `TouchDriveControls` is rendered and add `TiltDriveControls` next to it:

```tsx
<TouchDriveControls />
<TiltDriveControls />
```

### Acceptance criteria

- Both components are mounted
- Only one renders at any time based on `controlScheme`
- No visual overlap or z-index conflicts
- `npm run build` passes

---

## Suggested Execution Order

Tasks are designed to be done sequentially:

1. **Task 1** -- Game store changes (foundation for everything)
2. **Task 4** -- useDeviceOrientation hook (standalone, no dependencies except React)
3. **Task 2** -- Car3D physics wiring (depends on Task 1)
4. **Task 3** -- TiltDriveControls component (depends on Tasks 1, 4)
5. **Task 5** -- Hide button controls in tilt mode (depends on Task 1)
6. **Task 6** -- MobileDriveHelp toggle (depends on Tasks 1, 4)
7. **Task 7** -- Mount in GameHUD (depends on Task 3)

---

## File Index

| File | Role |
| ---- | ---- |
| `src/lib/stores/game-store.ts` | Zustand store -- car state, input state, game mode |
| `src/components/game/Car3D.tsx` | Car physics -- reads input, applies forces, updates position |
| `src/components/game/KeyboardHandler.tsx` | Keyboard input -> store (do NOT modify) |
| `src/components/hud/TouchDriveControls.tsx` | Current binary touch buttons (modify to gate on scheme) |
| `src/components/hud/TiltDriveControls.tsx` | NEW -- tilt steering + analog throttle touch zones |
| `src/components/hud/ManualDriveControls.tsx` | Desktop pause/restart/stop buttons (do NOT modify) |
| `src/components/hud/ControlsHUD.tsx` | Read-only steering wheel + throttle/speed display |
| `src/components/hud/MobileDriveHelp.tsx` | Mobile help overlay with scheme toggle |
| `src/components/hud/GameHUD.tsx` | HUD container that mounts all HUD components |
| `src/lib/hooks/useIsCoarsePointer.ts` | Touch device detection hook |
| `src/lib/hooks/useDeviceOrientation.ts` | NEW -- gyroscope hook with calibration |

---

## Testing Checklist

After all tasks are complete:

```bash
npm run lint
npm run build
npm test
```

### Manual verification

1. **Desktop keyboard:** Open simulator on desktop. Drive with WASD/arrows. Verify nothing changed.
2. **Mobile buttons mode:** Open on phone/tablet. Select "Button controls" in help overlay. Verify Left/Right/Gas/Brake buttons work as before.
3. **Mobile tilt mode:** Select "Tilt steering". Verify:
   - iOS: permission prompt appears. After granting, tilting steers.
   - Android: tilting steers immediately.
   - Right-side vertical touch = analog throttle (slide finger up for more gas).
   - Left-side tap = brake.
   - Calibrate button resets center position.
4. **Training data quality:** Start a manual tilt-mode run, drive a lap, end run. Check that `controls.csv` contains diverse steering values (not just -1, 0, 1).
5. **Fallback:** On a device without gyroscope, verify tilt option is grayed out and buttons mode is auto-selected.
6. **AI mode:** Verify autonomous driving is completely unaffected.
