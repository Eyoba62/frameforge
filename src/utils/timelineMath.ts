import type {
  EffectPreset,
  RenderProjectSpec,
  VideoClip,
  YouTubePreset,
} from '../types/editor';

export interface ComputedVideoSegment {
  clip: VideoClip;
  effectiveStart: number;
  effectiveEnd: number;
  transitionOverlap: number;
}

export function computeVideoSegments(clips: VideoClip[]): {
  segments: ComputedVideoSegment[];
  totalVideoDuration: number;
} {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const segments: ComputedVideoSegment[] = [];
  let cursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i];
    const dur = Math.max(0.5, clip.duration);
    if (i === 0) {
      segments.push({
        clip,
        effectiveStart: 0,
        effectiveEnd: dur,
        transitionOverlap: 0,
      });
      cursor = dur;
    } else {
      const prevDur = segments[i - 1].effectiveEnd - segments[i - 1].effectiveStart;
      const maxOverlap = Math.min(prevDur * 0.45, dur * 0.45);
      const overlap =
        clip.transitionIn !== 'none' && clip.transitionDuration > 0.05
          ? Math.min(maxOverlap, clip.transitionDuration)
          : 0;
      const start = Math.max(0, cursor - overlap);
      const end = start + dur;
      segments.push({
        clip,
        effectiveStart: start,
        effectiveEnd: end,
        transitionOverlap: overlap,
      });
      cursor = end;
    }
  }

  return { segments, totalVideoDuration: cursor };
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 30);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export function formatSeconds(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(2)}s`;
}

export function getCanvasFilterForClip(clip: VideoClip): string {
  const parts: string[] = [];
  let b = 1 + (clip.brightness || 0);
  let c = clip.contrast ?? 1;
  let s = clip.saturation ?? 1;

  switch (clip.effect as EffectPreset) {
    case 'cinematic':
      c *= 1.15;
      s *= 0.88;
      b *= 0.97;
      break;
    case 'bw':
      parts.push('grayscale(100%)');
      c *= 1.15;
      break;
    case 'vintage':
      parts.push('sepia(65%)');
      c *= 0.95;
      b *= 1.03;
      break;
    case 'vivid':
      s *= 1.45;
      c *= 1.12;
      break;
    case 'noir':
      parts.push('grayscale(100%)');
      c *= 1.38;
      b *= 0.93;
      break;
    case 'warm':
      parts.push('sepia(22%)');
      s *= 1.12;
      break;
    case 'cool':
      parts.push('hue-rotate(14deg)');
      s *= 1.05;
      break;
    case 'blur':
      parts.push('blur(4px)');
      break;
    case 'sharpen':
      c *= 1.12;
      break;
    case 'vignette':
    case 'none':
    default:
      break;
  }

  parts.push(`brightness(${Math.max(0.2, b).toFixed(2)})`);
  parts.push(`contrast(${Math.max(0.3, c).toFixed(2)})`);
  parts.push(`saturate(${Math.max(0, s).toFixed(2)})`);
  return parts.join(' ');
}

export function buildYoutubePresetLabel(preset: YouTubePreset): string {
  switch (preset) {
    case 'youtube_1080p60':
      return '1080p 60fps (1920x1080 · 12 Mbps)';
    case 'youtube_1080p30':
      return '1080p 30fps (1920x1080 · 8 Mbps)';
    case 'youtube_4k':
      return '4K UHD 30fps (3840x2160 · 35 Mbps)';
    case 'youtube_shorts_1080x1920':
      return 'YouTube Shorts 60fps (1080x1920)';
  }
}

export function buildInlineAiExamplePayload(): RenderProjectSpec {
  return {
    projectName: 'API Automated YouTube Video',
    aspectRatio: '16:9',
    youtubePreset: 'youtube_1080p60',
    videoClips: [],
    audioClips: [],
    inlineAiClips: [
      {
        kind: 'video',
        prompt: 'Golden horizon atmospheric dusk over modern skyline, slow cinematic zoom',
        duration: 5,
        aspectRatio: '16:9',
        resolution: '720p',
        effect: 'cinematic',
        overlay: {
          text: 'AUTOMATED YOUTUBE STUDIO',
          position: 'bottom',
          fontSize: 44,
          color: '#FFFFFF',
          bgOpacity: 0.6,
        },
      },
      {
        kind: 'tts',
        text: 'Welcome to FrameForge Studio. Every frame in this video was generated and rendered via a single Free Tier API call.',
        voiceName: 'Kore',
        style: 'Confident documentary narrator',
        track: 'A1',
        startTime: 0.3,
        volume: 1.0,
      },
      {
        kind: 'music',
        prompt: 'Warm minimalist electronic ambient underscore',
        duration: 6,
        track: 'A2',
        startTime: 0,
        volume: 0.25,
      },
      {
        kind: 'sfx',
        sfxPreset: 'whoosh',
        duration: 1.2,
        startTime: 0,
        volume: 0.65,
      },
    ],
    youtubeMetadata: {
      title: 'Automated Free-Tier YouTube Video',
      description: 'Rendered programmatically via FrameForge Studio API.',
      tags: ['automation', 'gemini-free-tier', 'youtube-api'],
      privacyStatus: 'private',
      categoryId: '28',
    },
  };
}
