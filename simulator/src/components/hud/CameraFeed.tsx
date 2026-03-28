'use client';

import { useEffect, useRef, useState } from 'react';
import { useCapturePreviewStore } from '@/lib/capture/capture-preview-store';
import { useIsCoarsePointer } from '@/lib/hooks/useIsCoarsePointer';
import { Camera, Eye, EyeOff, X } from 'lucide-react';

type DragPosition = {
  x: number;
  y: number;
};

export function CameraFeed() {
  const previewDataUrl = useCapturePreviewStore((s) => s.previewDataUrl);
  const bufferedFrames = useCapturePreviewStore((s) => s.bufferedFrames);
  const isRecording = useCapturePreviewStore((s) => s.isRecording);
  const pipVisible = useCapturePreviewStore((s) => s.pipVisible);
  const togglePipVisible = useCapturePreviewStore((s) => s.togglePipVisible);
  const isCoarsePointer = useIsCoarsePointer();
  const [position, setPosition] = useState<DragPosition>({ x: 0, y: 0 });
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragState.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setPosition({
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      });
    }

    function stopDragging(event: PointerEvent) {
      if (dragState.current?.pointerId === event.pointerId) {
        dragState.current = null;
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);

  function startDragging(event: React.PointerEvent<HTMLDivElement>) {
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  }

  function handleToggleVisibility() {
    if (!pipVisible) {
      setPosition({ x: 0, y: 0 });
    }
    togglePipVisible();
  }

  return (
    <div className={`absolute z-20 flex flex-col items-end gap-2 ${isCoarsePointer ? 'right-3 top-3' : 'right-4 top-4'}`}>
      <button
        onClick={handleToggleVisibility}
        className="pointer-events-auto flex items-center gap-2 rounded-lg border border-gray-700 bg-black/70 px-3 py-1.5 text-xs text-gray-200 backdrop-blur-sm transition-colors hover:bg-black/80"
        title={pipVisible ? 'Hide AI camera preview' : 'Show AI camera preview'}
      >
        {pipVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {pipVisible ? 'Hide AI Camera' : 'Show AI Camera'}
      </button>

      {pipVisible && (
        <div
          className={`${isCoarsePointer ? 'w-[170px]' : 'w-[240px]'} overflow-hidden rounded-xl border border-gray-700 bg-black/80 shadow-2xl shadow-black/50 backdrop-blur-sm`}
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        >
          <div
            className="pointer-events-auto flex cursor-grab items-center justify-between border-b border-gray-700 px-3 py-2 active:cursor-grabbing"
            onPointerDown={startDragging}
          >
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-200">
              <Camera className="h-3.5 w-3.5 text-cyan-400" />
              AI CAMERA
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <span className={`h-2 w-2 rounded-full ${isRecording ? 'bg-red-400 animate-pulse' : 'bg-gray-600'}`} />
                {isRecording ? 'REC' : 'IDLE'}
              </div>
              <button
                type="button"
                aria-label="Minimize AI camera preview"
                onClick={togglePipVisible}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white transition-colors hover:bg-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="relative aspect-[4/3] bg-gray-950">
            {previewDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewDataUrl}
                alt="Car POV preview"
                className="h-full w-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                Waiting for frames...
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2 text-[10px] text-gray-400">
            <span>{isCoarsePointer ? 'Drag header to move' : 'Drag header to reposition'}</span>
            <span>{bufferedFrames.toLocaleString()} buffered</span>
          </div>
        </div>
      )}
    </div>
  );
}
