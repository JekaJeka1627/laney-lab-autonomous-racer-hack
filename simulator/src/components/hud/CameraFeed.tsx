'use client';

import { useCapturePreviewStore } from '@/lib/capture/capture-preview-store';
import { useIsCoarsePointer } from '@/lib/hooks/useIsCoarsePointer';
import { Camera, Eye, EyeOff } from 'lucide-react';

export function CameraFeed() {
  const previewDataUrl = useCapturePreviewStore((s) => s.previewDataUrl);
  const bufferedFrames = useCapturePreviewStore((s) => s.bufferedFrames);
  const isRecording = useCapturePreviewStore((s) => s.isRecording);
  const pipVisible = useCapturePreviewStore((s) => s.pipVisible);
  const togglePipVisible = useCapturePreviewStore((s) => s.togglePipVisible);
  const isCoarsePointer = useIsCoarsePointer();

  return (
    <div className={`absolute z-20 flex flex-col items-end gap-2 ${isCoarsePointer ? 'right-3 top-3' : 'right-4 top-4'}`}>
      <button
        onClick={togglePipVisible}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 hover:bg-black/80 text-xs text-gray-200 border border-gray-700 backdrop-blur-sm transition-colors"
        title={pipVisible ? 'Hide AI camera preview' : 'Show AI camera preview'}
      >
        {pipVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        {pipVisible ? 'Hide AI Camera' : 'Show AI Camera'}
      </button>

      {pipVisible && (
        <div className={`${isCoarsePointer ? 'w-[160px]' : 'w-[240px]'} rounded-xl overflow-hidden border border-gray-700 bg-black/80 backdrop-blur-sm shadow-2xl shadow-black/50`}>
          <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-200">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              AI CAMERA
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-400 animate-pulse' : 'bg-gray-600'}`} />
              {isRecording ? 'REC' : 'IDLE'}
            </div>
          </div>

          <div className="relative aspect-[4/3] bg-gray-950">
            {previewDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewDataUrl} alt="Car POV preview" className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                Waiting for frames...
              </div>
            )}
          </div>

          <div className="px-3 py-2 text-[10px] text-gray-400 flex items-center justify-between gap-2">
            <span>{isCoarsePointer ? 'Model view' : 'What the model sees (160x120)'}</span>
            <span>{bufferedFrames.toLocaleString()} buffered</span>
          </div>
        </div>
      )}
    </div>
  );
}
