import React, { useEffect, useMemo, useRef } from 'react';
import {
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Trash2,
} from 'lucide-react';
import type { AudioClip, MediaAsset, TransitionType, VideoClip } from '../types/editor';
import {
  computeVideoSegments,
  formatTimecode,
  getCanvasFilterForClip,
} from '../utils/timelineMath';

interface ProgramMonitorProps {
  assets: MediaAsset[];
  videoClips: VideoClip[];
  audioClips: AudioClip[];
  aspectRatio: '16:9' | '9:16';
  onAspectRatioChange: (ratio: '16:9' | '9:16') => void;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  selectedClipId: string | null;
  onSplitAtPlayhead: () => void;
  onDeleteSelected: () => void;
}

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
  assets,
  videoClips,
  audioClips,
  aspectRatio,
  onAspectRatioChange,
  currentTime,
  totalDuration,
  isPlaying,
  onTogglePlay,
  onSeek,
  selectedClipId,
  onSplitAtPlayhead,
  onDeleteSelected,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLImageElement | HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const assetMap = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  const { segments } = useMemo(() => computeVideoSegments(videoClips), [videoClips]);

  // Preload visual HTMLImageElement / HTMLVideoElement cache
  useEffect(() => {
    for (const clip of videoClips) {
      const asset = assetMap.get(clip.assetId);
      if (!asset) continue;
      if (!mediaElementsRef.current.has(asset.id)) {
        if (asset.type === 'image') {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = asset.url;
          mediaElementsRef.current.set(asset.id, img);
        } else if (asset.type === 'video') {
          const vid = document.createElement('video');
          vid.crossOrigin = 'anonymous';
          vid.src = asset.url;
          vid.muted = true;
          vid.playsInline = true;
          vid.preload = 'auto';
          mediaElementsRef.current.set(asset.id, vid);
        }
      }
    }
  }, [videoClips, assetMap]);

  // Sync audio elements for A1/A2 playback
  useEffect(() => {
    const activeIds = new Set<string>();

    for (const aClip of audioClips) {
      activeIds.add(aClip.id);
      const asset = assetMap.get(aClip.assetId);
      if (!asset) continue;
      let audio = audioElementsRef.current.get(aClip.id);
      if (!audio) {
        audio = new Audio(asset.url);
        audio.preload = 'auto';
        audioElementsRef.current.set(aClip.id, audio);
      } else if (!audio.src.endsWith(asset.url)) {
        audio.src = asset.url;
      }
    }

    for (const [id, el] of audioElementsRef.current.entries()) {
      if (!activeIds.has(id)) {
        el.pause();
        audioElementsRef.current.delete(id);
      }
    }
  }, [audioClips, assetMap]);

  // Control audio playback synchronized with playhead
  useEffect(() => {
    for (const aClip of audioClips) {
      const el = audioElementsRef.current.get(aClip.id);
      if (!el) continue;

      const inWindow =
        !aClip.muted &&
        currentTime >= aClip.startTime &&
        currentTime < aClip.startTime + aClip.duration;

      if (isPlaying && inWindow) {
        const localOffset = currentTime - aClip.startTime + (aClip.trimStart || 0);
        if (Math.abs(el.currentTime - localOffset) > 0.25) {
          el.currentTime = Math.max(0, localOffset);
        }
        // Apply fadeIn / fadeOut envelope
        const elapsed = currentTime - aClip.startTime;
        const remaining = aClip.startTime + aClip.duration - currentTime;
        let fadeFactor = 1;
        if (aClip.fadeIn > 0 && elapsed < aClip.fadeIn) {
          fadeFactor *= Math.max(0, elapsed / aClip.fadeIn);
        }
        if (aClip.fadeOut > 0 && remaining < aClip.fadeOut) {
          fadeFactor *= Math.max(0, remaining / aClip.fadeOut);
        }
        el.volume = Math.min(1, Math.max(0, (aClip.volume ?? 1) * fadeFactor));
        if (el.paused) {
          void el.play().catch(() => {});
        }
      } else {
        if (!el.paused) el.pause();
      }
    }
  }, [audioClips, currentTime, isPlaying]);

  // Pause all audio on unmount
  useEffect(() => {
    const map = audioElementsRef.current;
    return () => {
      for (const el of map.values()) {
        el.pause();
      }
    };
  }, []);

  // Draw composite frame onto HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = aspectRatio === '16:9' ? 960 : 540;
    const H = aspectRatio === '16:9' ? 540 : 960;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    ctx.fillStyle = '#07090C';
    ctx.fillRect(0, 0, W, H);

    // Find active segments at currentTime (may be 2 segments during transition overlap)
    const activeSegments = segments.filter(
      (seg) => currentTime >= seg.effectiveStart && currentTime <= seg.effectiveEnd
    );

    if (activeSegments.length === 0) {
      ctx.fillStyle = '#334155';
      ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        videoClips.length === 0 ? 'Add clips from Media or Veo AI to begin' : 'End of timeline',
        W / 2,
        H / 2
      );
      return;
    }

    const drawMediaFit = (
      media: HTMLImageElement | HTMLVideoElement,
      clip: VideoClip,
      localT: number,
      alpha = 1,
      clipPathFn?: (c: CanvasRenderingContext2D) => void,
      offsetX = 0,
      offsetY = 0
    ) => {
      const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
      const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
      if (!mw || !mh) return;

      if (media instanceof HTMLVideoElement) {
        const targetVidTime = (clip.trimStart || 0) + localT * (clip.speed || 1);
        if (Math.abs(media.currentTime - targetVidTime) > 0.18) {
          try {
            media.currentTime = Math.min(media.duration || targetVidTime, Math.max(0, targetVidTime));
          } catch {
            // ignore seek before metadata
          }
        }
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      if (clipPathFn) {
        clipPathFn(ctx);
      }

      ctx.filter = getCanvasFilterForClip(clip);

      // Cover crop math + subtle Ken Burns motion on images
      const scaleCover = Math.max(W / mw, H / mh);
      const kenBurns = media instanceof HTMLImageElement ? 1 + Math.min(0.05, localT * 0.008) : 1;
      const drawW = mw * scaleCover * kenBurns;
      const drawH = mh * scaleCover * kenBurns;
      const dx = (W - drawW) / 2 + offsetX;
      const dy = (H - drawH) / 2 + offsetY;

      ctx.drawImage(media, dx, dy, drawW, drawH);
      ctx.filter = 'none';

      // Vignette overlay if vignette/cinematic/noir/vintage
      if (
        clip.effect === 'vignette' ||
        clip.effect === 'cinematic' ||
        clip.effect === 'noir' ||
        clip.effect === 'vintage'
      ) {
        const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.28, W / 2, H / 2, W * 0.72);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.58)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Draw text overlay with Text Effect + Text Transition
      if (clip.overlay?.text && clip.overlay.text.trim().length > 0) {
        const rawText = clip.overlay.text.trim();
        const scaledFontSize = Math.max(
          14,
          Math.round(((clip.overlay.fontSize || 48) / 1920) * W * 1.3)
        );
        const effect = clip.overlay.effect || 'box';
        const textTransition = clip.overlay.transition || 'none';
        const color = clip.overlay.color || '#FFFFFF';
        const accent = clip.overlay.accentColor || '#3B82F6';
        const boxAlpha = clip.overlay.bgOpacity ?? 0.55;
        const clipDur = Math.max(0.5, clip.duration || 4);
        const td = Math.min(
          Math.max(0.15, clipDur * 0.4),
          Math.max(0.15, clip.overlay.transitionDuration ?? 0.5)
        );

        let textAlpha = 1;
        let shiftX = 0;
        let shiftY = 0;
        let textScale = 1;
        let displayText = rawText;

        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
        if (textTransition !== 'none' && textTransition !== 'typewriter') {
          if (localT < td) {
            const pIn = easeOut(Math.min(1, Math.max(0, localT / td)));
            textAlpha = pIn;
            if (textTransition === 'slide_up') shiftY = (1 - pIn) * 32;
            else if (textTransition === 'slide_down') shiftY = -(1 - pIn) * 32;
            else if (textTransition === 'slide_left') shiftX = (1 - pIn) * 85;
            else if (textTransition === 'slide_right') shiftX = -(1 - pIn) * 85;
            else if (textTransition === 'zoom') textScale = 0.72 + 0.28 * pIn;
          } else if (localT > clipDur - td) {
            textAlpha = Math.max(0, (clipDur - localT) / td);
          }
        } else if (textTransition === 'typewriter') {
          const revealDur = Math.min(clipDur * 0.75, Math.max(0.4, td * 2));
          const progress = Math.min(1, Math.max(0.05, localT / revealDur));
          const charCount = Math.max(1, Math.round(progress * rawText.length));
          displayText = rawText.slice(0, charCount);
        }

        ctx.save();
        ctx.globalAlpha = alpha * textAlpha;
        ctx.font = `700 ${scaledFontSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.textBaseline = 'middle';

        let cy = H - 62;
        if (clip.overlay.position === 'top') cy = 54;
        if (clip.overlay.position === 'center') cy = H / 2;
        cy += shiftY;

        let cx = W / 2 + shiftX;
        if (effect === 'lower_third') {
          ctx.textAlign = 'left';
          cx = 48 + shiftX;
        } else {
          ctx.textAlign = 'center';
        }

        const metrics = ctx.measureText(displayText);
        const padX = 20;
        const padY = 12;
        const boxW = Math.min(W - 48, metrics.width + padX * 2);
        const boxH = scaledFontSize + padY * 2;

        if (textScale !== 1) {
          ctx.translate(cx, cy);
          ctx.scale(textScale, textScale);
          ctx.translate(-cx, -cy);
        }

        if (effect === 'cinematic') {
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.45, boxAlpha)})`;
          ctx.fillRect(0, cy - boxH / 2 - 4, W, boxH + 8);
          ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
        } else if (effect === 'lower_third') {
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.48, boxAlpha)})`;
          ctx.fillRect(36 + shiftX, cy - boxH / 2, boxW, boxH);
          ctx.fillStyle = accent;
          ctx.fillRect(30 + shiftX, cy - boxH / 2, 6, boxH);
        } else if (effect === 'box') {
          ctx.fillStyle = `rgba(0, 0, 0, ${boxAlpha})`;
          ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
        } else if (effect === 'shadow') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 3;
          ctx.shadowOffsetY = 4;
        } else if (effect === 'outline') {
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(4, Math.round(scaledFontSize * 0.16));
          ctx.strokeStyle = '#000000';
          ctx.strokeText(displayText, cx, cy, W - 64);
        } else if (effect === 'neon') {
          ctx.shadowColor = accent;
          ctx.shadowBlur = 20;
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(2, Math.round(scaledFontSize * 0.08));
          ctx.strokeStyle = accent;
          ctx.strokeText(displayText, cx, cy, W - 64);
        }

        ctx.fillStyle = color;
        ctx.fillText(displayText, cx, cy, W - 64);
        ctx.restore();
      }

      ctx.restore();
    };

    if (activeSegments.length === 1) {
      const seg = activeSegments[0];
      const media = mediaElementsRef.current.get(seg.clip.assetId);
      if (media) {
        drawMediaFit(media, seg.clip, currentTime - seg.effectiveStart, 1);
      }
    } else {
      // Transition between outgoing (0) and incoming (1)
      const outgoing = activeSegments[0];
      const incoming = activeSegments[1];
      const outMedia = mediaElementsRef.current.get(outgoing.clip.assetId);
      const inMedia = mediaElementsRef.current.get(incoming.clip.assetId);

      const transDur = Math.max(0.05, incoming.transitionOverlap || 0.5);
      const p = Math.min(1, Math.max(0, (currentTime - incoming.effectiveStart) / transDur));
      const smoothP = p * p * (3 - 2 * p);
      const tType: TransitionType = incoming.clip.transitionIn;

      if (outMedia) {
        const slideOutX =
          tType === 'slideleft'
            ? -W * p
            : tType === 'slideright'
              ? W * p
              : tType === 'smoothleft'
                ? -W * smoothP
                : tType === 'smoothright'
                  ? W * smoothP
                  : 0;
        const slideOutY =
          tType === 'slideup' ? -H * p : tType === 'slidedown' ? H * p : 0;
        drawMediaFit(
          outMedia,
          outgoing.clip,
          currentTime - outgoing.effectiveStart,
          1,
          undefined,
          slideOutX,
          slideOutY
        );
      }

      if (inMedia) {
        const inLocal = currentTime - incoming.effectiveStart;
        if (tType === 'wipeleft') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, (c) => {
            c.beginPath();
            c.rect(W * (1 - p), 0, W * p, H);
            c.clip();
          });
        } else if (tType === 'wiperight') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, (c) => {
            c.beginPath();
            c.rect(0, 0, W * p, H);
            c.clip();
          });
        } else if (tType === 'wipeup') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, (c) => {
            c.beginPath();
            c.rect(0, H * (1 - p), W, H * p);
            c.clip();
          });
        } else if (tType === 'wipedown') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, (c) => {
            c.beginPath();
            c.rect(0, 0, W, H * p);
            c.clip();
          });
        } else if (tType === 'slideleft') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, undefined, W * (1 - p), 0);
        } else if (tType === 'slideright') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, undefined, -W * (1 - p), 0);
        } else if (tType === 'smoothleft') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, undefined, W * (1 - smoothP), 0);
        } else if (tType === 'smoothright') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, undefined, -W * (1 - smoothP), 0);
        } else if (tType === 'slideup') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, undefined, 0, H * (1 - p));
        } else if (tType === 'slidedown') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, undefined, 0, -H * (1 - p));
        } else if (tType === 'circleopen' || tType === 'radial') {
          const maxR = Math.hypot(W / 2, H / 2);
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, (c) => {
            c.beginPath();
            c.arc(W / 2, H / 2, maxR * p, 0, Math.PI * 2);
            c.clip();
          });
        } else if (tType === 'circleclose') {
          const maxR = Math.hypot(W / 2, H / 2);
          drawMediaFit(inMedia, incoming.clip, inLocal, p, (c) => {
            c.beginPath();
            c.arc(W / 2, H / 2, Math.max(12, maxR * (1 - p * 0.4)), 0, Math.PI * 2);
            c.clip();
          });
        } else if (tType === 'horzopen') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, (c) => {
            c.beginPath();
            c.rect(W / 2 - (W * p) / 2, 0, W * p, H);
            c.clip();
          });
        } else if (tType === 'vertopen') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, (c) => {
            c.beginPath();
            c.rect(0, H / 2 - (H * p) / 2, W, H * p);
            c.clip();
          });
        } else if (tType === 'diagtl') {
          drawMediaFit(inMedia, incoming.clip, inLocal, 1, (c) => {
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(W * 2 * p, 0);
            c.lineTo(0, H * 2 * p);
            c.closePath();
            c.clip();
          });
        } else if (tType === 'fadeblack') {
          if (p < 0.5) {
            ctx.fillStyle = `rgba(0,0,0,${p * 2})`;
            ctx.fillRect(0, 0, W, H);
          } else {
            drawMediaFit(inMedia, incoming.clip, inLocal, (p - 0.5) * 2);
          }
        } else if (tType === 'fadewhite') {
          if (p < 0.5) {
            ctx.fillStyle = `rgba(255,255,255,${p * 2})`;
            ctx.fillRect(0, 0, W, H);
          } else {
            drawMediaFit(inMedia, incoming.clip, inLocal, (p - 0.5) * 2);
          }
        } else {
          // fade / dissolve / pixelize
          drawMediaFit(inMedia, incoming.clip, inLocal, p);
        }
      }
    }
  }, [segments, currentTime, aspectRatio, videoClips.length, assets]);

  return (
    <div className="flex flex-col h-full bg-[#0D0F12] border-r border-[#262B35] select-none">
      {/* Monitor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#262B35] bg-[#14171C]">
        <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
          <span className="font-medium text-[#E2E8F0]">Program Monitor</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{aspectRatio === '16:9' ? '1920x1080' : '1080x1920'}</span>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-[#0D0F12] border border-[#262B35] rounded-md">
          <button
            type="button"
            onClick={() => onAspectRatioChange('16:9')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              aspectRatio === '16:9'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            16:9 YouTube
          </button>
          <button
            type="button"
            onClick={() => onAspectRatioChange('9:16')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              aspectRatio === '9:16'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            9:16 Shorts
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0 bg-[#090B0E]">
        <div
          className={`relative flex items-center justify-center bg-black border border-[#262B35] overflow-hidden shadow-sm ${
            aspectRatio === '16:9' ? 'w-full max-w-[780px] aspect-video' : 'h-full max-h-[380px] aspect-[9/16]'
          }`}
        >
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
        </div>
      </div>

      {/* Transport Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#262B35] bg-[#14171C]">
        <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
          <span className="text-[#F8FAFC] font-medium">{formatTimecode(currentTime)}</span>
          <span className="text-[#475569]">/</span>
          <span className="text-[#94A3B8]">{formatTimecode(totalDuration)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Jump to Start"
            className="p-2 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1E232B] transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - 1 / 30))}
            title="Previous Frame"
            className="p-2 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1E232B] transition-colors"
          >
            <StepBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
            className="px-4 py-2 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition-colors flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.min(totalDuration, currentTime + 1 / 30))}
            title="Next Frame"
            className="p-2 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1E232B] transition-colors"
          >
            <StepForward className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(totalDuration)}
            title="Jump to End"
            className="p-2 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1E232B] transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSplitAtPlayhead}
            title="Split clip at playhead"
            className="px-2.5 py-1.5 rounded-md border border-[#262B35] bg-[#1B1F26] hover:bg-[#232832] text-[#E2E8F0] text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={!selectedClipId}
            title="Delete selected clip"
            className="px-2.5 py-1.5 rounded-md border border-[#262B35] bg-[#1B1F26] hover:bg-[#232832] disabled:opacity-40 disabled:pointer-events-none text-[#E2E8F0] hover:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
