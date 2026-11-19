export type MediaType = 'video' | 'image' | 'audio';

export type MediaSource =
  | 'builtin'
  | 'upload'
  | 'google-drive'
  | 'ai-video'
  | 'veo'
  | 'tts'
  | 'ai-music'
  | 'lyria'
  | 'sfx';

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  source: MediaSource;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  mimeType: string;
  prompt?: string;
  voiceName?: string;
  lyrics?: string;
  createdAt: string;
}

export type TransitionType =
  | 'none'
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'wipeleft'
  | 'wiperight'
  | 'wipeup'
  | 'wipedown'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'smoothleft'
  | 'smoothright'
  | 'circleopen'
  | 'circleclose'
  | 'horzopen'
  | 'vertopen'
  | 'dissolve'
  | 'radial'
  | 'pixelize'
  | 'diagtl';

export type EffectPreset =
  | 'none'
  | 'cinematic'
  | 'bw'
  | 'vintage'
  | 'vivid'
  | 'noir'
  | 'warm'
  | 'cool'
  | 'blur'
  | 'sharpen'
  | 'vignette';

export type TextEffectType =
  | 'box'
  | 'shadow'
  | 'outline'
  | 'neon'
  | 'lower_third'
  | 'cinematic'
  | 'none';

export type TextTransitionType =
  | 'none'
  | 'fade'
  | 'slide_up'
  | 'slide_down'
  | 'slide_left'
  | 'slide_right'
  | 'zoom'
  | 'typewriter';

export interface TextOverlay {
  text: string;
  position: 'bottom' | 'center' | 'top';
  fontSize: number;
  color: string;
  bgOpacity: number;
  effect?: TextEffectType;
  accentColor?: string;
  transition?: TextTransitionType;
  transitionDuration?: number;
}

export interface VideoClip {
  id: string;
  assetId: string;
  name: string;
  track: 'V1';
  startTime: number;
  duration: number;
  trimStart: number;
  speed: number;
  transitionIn: TransitionType;
  transitionDuration: number;
  effect: EffectPreset;
  brightness: number; // -0.5 to 0.5
  contrast: number; // 0.5 to 2.0
  saturation: number; // 0.0 to 2.5
  volume: number; // 0.0 to 1.5
  muted: boolean;
  overlay?: TextOverlay;
}

export interface AudioClip {
  id: string;
  assetId: string;
  name: string;
  track: 'A1' | 'A2';
  startTime: number;
  duration: number;
  trimStart: number;
  volume: number; // 0.0 to 1.5
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
}

export type YouTubePreset =
  | 'youtube_1080p60'
  | 'youtube_1080p30'
  | 'youtube_4k'
  | 'youtube_shorts_1080x1920';

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  privacyStatus: 'private' | 'unlisted' | 'public';
  categoryId?: string;
}

export interface InlineAiClipRequest {
  kind: 'video' | 'veo' | 'tts' | 'music' | 'lyria' | 'sfx' | 'drive_audio';
  prompt?: string;
  text?: string;
  voiceName?: string;
  style?: string;
  sfxPreset?: 'whoosh' | 'chime' | 'riser' | 'subdrop' | 'click';
  fileId?: string;
  fileName?: string;
  driveAccessToken?: string;
  duration?: number;
  aspectRatio?: '16:9' | '9:16';
  resolution?: '360p' | '720p' | '1080p';
  // Optional overrides when auto-attaching to timeline via API
  transitionIn?: TransitionType;
  transitionDuration?: number;
  effect?: EffectPreset;
  overlay?: TextOverlay;
  track?: 'A1' | 'A2';
  startTime?: number;
  volume?: number;
}

export interface RenderProjectSpec {
  projectName: string;
  aspectRatio: '16:9' | '9:16';
  youtubePreset: YouTubePreset;
  videoClips: VideoClip[];
  audioClips: AudioClip[];
  youtubeMetadata?: YouTubeMetadata;
  driveAccessToken?: string;
  // Optional headless API convenience: generate AI clips & append inline in one API call
  inlineAiClips?: InlineAiClipRequest[];
}

export interface YouTubeComplianceReport {
  videoCodec: string;
  audioCodec: string;
  pixelFormat: string;
  faststart: boolean;
  resolution: string;
  fps: number;
  audioSampleRate: number;
  audioChannels: number;
  readyForYoutubeUploadApi: boolean;
}

export interface RenderJob {
  id: string;
  projectName: string;
  status: 'queued' | 'generating_ai' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage: string;
  youtubePreset: YouTubePreset;
  aspectRatio: '16:9' | '9:16';
  outputUrl?: string;
  downloadUrl?: string;
  filename?: string;
  fileSizeBytes?: number;
  durationSec?: number;
  youtubeCompliance?: YouTubeComplianceReport;
  youtubeUploadSpec?: {
    endpoint: string;
    method: string;
    contentType: string;
    part: string;
    snippet: {
      title: string;
      description: string;
      tags: string[];
      categoryId: string;
    };
    status: {
      privacyStatus: string;
      selfDeclaredMadeForKids: boolean;
    };
  };
  error?: string;
  createdAt: string;
  completedAt?: string;
}
