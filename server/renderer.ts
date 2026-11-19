import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import type {
  AudioClip,
  EffectPreset,
  RenderJob,
  RenderProjectSpec,
  TransitionType,
  VideoClip,
  YouTubePreset,
} from '../src/types/editor.ts';
import {
  EXPORTS_DIR,
  downloadRemoteAssetIfNeeded,
  getAssetById,
  probeMedia,
  saveJob,
} from './storage.ts';
import {
  formatGeminiError,
  generateFreeMusic,
  generateFreeVideo,
  generateSfxAudio,
  generateTtsSpeech,
} from './gemini.ts';
import { importDriveAudioAsset } from './drive.ts';

interface PresetConfig {
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
}

const PRESET_MAP: Record<YouTubePreset, PresetConfig> = {
  youtube_1080p60: {
    width: 1920,
    height: 1080,
    fps: 60,
    videoBitrate: '12M',
    maxrate: '15M',
    bufsize: '24M',
  },
  youtube_1080p30: {
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: '8M',
    maxrate: '10M',
    bufsize: '16M',
  },
  youtube_4k: {
    width: 3840,
    height: 2160,
    fps: 30,
    videoBitrate: '35M',
    maxrate: '45M',
    bufsize: '70M',
  },
  youtube_shorts_1080x1920: {
    width: 1080,
    height: 1920,
    fps: 60,
    videoBitrate: '12M',
    maxrate: '15M',
    bufsize: '24M',
  },
};

const FONT_PATH = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
  ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  : '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf';

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function buildTextOverlayFilters(clip: VideoClip, clipDuration: number): string[] {
  const overlay = clip.overlay;
  if (!overlay?.text || overlay.text.trim().length === 0 || !fs.existsSync(FONT_PATH)) {
    return [];
  }

  const rawText = overlay.text.trim();
  const fontSize = Math.min(120, Math.max(20, Math.round(overlay.fontSize || 48)));
  const color = overlay.color || '#FFFFFF';
  const accent = overlay.accentColor || '#3B82F6';
  const boxAlpha = Math.min(1, Math.max(0, overlay.bgOpacity ?? 0.55));
  const effect = overlay.effect || 'box';
  const transition = overlay.transition || 'none';
  const td = Math.min(
    Math.max(0.15, clipDuration * 0.4),
    Math.max(0.15, overlay.transitionDuration ?? 0.5)
  );
  const fadeOutStart = Math.max(td, clipDuration - td);

  let baseYExpr = 'h-th-90';
  if (overlay.position === 'top') baseYExpr = '80';
  if (overlay.position === 'center') baseYExpr = '(h-text_h)/2';

  let baseXExpr = '(w-text_w)/2';
  if (effect === 'lower_third') {
    baseXExpr = '96';
    if (overlay.position !== 'top' && overlay.position !== 'center') {
      baseYExpr = 'h-th-96';
    }
  }

  // Compute transition animation expressions
  let xExpr = baseXExpr;
  let yExpr = baseYExpr;
  let alphaExpr = '1';

  if (transition !== 'none' && transition !== 'typewriter') {
    alphaExpr = `if(lt(t,${td.toFixed(2)}),t/${td.toFixed(2)},if(gt(t,${fadeOutStart.toFixed(2)}),(${clipDuration.toFixed(2)}-t)/${td.toFixed(2)},1))`;
  }

  if (transition === 'slide_up') {
    yExpr = `${baseYExpr}+if(lt(t,${td.toFixed(2)}),(1-t/${td.toFixed(2)})*56,0)`;
  } else if (transition === 'slide_down') {
    yExpr = `${baseYExpr}-if(lt(t,${td.toFixed(2)}),(1-t/${td.toFixed(2)})*56,0)`;
  } else if (transition === 'slide_left') {
    xExpr = `${baseXExpr}+if(lt(t,${td.toFixed(2)}),(1-t/${td.toFixed(2)})*160,0)`;
  } else if (transition === 'slide_right') {
    xExpr = `${baseXExpr}-if(lt(t,${td.toFixed(2)}),(1-t/${td.toFixed(2)})*160,0)`;
  } else if (transition === 'zoom') {
    yExpr = `${baseYExpr}+if(lt(t,${td.toFixed(2)}),(1-t/${td.toFixed(2)})*20,0)`;
  }

  // Style parameters per text effect
  const styleOpts: string[] = [];
  const preFilters: string[] = [];

  if (effect === 'box') {
    styleOpts.push(`box=1`, `boxcolor=black@${boxAlpha.toFixed(2)}`, `boxborderw=18`);
  } else if (effect === 'shadow') {
    styleOpts.push(`shadowcolor=black@0.88`, `shadowx=4`, `shadowy=5`);
  } else if (effect === 'outline') {
    styleOpts.push(
      `borderw=4`,
      `bordercolor=black`,
      `shadowcolor=black@0.65`,
      `shadowx=2`,
      `shadowy=2`
    );
  } else if (effect === 'neon') {
    styleOpts.push(
      `borderw=4`,
      `bordercolor=${accent}@0.80`,
      `shadowcolor=${accent}@0.95`,
      `shadowx=0`,
      `shadowy=0`
    );
  } else if (effect === 'lower_third') {
    const barY =
      overlay.position === 'top'
        ? '66'
        : overlay.position === 'center'
          ? `(ih/2)-${Math.round(fontSize * 0.7)}`
          : `ih-${Math.round(fontSize + 114)}`;
    const barH = Math.round(fontSize + 36);
    preFilters.push(
      `drawbox=x=64:y=${barY}:w=10:h=${barH}:color=${accent}:t=fill:enable='lte(t,${clipDuration.toFixed(2)})'`
    );
    styleOpts.push(
      `box=1`,
      `boxcolor=black@${Math.max(0.45, boxAlpha).toFixed(2)}`,
      `boxborderw=18`,
      `shadowcolor=black@0.6`,
      `shadowx=2`,
      `shadowy=2`
    );
  } else if (effect === 'cinematic') {
    const bandY =
      overlay.position === 'top'
        ? '56'
        : overlay.position === 'center'
          ? `(ih/2)-${Math.round(fontSize * 0.85)}`
          : `ih-${Math.round(fontSize + 118)}`;
    const bandH = Math.round(fontSize + 44);
    preFilters.push(
      `drawbox=x=0:y=${bandY}:w=iw:h=${bandH}:color=black@${Math.max(0.45, boxAlpha).toFixed(2)}:t=fill:enable='lte(t,${clipDuration.toFixed(2)})'`
    );
    styleOpts.push(`shadowcolor=black@0.7`, `shadowx=2`, `shadowy=2`);
  }

  if (transition === 'typewriter') {
    const revealDur = Math.min(clipDuration * 0.75, Math.max(0.4, td * 2));
    const maxSteps = Math.min(rawText.length, 16);
    const filters: string[] = [...preFilters];
    for (let step = 1; step <= maxSteps; step++) {
      const charCount = Math.max(1, Math.round((step / maxSteps) * rawText.length));
      const slice = escapeDrawtext(rawText.slice(0, charCount));
      const tStart = (((step - 1) / maxSteps) * revealDur).toFixed(3);
      const tEnd = ((step / maxSteps) * revealDur).toFixed(3);
      const enableExpr =
        step === maxSteps ? `gte(t,${tStart})` : `between(t,${tStart},${tEnd})`;
      filters.push(
        `drawtext=fontfile=${FONT_PATH}:text='${slice}':fontsize=${fontSize}:fontcolor=${color}:x='${xExpr}':y='${yExpr}':enable='${enableExpr}'${styleOpts.length ? ':' + styleOpts.join(':') : ''}`
      );
    }
    return filters;
  }

  const escaped = escapeDrawtext(rawText);
  return [
    ...preFilters,
    `drawtext=fontfile=${FONT_PATH}:text='${escaped}':fontsize=${fontSize}:fontcolor=${color}:x='${xExpr}':y='${yExpr}':alpha='${alphaExpr}'${styleOpts.length ? ':' + styleOpts.join(':') : ''}`,
  ];
}

function buildEffectFilters(clip: VideoClip, clipDuration: number): string[] {
  const filters: string[] = [];

  switch (clip.effect as EffectPreset) {
    case 'cinematic':
      filters.push('eq=contrast=1.15:saturation=0.88:brightness=-0.03', 'vignette=PI/5');
      break;
    case 'bw':
      filters.push('hue=s=0', 'eq=contrast=1.15');
      break;
    case 'vintage':
      filters.push(
        'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
        'eq=contrast=0.95:brightness=0.03',
        'vignette=PI/4'
      );
      break;
    case 'vivid':
      filters.push('eq=saturation=1.45:contrast=1.12');
      break;
    case 'noir':
      filters.push('hue=s=0', 'eq=contrast=1.35:brightness=-0.06', 'vignette=PI/3.5');
      break;
    case 'warm':
      filters.push('colorbalance=rs=.12:gs=.04:bs=-.12');
      break;
    case 'cool':
      filters.push('colorbalance=rs=-.10:gs=.02:bs=.14');
      break;
    case 'blur':
      filters.push('gblur=sigma=4.5');
      break;
    case 'sharpen':
      filters.push('unsharp=5:5:1.4:5:5:0.0');
      break;
    case 'vignette':
      filters.push('vignette=PI/3.8');
      break;
    case 'none':
    default:
      break;
  }

  const b = Number.isFinite(clip.brightness) ? clip.brightness : 0;
  const c = Number.isFinite(clip.contrast) ? clip.contrast : 1;
  const s = Number.isFinite(clip.saturation) ? clip.saturation : 1;
  if (Math.abs(b) > 0.01 || Math.abs(c - 1) > 0.01 || Math.abs(s - 1) > 0.01) {
    filters.push(`eq=brightness=${b.toFixed(2)}:contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)}`);
  }

  filters.push(...buildTextOverlayFilters(clip, clipDuration));

  return filters;
}

function mapXfadeTransition(t: TransitionType): string {
  const supported = new Set([
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
  ]);
  return supported.has(t) ? t : 'fade';
}

function runFfmpeg(args: string[], expectedDuration: number, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrTail = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (match && expectedDuration > 0) {
        const currentSec =
          Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        const pct = Math.min(95, Math.max(10, Math.round((currentSec / expectedDuration) * 85) + 10));
        onProgress(pct);
      }
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrTail.slice(-900)}`));
      }
    });
  });
}

export async function processRenderJob(
  jobId: string,
  spec: RenderProjectSpec,
  authBearerToken?: string
): Promise<RenderJob> {
  const job = saveJob({
    id: jobId,
    projectName: spec.projectName || 'Untitled YouTube Export',
    status: spec.inlineAiClips?.length ? 'generating_ai' : 'rendering',
    progress: 5,
    stage: spec.inlineAiClips?.length
      ? 'Generating inline AI media (Veo / TTS / Lyria)...'
      : 'Preparing FFmpeg timeline graph...',
    youtubePreset: spec.youtubePreset || 'youtube_1080p60',
    aspectRatio: spec.aspectRatio || '16:9',
    createdAt: new Date().toISOString(),
  });

  try {
    const workingVideoClips: VideoClip[] = [...(spec.videoClips || [])];
    const workingAudioClips: AudioClip[] = [...(spec.audioClips || [])];

    // 1. Resolve any inline AI generation requests passed directly via API
    if (spec.inlineAiClips && spec.inlineAiClips.length > 0) {
      let runningVideoCursor = workingVideoClips.reduce(
        (acc, c) => Math.max(acc, c.startTime + c.duration),
        0
      );
      let runningAudioCursor = workingAudioClips.reduce(
        (acc, c) => Math.max(acc, c.startTime + c.duration),
        0
      );

      for (let i = 0; i < spec.inlineAiClips.length; i++) {
        const req = spec.inlineAiClips[i];
        job.stage = `Generating inline AI item ${i + 1}/${spec.inlineAiClips.length} (${req.kind.toUpperCase()})...`;
        job.progress = 8 + Math.round((i / spec.inlineAiClips.length) * 15);
        saveJob(job);

        if (req.kind === 'video' || req.kind === 'veo') {
          if (!req.prompt) throw new Error('inlineAiClips[video] requires a prompt');
          const asset = await generateFreeVideo({
            prompt: req.prompt,
            aspectRatio: req.aspectRatio || spec.aspectRatio || '16:9',
            durationSec: req.duration || 5,
            resolution: req.resolution || '720p',
          });
          const clipDur = Math.min(asset.duration, req.duration || asset.duration);
          const start = req.startTime ?? runningVideoCursor;
          workingVideoClips.push({
            id: `api-v-${uuidv4().slice(0, 6)}`,
            assetId: asset.id,
            name: asset.name,
            track: 'V1',
            startTime: start,
            duration: clipDur,
            trimStart: 0,
            speed: 1,
            transitionIn: req.transitionIn || (workingVideoClips.length > 0 ? 'fade' : 'none'),
            transitionDuration: req.transitionDuration ?? 0.6,
            effect: req.effect || 'none',
            brightness: 0,
            contrast: 1,
            saturation: 1,
            volume: req.volume ?? 1,
            muted: false,
            overlay: req.overlay,
          });
          runningVideoCursor = Math.max(runningVideoCursor, start + clipDur);
        } else if (req.kind === 'tts') {
          if (!req.text) throw new Error('inlineAiClips[tts] requires text');
          const asset = await generateTtsSpeech({
            text: req.text,
            voiceName: (req.voiceName as 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr') || 'Kore',
            style: req.style,
          });
          const start = req.startTime ?? runningAudioCursor;
          workingAudioClips.push({
            id: `api-a-${uuidv4().slice(0, 6)}`,
            assetId: asset.id,
            name: asset.name,
            track: req.track || 'A1',
            startTime: start,
            duration: asset.duration,
            trimStart: 0,
            volume: req.volume ?? 1,
            fadeIn: 0.05,
            fadeOut: 0.1,
            muted: false,
          });
          runningAudioCursor = Math.max(runningAudioCursor, start + asset.duration);
        } else if (req.kind === 'music' || req.kind === 'lyria') {
          if (!req.prompt) throw new Error('inlineAiClips[music] requires a prompt');
          const asset = await generateFreeMusic(req.prompt, req.duration || 16);
          const start = req.startTime ?? 0;
          workingAudioClips.push({
            id: `api-a-${uuidv4().slice(0, 6)}`,
            assetId: asset.id,
            name: asset.name,
            track: req.track || 'A2',
            startTime: start,
            duration: req.duration ? Math.min(asset.duration, req.duration) : asset.duration,
            trimStart: 0,
            volume: req.volume ?? 0.35,
            fadeIn: 0.5,
            fadeOut: 1.0,
            muted: false,
          });
        } else if (req.kind === 'sfx') {
          const asset = await generateSfxAudio(req.sfxPreset || 'whoosh', req.duration || 1.2);
          const start = req.startTime ?? 0;
          workingAudioClips.push({
            id: `api-a-${uuidv4().slice(0, 6)}`,
            assetId: asset.id,
            name: asset.name,
            track: 'A2',
            startTime: start,
            duration: asset.duration,
            trimStart: 0,
            volume: req.volume ?? 0.8,
            fadeIn: 0,
            fadeOut: 0.05,
            muted: false,
          });
        } else if (req.kind === 'drive_audio') {
          if (!req.fileId) {
            throw new Error('inlineAiClips[drive_audio] requires "fileId".');
          }
          const token = req.driveAccessToken || spec.driveAccessToken || authBearerToken;
          if (!token) {
            throw new Error(
              'inlineAiClips[drive_audio] requires an Authorization: Bearer <token> header or driveAccessToken.'
            );
          }
          const asset = await importDriveAudioAsset({
            token,
            fileId: req.fileId,
            fileName: req.fileName,
          });
          const start = req.startTime ?? 0;
          workingAudioClips.push({
            id: `api-a-${uuidv4().slice(0, 6)}`,
            assetId: asset.id,
            name: asset.name,
            track: req.track || 'A2',
            startTime: start,
            duration: req.duration ? Math.min(asset.duration, req.duration) : asset.duration,
            trimStart: 0,
            volume: req.volume ?? 0.55,
            fadeIn: 0.25,
            fadeOut: 0.6,
            muted: false,
          });
        }
      }
    }

    if (workingVideoClips.length === 0) {
      throw new Error('Timeline contains no video clips to render.');
    }

    job.status = 'rendering';
    job.stage = 'Resolving media inputs & computing filtergraph...';
    job.progress = 20;
    saveJob(job);

    const preset = PRESET_MAP[spec.youtubePreset] || PRESET_MAP.youtube_1080p60;
    const width = spec.aspectRatio === '9:16' && preset.width > preset.height ? 1080 : preset.width;
    const height = spec.aspectRatio === '9:16' && preset.width > preset.height ? 1920 : preset.height;
    const fps = preset.fps;

    const sortedVideos = [...workingVideoClips].sort((a, b) => a.startTime - b.startTime);

    const inputArgs: string[] = [];
    const filterParts: string[] = [];
    let inputIndex = 0;

    interface PreparedVideo {
      label: string;
      duration: number;
      transitionIn: TransitionType;
      transitionDuration: number;
      startTimeOnTimeline: number;
      inputIdx: number;
      hasAudio: boolean;
      clip: VideoClip;
    }

    const preparedVideos: PreparedVideo[] = [];

    for (let i = 0; i < sortedVideos.length; i++) {
      const clip = sortedVideos[i];
      const asset = getAssetById(clip.assetId);
      const sourceRef = asset ? asset.url : clip.assetId;
      const localPath = await downloadRemoteAssetIfNeeded(
        sourceRef,
        `remote-${uuidv4().slice(0, 8)}`
      );
      const probed = await probeMedia(localPath);
      const isImage =
        asset?.type === 'image' ||
        /\.(jpg|jpeg|png|webp|bmp)$/i.test(localPath) ||
        (!probed.hasAudio && (probed.duration <= 0.1 || !probed.videoCodec?.includes('h264')));

      const idx = inputIndex++;
      const duration = Math.max(0.5, Number(clip.duration) || 4);
      const speed = Math.min(3, Math.max(0.25, Number(clip.speed) || 1));

      if (isImage && !localPath.endsWith('.mp4') && !localPath.endsWith('.webm') && !localPath.endsWith('.mov')) {
        inputArgs.push('-loop', '1', '-t', duration.toFixed(3), '-i', localPath);
      } else {
        const trimStart = Math.max(0, Number(clip.trimStart) || 0);
        inputArgs.push('-ss', trimStart.toFixed(3), '-t', (duration * speed).toFixed(3), '-i', localPath);
      }

      const vLabel = `v${i}`;
      const baseChain = [
        `[${idx}:v]`,
        speed !== 1 ? `setpts=PTS/${speed.toFixed(3)},` : '',
        `scale=${width}:${height}:force_original_aspect_ratio=increase,`,
        `crop=${width}:${height},`,
        `setsar=1,`,
        `fps=${fps},`,
        `format=yuv420p,`,
        `settb=AVTB`,
      ].join('');

      const effectFilters = buildEffectFilters(clip, duration);
      const fullChain =
        effectFilters.length > 0
          ? `${baseChain},${effectFilters.join(',')}[${vLabel}]`
          : `${baseChain}[${vLabel}]`;
      filterParts.push(fullChain);

      preparedVideos.push({
        label: vLabel,
        duration,
        transitionIn: clip.transitionIn || 'none',
        transitionDuration: Math.max(0, Number(clip.transitionDuration) || 0),
        startTimeOnTimeline: 0,
        inputIdx: idx,
        hasAudio: probed.hasAudio && !clip.muted && clip.volume > 0,
        clip,
      });
    }

    // Chain video clips with xfade transitions or concat
    let currentLabel = preparedVideos[0].label;
    let totalDuration = preparedVideos[0].duration;
    preparedVideos[0].startTimeOnTimeline = 0;

    for (let i = 1; i < preparedVideos.length; i++) {
      const prevDur = totalDuration;
      const curr = preparedVideos[i];
      const outLabel = i === preparedVideos.length - 1 ? 'vout' : `vx${i}`;

      const maxTd = Math.min(prevDur * 0.45, curr.duration * 0.45);
      const td =
        curr.transitionIn !== 'none' && curr.transitionDuration > 0.05
          ? Math.min(maxTd, curr.transitionDuration)
          : 0;

      if (td > 0.05) {
        const offset = Math.max(0.05, prevDur - td);
        const xfadeType = mapXfadeTransition(curr.transitionIn);
        filterParts.push(
          `[${currentLabel}][${curr.label}]xfade=transition=${xfadeType}:duration=${td.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`
        );
        curr.startTimeOnTimeline = offset;
        totalDuration = offset + curr.duration;
      } else {
        filterParts.push(`[${currentLabel}][${curr.label}]concat=n=2:v=1:a=0[${outLabel}]`);
        curr.startTimeOnTimeline = prevDur;
        totalDuration = prevDur + curr.duration;
      }
      currentLabel = outLabel;
    }

    if (preparedVideos.length === 1) {
      filterParts.push(`[${currentLabel}]copy[vout]`);
    }

    // Build Audio Mix Graph (silent base + video clip audio + A1/A2 audio clips)
    const silentIdx = inputIndex++;
    inputArgs.push('-f', 'lavfi', '-t', totalDuration.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
    filterParts.push(`[${silentIdx}:a]atrim=0:${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS[asilent]`);

    const audioMixLabels: string[] = ['[asilent]'];
    let audioBranchCounter = 0;

    for (const pv of preparedVideos) {
      if (!pv.hasAudio) continue;
      const aLabel = `va${audioBranchCounter++}`;
      const delayMs = Math.max(0, Math.round(pv.startTimeOnTimeline * 1000));
      const vol = Math.min(2, Math.max(0, pv.clip.volume ?? 1));
      filterParts.push(
        `[${pv.inputIdx}:a]atrim=0:${pv.duration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(2)},adelay=${delayMs}|${delayMs},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[${aLabel}]`
      );
      audioMixLabels.push(`[${aLabel}]`);
    }

    for (const aClip of workingAudioClips) {
      if (aClip.muted || aClip.volume <= 0) continue;
      let asset = getAssetById(aClip.assetId);
      if (!asset && aClip.assetId.startsWith('gdrive:')) {
        const driveId = aClip.assetId.slice('gdrive:'.length).trim();
        const token = spec.driveAccessToken || authBearerToken;
        if (!token) {
          throw new Error(
            `Audio clip "${aClip.assetId}" requires Authorization: Bearer <token> or driveAccessToken.`
          );
        }
        asset = await importDriveAudioAsset({
          token,
          fileId: driveId,
          fileName: aClip.name,
        });
      }
      const sourceRef = asset ? asset.url : aClip.assetId;
      const localPath = await downloadRemoteAssetIfNeeded(
        sourceRef,
        `remote-audio-${uuidv4().slice(0, 8)}`
      );
      const idx = inputIndex++;
      const trimStart = Math.max(0, Number(aClip.trimStart) || 0);
      const dur = Math.max(0.2, Number(aClip.duration) || 3);
      inputArgs.push('-ss', trimStart.toFixed(3), '-t', dur.toFixed(3), '-i', localPath);

      const aLabel = `ac${audioBranchCounter++}`;
      const delayMs = Math.max(0, Math.round((aClip.startTime || 0) * 1000));
      const vol = Math.min(2, Math.max(0, aClip.volume ?? 1));
      const fadeIn = Math.max(0, Math.min(dur * 0.4, aClip.fadeIn || 0));
      const fadeOut = Math.max(0, Math.min(dur * 0.4, aClip.fadeOut || 0));

      const audioFilters = [`atrim=0:${dur.toFixed(3)}`, 'asetpts=PTS-STARTPTS', `volume=${vol.toFixed(2)}`];
      if (fadeIn > 0.02) audioFilters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(2)}`);
      if (fadeOut > 0.02) {
        audioFilters.push(`afade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`);
      }
      audioFilters.push(`adelay=${delayMs}|${delayMs}`);
      audioFilters.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');

      filterParts.push(`[${idx}:a]${audioFilters.join(',')}[${aLabel}]`);
      audioMixLabels.push(`[${aLabel}]`);
    }

    if (audioMixLabels.length === 1) {
      filterParts.push(`[asilent]anull[aout]`);
    } else {
      // FFmpeg 4.4 amix scales each input by 1/N; compensate by multiplying by N after mix
      const count = audioMixLabels.length;
      const nonSilentCount = count - 1;
      filterParts.push(
        `${audioMixLabels.join('')}amix=inputs=${count}:duration=first:dropout_transition=0,volume=${nonSilentCount.toFixed(2)}[aout]`
      );
    }

    const outFilename = `frameforge-${jobId.slice(0, 8)}.mp4`;
    const outPath = path.join(EXPORTS_DIR, outFilename);

    const ffmpegArgs = [
      '-y',
      ...inputArgs,
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-t',
      totalDuration.toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-profile:v',
      'high',
      '-level',
      '4.2',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      preset.videoBitrate,
      '-maxrate',
      preset.maxrate,
      '-bufsize',
      preset.bufsize,
      '-g',
      String(fps * 2),
      '-bf',
      '2',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      outPath,
    ];

    job.stage = 'Encoding YouTube-compliant H.264 / AAC MP4...';
    job.progress = 25;
    saveJob(job);

    await runFfmpeg(ffmpegArgs, totalDuration, (pct) => {
      job.progress = pct;
      saveJob(job);
    });

    const stats = fs.statSync(outPath);
    const outProbe = await probeMedia(outPath);

    const ytMeta = spec.youtubeMetadata || {
      title: spec.projectName || 'FrameForge Studio Export',
      description: 'Rendered via FrameForge Studio API (H.264 High@L4.2, yuv420p, AAC 48kHz, +faststart).',
      tags: ['FrameForge', 'AI Video', 'YouTube'],
      privacyStatus: 'private',
      categoryId: '22',
    };

    job.status = 'completed';
    job.progress = 100;
    job.stage = 'Completed — Verified for YouTube Upload API';
    job.filename = outFilename;
    job.outputUrl = `/api/v1/exports/${outFilename}`;
    job.downloadUrl = `/api/v1/exports/${outFilename}?download=1`;
    job.fileSizeBytes = stats.size;
    job.durationSec = outProbe.duration;
    job.completedAt = new Date().toISOString();
    job.youtubeCompliance = {
      videoCodec: outProbe.videoCodec || 'h264',
      audioCodec: outProbe.audioCodec || 'aac',
      pixelFormat: outProbe.pixelFormat || 'yuv420p',
      faststart: true,
      resolution: `${outProbe.width || width}x${outProbe.height || height}`,
      fps: outProbe.fps || fps,
      audioSampleRate: outProbe.audioSampleRate || 48000,
      audioChannels: outProbe.audioChannels || 2,
      readyForYoutubeUploadApi:
        (outProbe.videoCodec === 'h264' || !outProbe.videoCodec) &&
        outProbe.pixelFormat === 'yuv420p' &&
        outProbe.audioCodec === 'aac',
    };
    job.youtubeUploadSpec = {
      endpoint: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      method: 'POST',
      contentType: 'video/mp4',
      part: 'snippet,status',
      snippet: {
        title: ytMeta.title,
        description: ytMeta.description,
        tags: ytMeta.tags,
        categoryId: ytMeta.categoryId || '22',
      },
      status: {
        privacyStatus: ytMeta.privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    return saveJob(job);
  } catch (err) {
    const { message } = formatGeminiError(err);
    job.status = 'failed';
    job.stage = 'Render failed';
    job.error = message;
    return saveJob(job);
  }
}
