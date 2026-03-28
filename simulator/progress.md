Original prompt: next i need you to repair the sim driving app, follow these instructions: Created simulator/docs/CODEX-TILT-CONTROLS.md with 7 sequential tasks:

- Task 1 -- Add controlScheme, analogSteer, analogThrottle to game store
- Task 2 -- Wire analog inputs into Car3D.tsx physics (new 'tilt' branch alongside existing button branch)
- Task 3 -- Create TiltDriveControls.tsx (gyro steering + right-side throttle zone + left-side brake zone + calibration)
- Task 4 -- Create useDeviceOrientation hook (gyro listener, iOS permission, calibration offset)
- Task 5 -- Gate existing TouchDriveControls to hide in tilt mode
- Task 6 -- Add tilt/button toggle to MobileDriveHelp overlay
- Task 7 -- Mount TiltDriveControls in GameHUD

Notes:
- Preserve keyboard controls exactly.
- Preserve AI autonomous branch in Car3D.
- Do not change ControlFrame shape.
- Verify with lint/build/test as work progresses.

Progress:
- Loaded CODEX-TILT-CONTROLS.md and audited current store, Car3D, TouchDriveControls, MobileDriveHelp, GameHUD, and page mounting.
- Task 1 complete: added controlScheme, analogSteer, analogThrottle, clamped setters, and localStorage-backed scheme loading in the game store. `npm run lint` and `npm run build` passed.
- Task 4 complete: added `useDeviceOrientation` hook with support detection, iOS permission request flow, calibration offset, and calibrated gamma accessor. `npm run lint` and `npm run build` passed after lint cleanup.
- Task 2 complete: wired a new tilt-mode branch into `Car3D.tsx`, preserving the AI branch and the existing button/keyboard branch. Tilt mode now consumes `analogSteer`, `analogThrottle`, and `manualControls.brake`.
- Tasks 3, 5, 6, and 7 complete together: added `TiltDriveControls`, hid `TouchDriveControls` in tilt mode, added control-scheme selection and gyro-permission handling to `MobileDriveHelp`, and mounted mobile controls from `GameHUD` while removing the standalone touch-control mount from `app/page.tsx`.
- Verification:
  - `npm run lint` passes.
  - `npm run build` passes.
  - `npm test` passes.
  - Attempted browser smoke testing against local `next dev`; the simulator dev server was running on port 3000, but browser automation timed out on the WebGL page load, so the live smoke check remains a manual follow-up item.

TODO / follow-up:
- Manually validate tilt mode on a real phone/tablet because device-orientation events cannot be fully exercised from this terminal session.
- Confirm `controls.csv` from a manual tilt run contains richer analog steering values as expected.
