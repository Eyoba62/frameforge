import type {
  AudioClip,
  EffectPreset,
  RenderProjectSpec,
  TextEffectType,
  TextOverlay,
  TextTransitionType,
  TransitionType,
  VideoClip,
  YouTubePreset,
} from '../src/types/editor.ts';

export const VIDEO_TRANSITIONS: TransitionType[] = [
  'none',
  'fade',
  'fadeblack',
  'fadewhite',
  'wipeleft',
  'wiperight',
  'wipeup',
  'wipedown',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'smoothleft',
  'smoothright',
  'circleopen',
  'circleclose',
  'horzopen',
  'vertopen',
  'dissolve',
  'radial',
  'pixelize',
  'diagtl',
];

export const VIDEO_EFFECTS: EffectPreset[] = [
  'none',
  'cinematic',
  'bw',
  'vintage',
  'vivid',
  'noir',
  'warm',
  'cool',
  'blur',
  'sharpen',
  'vignette',
];

export const TEXT_EFFECTS: TextEffectType[] = [
  'box',
  'shadow',
  'outline',
  'neon',
  'lower_third',
  'cinematic',
  'none',
];

export const TEXT_TRANSITIONS: TextTransitionType[] = [
  'none',
  'fade',
  'slide_up',
  'slide_down',
  'slide_left',
  'slide_right',
  'zoom',
  'typewriter',
];

export const YOUTUBE_PRESETS: YouTubePreset[] = [
  'youtube_1080p60',
  'youtube_1080p30',
  'youtube_4k',
  'youtube_shorts_1080x1920',
];

export const TEXT_OVERLAY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: {
    text: { type: 'string', minLength: 1, description: 'Overlay text string rendered via FFmpeg drawtext.' },
    position: { type: 'string', enum: ['bottom', 'center', 'top'], default: 'bottom' },
    fontSize: { type: 'number', minimum: 20, maximum: 120, default: 48 },
    color: { type: 'string', default: '#FFFFFF', description: 'Hex color string (#RRGGBB).' },
    bgOpacity: { type: 'number', minimum: 0, maximum: 1, default: 0.55 },
    effect: { type: 'string', enum: TEXT_EFFECTS, default: 'box' },
    accentColor: { type: 'string', default: '#3B82F6', description: 'Hex accent color for lower_third/neon.' },
    transition: { type: 'string', enum: TEXT_TRANSITIONS, default: 'none' },
    transitionDuration: { type: 'number', minimum: 0.15, maximum: 5, default: 0.5 },
  },
};

export const VIDEO_CLIP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assetId'],
  properties: {
    id: { type: 'string', description: 'Optional unique clip identifier (auto-generated if omitted).' },
    assetId: {
      type: 'string',
      minLength: 1,
      description: 'Registered asset ID (e.g. "builtin-aurora") or public HTTP/HTTPS media URL.',
    },
    name: { type: 'string', default: 'Video Clip' },
    track: { type: 'string', enum: ['V1'], default: 'V1' },
    startTime: {
      type: 'number',
      minimum: 0,
      description: 'Timeline start offset in seconds (auto-sequenced if omitted).',
    },
    duration: { type: 'number', minimum: 0.5, maximum: 3600, default: 4 },
    trimStart: { type: 'number', minimum: 0, default: 0 },
    speed: { type: 'number', minimum: 0.25, maximum: 3.0, default: 1 },
    transitionIn: { type: 'string', enum: VIDEO_TRANSITIONS, default: 'none' },
    transitionDuration: { type: 'number', minimum: 0, maximum: 5, default: 0.6 },
    effect: { type: 'string', enum: VIDEO_EFFECTS, default: 'none' },
    brightness: { type: 'number', minimum: -0.5, maximum: 0.5, default: 0 },
    contrast: { type: 'number', minimum: 0.5, maximum: 2.0, default: 1 },
    saturation: { type: 'number', minimum: 0, maximum: 2.5, default: 1 },
    volume: { type: 'number', minimum: 0, maximum: 1.5, default: 1 },
    muted: { type: 'boolean', default: false },
    overlay: TEXT_OVERLAY_JSON_SCHEMA,
  },
};

export const AUDIO_CLIP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assetId'],
  properties: {
    id: { type: 'string' },
    assetId: {
      type: 'string',
      minLength: 1,
      description: 'Registered asset ID, public URL, or "gdrive:<driveFileId>".',
    },
    name: { type: 'string', default: 'Audio Clip' },
    track: { type: 'string', enum: ['A1', 'A2'], default: 'A1' },
    startTime: { type: 'number', minimum: 0, default: 0 },
    duration: { type: 'number', minimum: 0.2, maximum: 3600, default: 4 },
    trimStart: { type: 'number', minimum: 0, default: 0 },
    volume: { type: 'number', minimum: 0, maximum: 1.5, default: 1 },
    fadeIn: { type: 'number', minimum: 0, maximum: 30, default: 0.1 },
    fadeOut: { type: 'number', minimum: 0, maximum: 30, default: 0.2 },
    muted: { type: 'boolean', default: false },
  },
};

export const INLINE_AI_CLIP_JSON_SCHEMA = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['video', 'veo', 'tts', 'music', 'lyria', 'sfx', 'drive_audio'] },
    prompt: { type: 'string' },
    text: { type: 'string' },
    voiceName: { type: 'string', enum: ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] },
    style: { type: 'string' },
    sfxPreset: { type: 'string', enum: ['whoosh', 'chime', 'riser', 'subdrop', 'click'] },
    fileId: { type: 'string', description: 'Google Drive file ID for kind="drive_audio".' },
    fileName: { type: 'string' },
    driveAccessToken: { type: 'string' },
    duration: { type: 'number', minimum: 0.25, maximum: 300 },
    aspectRatio: { type: 'string', enum: ['16:9', '9:16'] },
    resolution: { type: 'string', enum: ['360p', '720p', '1080p'] },
    transitionIn: { type: 'string', enum: VIDEO_TRANSITIONS },
    transitionDuration: { type: 'number', minimum: 0, maximum: 5 },
    effect: { type: 'string', enum: VIDEO_EFFECTS },
    overlay: TEXT_OVERLAY_JSON_SCHEMA,
    track: { type: 'string', enum: ['A1', 'A2'] },
    startTime: { type: 'number', minimum: 0 },
    volume: { type: 'number', minimum: 0, maximum: 1.5 },
  },
};

export const YOUTUBE_METADATA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    privacyStatus: { type: 'string', enum: ['private', 'unlisted', 'public'], default: 'private' },
    categoryId: { type: 'string', default: '22' },
  },
};

export const RENDER_PROJECT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'FrameForgeRenderRequest',
  type: 'object',
  properties: {
    projectName: { type: 'string', default: 'Untitled YouTube Export' },
    aspectRatio: { type: 'string', enum: ['16:9', '9:16'], default: '16:9' },
    youtubePreset: { type: 'string', enum: YOUTUBE_PRESETS, default: 'youtube_1080p60' },
    videoClips: {
      type: 'array',
      description: 'Ordered timeline video/image clips on track V1.',
      items: VIDEO_CLIP_JSON_SCHEMA,
    },
    audioClips: {
      type: 'array',
      description: 'Audio clips placed on tracks A1 or A2.',
      items: AUDIO_CLIP_JSON_SCHEMA,
    },
    inlineAiClips: {
      type: 'array',
      description: 'Optional inline AI / Drive audio items resolved before FFmpeg rendering.',
      items: INLINE_AI_CLIP_JSON_SCHEMA,
    },
    youtubeMetadata: YOUTUBE_METADATA_JSON_SCHEMA,
    driveAccessToken: { type: 'string' },
  },
  anyOf: [
    { required: ['videoClips'] },
    { required: ['inlineAiClips'] },
  ],
};

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateAndNormalizeRenderSpec(raw: unknown): {
  errors: string[];
  normalizedSpec?: RenderProjectSpec;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: ['Request body must be a JSON object.'] };
  }

  const input = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (input.aspectRatio !== undefined && input.aspectRatio !== '16:9' && input.aspectRatio !== '9:16') {
    errors.push('aspectRatio must be "16:9" or "9:16".');
  }
  if (
    input.youtubePreset !== undefined &&
    !YOUTUBE_PRESETS.includes(input.youtubePreset as YouTubePreset)
  ) {
    errors.push(`youtubePreset must be one of: ${YOUTUBE_PRESETS.join(', ')}.`);
  }

  const normalizedVideoClips: VideoClip[] = [];
  if (input.videoClips !== undefined) {
    if (!Array.isArray(input.videoClips)) {
      errors.push('videoClips must be an array.');
    } else {
      let cursor = 0;
      input.videoClips.forEach((rawClip, idx) => {
        const prefix = `videoClips[${idx}]`;
        if (!rawClip || typeof rawClip !== 'object' || Array.isArray(rawClip)) {
          errors.push(`${prefix} must be an object.`);
          return;
        }
        const c = rawClip as Record<string, unknown>;
        if (typeof c.assetId !== 'string' || !c.assetId.trim()) {
          errors.push(`${prefix}.assetId is required and must be a non-empty string.`);
        }
        if (c.track !== undefined && c.track !== 'V1') {
          errors.push(`${prefix}.track must be "V1".`);
        }
        if (c.startTime !== undefined && (!isFiniteNum(c.startTime) || c.startTime < 0)) {
          errors.push(`${prefix}.startTime must be a non-negative number.`);
        }
        if (c.duration !== undefined && (!isFiniteNum(c.duration) || c.duration < 0.5 || c.duration > 3600)) {
          errors.push(`${prefix}.duration must be between 0.5 and 3600 seconds.`);
        }
        if (c.trimStart !== undefined && (!isFiniteNum(c.trimStart) || c.trimStart < 0)) {
          errors.push(`${prefix}.trimStart must be a non-negative number.`);
        }
        if (c.speed !== undefined && (!isFiniteNum(c.speed) || c.speed < 0.25 || c.speed > 3)) {
          errors.push(`${prefix}.speed must be between 0.25 and 3.0.`);
        }
        if (
          c.transitionIn !== undefined &&
          !VIDEO_TRANSITIONS.includes(c.transitionIn as TransitionType)
        ) {
          errors.push(`${prefix}.transitionIn must be one of: ${VIDEO_TRANSITIONS.join(', ')}.`);
        }
        if (
          c.transitionDuration !== undefined &&
          (!isFiniteNum(c.transitionDuration) || c.transitionDuration < 0 || c.transitionDuration > 5)
        ) {
          errors.push(`${prefix}.transitionDuration must be between 0 and 5 seconds.`);
        }
        if (c.effect !== undefined && !VIDEO_EFFECTS.includes(c.effect as EffectPreset)) {
          errors.push(`${prefix}.effect must be one of: ${VIDEO_EFFECTS.join(', ')}.`);
        }
        if (c.brightness !== undefined && (!isFiniteNum(c.brightness) || c.brightness < -0.5 || c.brightness > 0.5)) {
          errors.push(`${prefix}.brightness must be between -0.5 and 0.5.`);
        }
        if (c.contrast !== undefined && (!isFiniteNum(c.contrast) || c.contrast < 0.5 || c.contrast > 2)) {
          errors.push(`${prefix}.contrast must be between 0.5 and 2.0.`);
        }
        if (c.saturation !== undefined && (!isFiniteNum(c.saturation) || c.saturation < 0 || c.saturation > 2.5)) {
          errors.push(`${prefix}.saturation must be between 0 and 2.5.`);
        }
        if (c.volume !== undefined && (!isFiniteNum(c.volume) || c.volume < 0 || c.volume > 1.5)) {
          errors.push(`${prefix}.volume must be between 0 and 1.5.`);
        }
        if (c.muted !== undefined && typeof c.muted !== 'boolean') {
          errors.push(`${prefix}.muted must be a boolean.`);
        }

        let normalizedOverlay: TextOverlay | undefined;
        if (c.overlay !== undefined) {
          if (!c.overlay || typeof c.overlay !== 'object' || Array.isArray(c.overlay)) {
            errors.push(`${prefix}.overlay must be an object.`);
          } else {
            const ov = c.overlay as Record<string, unknown>;
            if (typeof ov.text !== 'string' || !ov.text.trim()) {
              errors.push(`${prefix}.overlay.text is required and must be a non-empty string.`);
            }
            if (ov.position !== undefined && !['bottom', 'center', 'top'].includes(String(ov.position))) {
              errors.push(`${prefix}.overlay.position must be "bottom", "center", or "top".`);
            }
            if (ov.effect !== undefined && !TEXT_EFFECTS.includes(ov.effect as TextEffectType)) {
              errors.push(`${prefix}.overlay.effect must be one of: ${TEXT_EFFECTS.join(', ')}.`);
            }
            if (
              ov.transition !== undefined &&
              !TEXT_TRANSITIONS.includes(ov.transition as TextTransitionType)
            ) {
              errors.push(`${prefix}.overlay.transition must be one of: ${TEXT_TRANSITIONS.join(', ')}.`);
            }
            normalizedOverlay = {
              text: typeof ov.text === 'string' ? ov.text : '',
              position: (ov.position as TextOverlay['position']) || 'bottom',
              fontSize: isFiniteNum(ov.fontSize) ? ov.fontSize : 48,
              color: typeof ov.color === 'string' ? ov.color : '#FFFFFF',
              bgOpacity: isFiniteNum(ov.bgOpacity) ? ov.bgOpacity : 0.55,
              effect: (ov.effect as TextEffectType) || 'box',
              accentColor: typeof ov.accentColor === 'string' ? ov.accentColor : '#3B82F6',
              transition: (ov.transition as TextTransitionType) || 'none',
              transitionDuration: isFiniteNum(ov.transitionDuration) ? ov.transitionDuration : 0.5,
            };
          }
        }

        const duration = isFiniteNum(c.duration) ? c.duration : 4;
        const startTime = isFiniteNum(c.startTime) ? c.startTime : cursor;
        cursor = Math.max(cursor, startTime + duration);

        normalizedVideoClips.push({
          id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `vclip-${idx + 1}`,
          assetId: typeof c.assetId === 'string' ? c.assetId.trim() : '',
          name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : `Clip ${idx + 1}`,
          track: 'V1',
          startTime,
          duration,
          trimStart: isFiniteNum(c.trimStart) ? c.trimStart : 0,
          speed: isFiniteNum(c.speed) ? c.speed : 1,
          transitionIn: (c.transitionIn as TransitionType) || 'none',
          transitionDuration: isFiniteNum(c.transitionDuration) ? c.transitionDuration : 0.6,
          effect: (c.effect as EffectPreset) || 'none',
          brightness: isFiniteNum(c.brightness) ? c.brightness : 0,
          contrast: isFiniteNum(c.contrast) ? c.contrast : 1,
          saturation: isFiniteNum(c.saturation) ? c.saturation : 1,
          volume: isFiniteNum(c.volume) ? c.volume : 1,
          muted: typeof c.muted === 'boolean' ? c.muted : false,
          overlay: normalizedOverlay,
        });
      });
    }
  }

  const normalizedAudioClips: AudioClip[] = [];
  if (input.audioClips !== undefined) {
    if (!Array.isArray(input.audioClips)) {
      errors.push('audioClips must be an array.');
    } else {
      input.audioClips.forEach((rawClip, idx) => {
        const prefix = `audioClips[${idx}]`;
        if (!rawClip || typeof rawClip !== 'object' || Array.isArray(rawClip)) {
          errors.push(`${prefix} must be an object.`);
          return;
        }
        const a = rawClip as Record<string, unknown>;
        if (typeof a.assetId !== 'string' || !a.assetId.trim()) {
          errors.push(`${prefix}.assetId is required and must be a non-empty string.`);
        }
        normalizedAudioClips.push({
          id: typeof a.id === 'string' && a.id.trim() ? a.id.trim() : `aclip-${idx + 1}`,
          assetId: typeof a.assetId === 'string' ? a.assetId.trim() : '',
          name: typeof a.name === 'string' && a.name.trim() ? a.name.trim() : `Audio ${idx + 1}`,
          track: a.track === 'A2' ? 'A2' : 'A1',
          startTime: isFiniteNum(a.startTime) && a.startTime >= 0 ? a.startTime : 0,
          duration: isFiniteNum(a.duration) && a.duration > 0 ? a.duration : 4,
          trimStart: isFiniteNum(a.trimStart) && a.trimStart >= 0 ? a.trimStart : 0,
          volume: isFiniteNum(a.volume) ? Math.min(1.5, Math.max(0, a.volume)) : 1,
          fadeIn: isFiniteNum(a.fadeIn) && a.fadeIn >= 0 ? a.fadeIn : 0.1,
          fadeOut: isFiniteNum(a.fadeOut) && a.fadeOut >= 0 ? a.fadeOut : 0.2,
          muted: typeof a.muted === 'boolean' ? a.muted : false,
        });
      });
    }
  }

  if (input.inlineAiClips !== undefined && !Array.isArray(input.inlineAiClips)) {
    errors.push('inlineAiClips must be an array.');
  }

  const inlineAiClips = Array.isArray(input.inlineAiClips)
    ? (input.inlineAiClips as RenderProjectSpec['inlineAiClips'])
    : undefined;

  if (normalizedVideoClips.length === 0 && (!inlineAiClips || inlineAiClips.length === 0)) {
    errors.push('Request body must include non-empty "videoClips" or "inlineAiClips".');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    normalizedSpec: {
      projectName:
        typeof input.projectName === 'string' && input.projectName.trim()
          ? input.projectName.trim()
          : 'Untitled YouTube Export',
      aspectRatio: (input.aspectRatio as '16:9' | '9:16') || '16:9',
      youtubePreset: (input.youtubePreset as YouTubePreset) || 'youtube_1080p60',
      videoClips: normalizedVideoClips,
      audioClips: normalizedAudioClips,
      youtubeMetadata: input.youtubeMetadata as RenderProjectSpec['youtubeMetadata'],
      driveAccessToken: typeof input.driveAccessToken === 'string' ? input.driveAccessToken : undefined,
      inlineAiClips,
    },
  };
}
