import React, { useMemo, useRef, useState } from 'react';
import { Film, Mic, Music, ZoomIn, ZoomOut } from 'lucide-react';
import type { AudioClip, MediaAsset, VideoClip } from '../types/editor';
import { computeVideoSegments, formatSeconds } from '../utils/timelineMath';

interface TimelinePanelProps {
  assets: MediaAsset[];
  videoClips: VideoClip[];
  audioClips: AudioClip[];
  currentTime: number;
  totalDuration: number;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void;
  onUpdateAudioClipStart: (id: string, newStart: number) => void;
  onResizeVideoClipDuration: (id: string, newDuration: number) => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  assets,
  videoClips,
  audioClips,
  currentTime,
  totalDuration,
  selectedClipId,
  onSelectClip,
  onSeek,
  onUpdateAudioClipStart,
  onResizeVideoClipDuration,
}) => {
  const [pxPerSec, setPxPerSec] = useState(54);
  const trackContainerRef = useRef<HTMLDivElement | null>(null);

  const assetMap = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  const { segments } = useMemo(() => computeVideoSegments(videoClips), [videoClips]);

  const timelineWidth = Math.max(960, Math.ceil((totalDuration + 6) * pxPerSec));

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = trackContainerRef.current;
    if (!container) return;

    const updateFromClientX = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left + container.scrollLeft;
      const t = Math.max(0, Math.min(totalDuration || 10, x / pxPerSec));
      onSeek(t);
    };

    updateFromClientX(e.clientX);

    const onMove = (ev: PointerEvent) => updateFromClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleAudioDragStart = (e: React.PointerEvent, clip: AudioClip) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    const startX = e.clientX;
    const origStart = clip.startTime;

    const onMove = (ev: PointerEvent) => {
      const deltaSec = (ev.clientX - startX) / pxPerSec;
      onUpdateAudioClipStart(clip.id, Math.max(0, Math.round((origStart + deltaSec) * 20) / 20));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleVideoTrimRight = (e: React.PointerEvent, clip: VideoClip) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    const startX = e.clientX;
    const origDur = clip.duration;

    const onMove = (ev: PointerEvent) => {
      const deltaSec = (ev.clientX - startX) / pxPerSec;
      onResizeVideoClipDuration(
        clip.id,
        Math.max(0.5, Math.round((origDur + deltaSec) * 10) / 10)
      );
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const rulerTicks = useMemo(() => {
    const step = pxPerSec >= 70 ? 1 : pxPerSec >= 35 ? 2 : 5;
    const count = Math.ceil((totalDuration + 6) / step);
    return Array.from({ length: count + 1 }, (_, i) => i * step);
  }, [totalDuration, pxPerSec]);

  const a1Clips = audioClips.filter((c) => c.track === 'A1');
  const a2Clips = audioClips.filter((c) => c.track === 'A2');

  return (
    <div className="h-[250px] bg-[#111419] border-t border-[#262B35] flex flex-col select-none shrink-0">
      {/* Timeline Toolbar */}
      <div className="h-9 px-4 border-b border-[#262B35] bg-[#14171C] flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
          <span className="font-medium text-[#E2E8F0]">Sequence Timeline</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{videoClips.length} video</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{audioClips.length} audio</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPxPerSec((z) => Math.max(24, z - 12))}
            className="p-1 rounded text-[#94A3B8] hover:text-white hover:bg-[#1E232B]"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={24}
            max={120}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="w-24 accent-[#2563EB]"
          />
          <button
            type="button"
            onClick={() => setPxPerSec((z) => Math.min(120, z + 12))}
            className="p-1 rounded text-[#94A3B8] hover:text-white hover:bg-[#1E232B]"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tracks + Scrollable Grid */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track Header Column */}
        <div className="w-[128px] bg-[#14171C] border-r border-[#262B35] flex flex-col shrink-0">
          <div className="h-7 border-b border-[#262B35] px-3 flex items-center text-[11px] font-mono text-[#64748B]">
            TIMECODE
          </div>
          <div className="h-[68px] border-b border-[#262B35] px-3 flex items-center gap-2 text-xs font-medium text-[#E2E8F0]">
            <Film className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>V1 · Video</span>
          </div>
          <div className="h-[52px] border-b border-[#262B35] px-3 flex items-center gap-2 text-xs font-medium text-[#CBD5E1]">
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            <span>A1 · Voice</span>
          </div>
          <div className="h-[52px] px-3 flex items-center gap-2 text-xs font-medium text-[#CBD5E1]">
            <Music className="w-3.5 h-3.5 text-amber-400" />
            <span>A2 · Music</span>
          </div>
        </div>

        {/* Scrollable Track Area */}
        <div
          ref={trackContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0D0F12]"
        >
          <div style={{ width: `${timelineWidth}px` }} className="relative h-full">
            {/* Ruler */}
            <div
              onPointerDown={handleRulerPointerDown}
              className="h-7 border-b border-[#262B35] bg-[#13161B] relative cursor-pointer"
            >
              {rulerTicks.map((sec) => (
                <div
                  key={sec}
                  style={{ left: `${sec * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 border-l border-[#262B35] pl-1.5 flex items-center text-[10px] font-mono tabular-nums text-[#64748B]"
                >
                  {sec}s
                </div>
              ))}
            </div>

            {/* Track V1 */}
            <div
              onClick={() => onSelectClip(null)}
              className="h-[68px] border-b border-[#262B35] relative bg-[#0F1216]"
            >
              {segments.map((seg) => {
                const { clip, effectiveStart, effectiveEnd, transitionOverlap } = seg;
                const widthPx = Math.max(28, (effectiveEnd - effectiveStart) * pxPerSec);
                const leftPx = effectiveStart * pxPerSec;
                const asset = assetMap.get(clip.assetId);
                const isSelected = selectedClipId === clip.id;

                return (
                  <div
                    key={clip.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectClip(clip.id);
                    }}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    className={`absolute top-1.5 bottom-1.5 rounded border overflow-hidden cursor-pointer transition-colors flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#3B82F6] ring-1 ring-[#3B82F6] bg-[#1E3A8A]/45'
                        : 'border-[#334155] bg-[#1B2433] hover:border-[#475569]'
                    }`}
                  >
                    {asset?.type === 'image' && (
                      <img
                        src={asset.url}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
                      />
                    )}
                    <div className="relative z-10 px-2 pt-1 flex items-center justify-between gap-1">
                      <span className="text-[11px] font-medium text-white truncate">
                        {clip.name}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-[#CBD5E1] shrink-0">
                        {formatSeconds(clip.duration)}
                      </span>
                    </div>
                    <div className="relative z-10 px-2 pb-1 flex items-center gap-1.5 text-[10px] font-mono text-[#93C5FD] truncate">
                      {transitionOverlap > 0 && (
                        <span>
                          xfade:{clip.transitionIn} ({clip.transitionDuration.toFixed(1)}s)
                        </span>
                      )}
                      {clip.effect !== 'none' && <span>fx:{clip.effect}</span>}
                      {clip.overlay?.text && <span>title</span>}
                    </div>

                    {/* Right Trim Handle */}
                    <div
                      onPointerDown={(e) => handleVideoTrimRight(e, clip)}
                      title="Drag to resize clip duration"
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/10 hover:bg-[#3B82F6] z-20"
                    />
                  </div>
                );
              })}
            </div>

            {/* Track A1 (Voice / TTS) */}
            <div
              onClick={() => onSelectClip(null)}
              className="h-[52px] border-b border-[#262B35] relative bg-[#0D1014]"
            >
              {a1Clips.map((clip) => {
                const isSelected = selectedClipId === clip.id;
                const leftPx = clip.startTime * pxPerSec;
                const widthPx = Math.max(24, clip.duration * pxPerSec);
                return (
                  <div
                    key={clip.id}
                    onPointerDown={(e) => handleAudioDragStart(e, clip)}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    className={`absolute top-1.5 bottom-1.5 rounded border px-2 flex items-center justify-between cursor-grab active:cursor-grabbing ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-950/70'
                        : 'border-emerald-800/70 bg-emerald-950/40 hover:border-emerald-600'
                    }`}
                  >
                    <span className="text-[11px] font-medium text-emerald-100 truncate">
                      {clip.name}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-emerald-300 shrink-0 ml-1">
                      {clip.duration.toFixed(1)}s
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Track A2 (Music & SFX) */}
            <div
              onClick={() => onSelectClip(null)}
              className="h-[52px] relative bg-[#0D1014]"
            >
              {a2Clips.map((clip) => {
                const isSelected = selectedClipId === clip.id;
                const leftPx = clip.startTime * pxPerSec;
                const widthPx = Math.max(24, clip.duration * pxPerSec);
                return (
                  <div
                    key={clip.id}
                    onPointerDown={(e) => handleAudioDragStart(e, clip)}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    className={`absolute top-1.5 bottom-1.5 rounded border px-2 flex items-center justify-between cursor-grab active:cursor-grabbing ${
                      isSelected
                        ? 'border-amber-400 bg-amber-950/70'
                        : 'border-amber-800/70 bg-amber-950/40 hover:border-amber-600'
                    }`}
                  >
                    <span className="text-[11px] font-medium text-amber-100 truncate">
                      {clip.name}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-amber-300 shrink-0 ml-1">
                      {clip.duration.toFixed(1)}s
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Playhead Needle */}
            <div
              style={{ left: `${currentTime * pxPerSec}px` }}
              className="absolute top-0 bottom-0 w-[1.5px] bg-[#EF4444] pointer-events-none z-30"
            >
              <div className="w-2.5 h-3 -ml-[4.5px] bg-[#EF4444] rounded-b-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
