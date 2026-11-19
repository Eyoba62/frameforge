import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { MediaAsset } from '../src/types/editor.ts';
import { GENERATED_DIR, probeMedia, registerAsset } from './storage.ts';

const execFileAsync = promisify(execFile);

const FONT_PATH = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
  ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  : '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf';

export function formatGeminiError(err: unknown): { status: number; message: string } {
  let status =
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;

  let rawMessage = err instanceof Error ? err.message : String(err || 'Gemini API error');

  for (let i = 0; i < 3; i++) {
    const trimmed = rawMessage.trim();
    if (!trimmed.startsWith('{')) break;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.error) {
        if (typeof parsed.error.code === 'number') status = parsed.error.code;
        if (typeof parsed.error.message === 'string') {
          rawMessage = parsed.error.message;
          continue;
        }
      }
      if (typeof parsed?.message === 'string') {
        rawMessage = parsed.message;
        continue;
      }
    } catch {
      break;
    }
    break;
  }

  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('limit: 0')) {
    return {
      status: 429,
      message:
        'Rate limit reached on Free Tier (429). Please wait a moment and retry.',
    };
  }

  if (status === 403 || rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('API_KEY_INVALID')) {
    return {
      status: status === 400 ? 400 : 403,
      message:
        'API key invalid or lacks permission. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMessage.split('\n')[0] || 'Gemini API request failed',
  };
}

export function getGeminiClient(apiVersion: 'v1' | 'v1beta' | 'v1alpha' = 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Add a valid Free Tier key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      apiVersion,
      timeout: 20000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Gemini] Attempt ${attempt + 1}/${maxAttempts} failed:`, msg.slice(0, 200));
      const isTransient =
        msg.includes('high demand') ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429');
      if (!isTransient || attempt === maxAttempts - 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function parseHexColor(hex: string, fallback: [number, number, number]): [number, number, number] {
  const cleaned = (hex || '').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  }
  return fallback;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function renderProceduralPlatePpm(
  filePath: string,
  width: number,
  height: number,
  topRgb: [number, number, number],
  bottomRgb: [number, number, number],
  glowRgb: [number, number, number],
  glowXNorm = 0.65,
  glowYNorm = 0.38
): void {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(width * height * 3);
  const glowCx = glowXNorm * width;
  const glowCy = glowYNorm * height;
  const maxR = Math.hypot(width, height) * 0.55;

  // Precompute subtle bokeh/light accents
  const orbs = [
    { x: 0.22 * width, y: 0.28 * height, r: width * 0.14, strength: 0.22 },
    { x: 0.78 * width, y: 0.62 * height, r: width * 0.18, strength: 0.26 },
    { x: 0.48 * width, y: 0.75 * height, r: width * 0.24, strength: 0.18 },
  ];

  let offset = 0;
  for (let y = 0; y < height; y++) {
    const ty = y / (height - 1);
    const baseR = topRgb[0] * (1 - ty) + bottomRgb[0] * ty;
    const baseG = topRgb[1] * (1 - ty) + bottomRgb[1] * ty;
    const baseB = topRgb[2] * (1 - ty) + bottomRgb[2] * ty;

    for (let x = 0; x < width; x++) {
      const dx = x - glowCx;
      const dy = y - glowCy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const glowFactor = Math.max(0, 1 - dist / maxR) ** 2.2 * 0.68;

      let r = baseR + (glowRgb[0] - baseR) * glowFactor;
      let g = baseG + (glowRgb[1] - baseG) * glowFactor;
      let b = baseB + (glowRgb[2] - baseB) * glowFactor;

      for (let k = 0; k < orbs.length; k++) {
        const orb = orbs[k];
        const odx = x - orb.x;
        const ody = y - orb.y;
        const od = odx * odx + ody * ody;
        const r2 = orb.r * orb.r;
        if (od < r2) {
          const f = (1 - od / r2) ** 2 * orb.strength;
          r += glowRgb[0] * f;
          g += glowRgb[1] * f;
          b += glowRgb[2] * f;
        }
      }

      pixels[offset++] = Math.min(255, Math.max(0, r | 0));
      pixels[offset++] = Math.min(255, Math.max(0, g | 0));
      pixels[offset++] = Math.min(255, Math.max(0, b | 0));
    }
  }

  fs.writeFileSync(filePath, Buffer.concat([header, pixels]));
}

export interface VeoRequest {
  prompt: string;
  aspectRatio?: '16:9' | '9:16';
  durationSec?: number;
  resolution?: '360p' | '720p' | '1080p';
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
}

interface DirectedScenePlan {
  headline: string;
  subheadline: string;
  topColorHex: string;
  bottomColorHex: string;
  glowColorHex: string;
  cameraMotion: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right';
  grade: 'cinematic' | 'warm' | 'cool' | 'vivid' | 'noir';
}

/**
 * 100% Free-Tier AI Video Generator:
 * Uses Free-Tier `gemini-4-hydrogen` as Scene Director + FFmpeg zoompan & color pipeline
 * to render a real H.264 MP4 clip from text prompts or optional reference keyframes.
 */
export async function generateFreeVideo(req: VeoRequest): Promise<MediaAsset> {
  const ai = getGeminiClient('v1beta');
  const clampedDuration = Math.min(15, Math.max(3, Math.round(req.durationSec ?? 5)));
  const aspectRatio = req.aspectRatio ?? '16:9';
  const resolution = req.resolution ?? '720p';

  let outW = 1280;
  let outH = 720;
  if (resolution === '1080p') {
    outW = aspectRatio === '9:16' ? 1080 : 1920;
    outH = aspectRatio === '9:16' ? 1920 : 1080;
  } else if (resolution === '360p') {
    outW = aspectRatio === '9:16' ? 360 : 640;
    outH = aspectRatio === '9:16' ? 640 : 360;
  } else {
    outW = aspectRatio === '9:16' ? 720 : 1280;
    outH = aspectRatio === '9:16' ? 1280 : 720;
  }

  // Ask Free-Tier Gemini 4 Hydrogen to direct colors, camera motion, grade, and title overlay
  const directorResponse = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Direct a short ${clampedDuration}s video scene for this prompt: "${req.prompt}".
Return a concise visual plan:
- headline: 2-5 word punchy uppercase title matching the prompt
- subheadline: 4-8 word atmospheric caption
- topColorHex: dark moody background top color hex (#RRGGBB)
- bottomColorHex: rich horizon/bottom color hex (#RRGGBB)
- glowColorHex: vibrant accent light glow color hex (#RRGGBB)
- cameraMotion: one of zoom_in, zoom_out, pan_left, pan_right
- grade: one of cinematic, warm, cool, vivid, noir`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            subheadline: { type: Type.STRING },
            topColorHex: { type: Type.STRING },
            bottomColorHex: { type: Type.STRING },
            glowColorHex: { type: Type.STRING },
            cameraMotion: { type: Type.STRING },
            grade: { type: Type.STRING },
          },
          required: [
            'headline',
            'subheadline',
            'topColorHex',
            'bottomColorHex',
            'glowColorHex',
            'cameraMotion',
            'grade',
          ],
        },
      },
    })
  );

  let plan: DirectedScenePlan = {
    headline: req.prompt.slice(0, 32).toUpperCase(),
    subheadline: 'Directed via Gemini Free Tier',
    topColorHex: '#0B132B',
    bottomColorHex: '#1C2541',
    glowColorHex: '#3A86FF',
    cameraMotion: 'zoom_in',
    grade: 'cinematic',
  };

  try {
    const parsed = JSON.parse((directorResponse.text ?? '{}').trim());
    plan = {
      headline: String(parsed.headline || plan.headline).slice(0, 42),
      subheadline: String(parsed.subheadline || plan.subheadline).slice(0, 64),
      topColorHex: String(parsed.topColorHex || plan.topColorHex),
      bottomColorHex: String(parsed.bottomColorHex || plan.bottomColorHex),
      glowColorHex: String(parsed.glowColorHex || plan.glowColorHex),
      cameraMotion: (['zoom_in', 'zoom_out', 'pan_left', 'pan_right'].includes(parsed.cameraMotion)
        ? parsed.cameraMotion
        : 'zoom_in') as DirectedScenePlan['cameraMotion'],
      grade: (['cinematic', 'warm', 'cool', 'vivid', 'noir'].includes(parsed.grade)
        ? parsed.grade
        : 'cinematic') as DirectedScenePlan['grade'],
    };
  } catch {
    // Keep structured defaults
  }

  const id = `aivid-${uuidv4().slice(0, 8)}`;
  const tempImagePath = path.join(GENERATED_DIR, `${id}-plate.ppm`);
  const refExt = req.referenceImageMimeType?.includes('png')
    ? '.png'
    : req.referenceImageMimeType?.includes('webp')
      ? '.webp'
      : '.jpg';
  const tempRefPath = path.join(GENERATED_DIR, `${id}-ref${refExt}`);
  let inputPlatePath = tempImagePath;

  if (req.referenceImageBase64) {
    fs.writeFileSync(tempRefPath, Buffer.from(req.referenceImageBase64, 'base64'));
    inputPlatePath = tempRefPath;
  } else {
    renderProceduralPlatePpm(
      tempImagePath,
      outW,
      outH,
      parseHexColor(plan.topColorHex, [11, 19, 43]),
      parseHexColor(plan.bottomColorHex, [28, 37, 65]),
      parseHexColor(plan.glowColorHex, [58, 134, 255])
    );
  }

  const fps = 30;
  const totalFrames = clampedDuration * fps;
  let zoomExpr = `zoompan=z='min(zoom+0.0014,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${outW}x${outH}:fps=${fps}`;
  if (plan.cameraMotion === 'zoom_out') {
    zoomExpr = `zoompan=z='if(lte(zoom,1.0),1.24,max(1.001,zoom-0.0014))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${outW}x${outH}:fps=${fps}`;
  } else if (plan.cameraMotion === 'pan_right') {
    zoomExpr = `zoompan=z='1.18':x='(iw-iw/zoom)*on/${totalFrames}':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${outW}x${outH}:fps=${fps}`;
  } else if (plan.cameraMotion === 'pan_left') {
    zoomExpr = `zoompan=z='1.18':x='(iw-iw/zoom)*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${outW}x${outH}:fps=${fps}`;
  }

  const gradeFilters: string[] = [];
  if (plan.grade === 'cinematic') gradeFilters.push('eq=contrast=1.12:saturation=0.95', 'vignette=PI/5');
  else if (plan.grade === 'warm') gradeFilters.push('colorbalance=rs=.10:gs=.04:bs=-.10', 'vignette=PI/5');
  else if (plan.grade === 'cool') gradeFilters.push('colorbalance=rs=-.08:gs=.02:bs=.12', 'vignette=PI/5');
  else if (plan.grade === 'vivid') gradeFilters.push('eq=saturation=1.35:contrast=1.10');
  else if (plan.grade === 'noir') gradeFilters.push('hue=s=0', 'eq=contrast=1.32', 'vignette=PI/3.5');

  const drawFilters: string[] = [];
  if (!req.referenceImageBase64 && fs.existsSync(FONT_PATH)) {
    const titleSize = Math.max(24, Math.round(outW * 0.038));
    const subSize = Math.max(16, Math.round(outW * 0.02));
    drawFilters.push(
      `drawtext=fontfile=${FONT_PATH}:text='${escapeDrawtext(plan.headline)}':fontsize=${titleSize}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-${Math.round(subSize * 0.9)}:shadowcolor=black@0.65:shadowx=2:shadowy=2`
    );
    drawFilters.push(
      `drawtext=fontfile=${FONT_PATH}:text='${escapeDrawtext(plan.subheadline)}':fontsize=${subSize}:fontcolor=#CBD5E1:x=(w-text_w)/2:y=(h-text_h)/2+${Math.round(titleSize * 0.8)}:shadowcolor=black@0.65:shadowx=1:shadowy=1`
    );
  }

  const vfChain = [
    `scale=${outW * 2}:${outH * 2}:force_original_aspect_ratio=increase`,
    `crop=${outW * 2}:${outH * 2}`,
    zoomExpr,
    ...gradeFilters,
    ...drawFilters,
    'fade=t=in:st=0:d=0.4',
    `fade=t=out:st=${Math.max(0.5, clampedDuration - 0.4).toFixed(2)}:d=0.4`,
    'format=yuv420p',
  ].join(',');

  const outFilename = `${id}.mp4`;
  const outPath = path.join(GENERATED_DIR, outFilename);

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputPlatePath,
      '-vf',
      vfChain,
      '-t',
      String(clampedDuration),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outPath,
    ]);
  } finally {
    if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
    if (fs.existsSync(tempRefPath)) fs.unlinkSync(tempRefPath);
  }

  const probed = await probeMedia(outPath);
  const asset: MediaAsset = {
    id,
    name: `AI Video: ${req.prompt.slice(0, 26)}${req.prompt.length > 26 ? '...' : ''}.mp4`,
    type: 'video',
    source: 'ai-video',
    url: `/media/generated/${outFilename}`,
    duration: probed.duration || clampedDuration,
    width: probed.width ?? outW,
    height: probed.height ?? outH,
    mimeType: 'video/mp4',
    prompt: req.prompt,
    createdAt: new Date().toISOString(),
  };

  return registerAsset(asset);
}

// Keep alias so existing callers of /api/v1/ai/veo run smoothly on Free Tier
export async function generateVeoVideo(req: VeoRequest): Promise<MediaAsset> {
  return generateFreeVideo(req);
}

export interface TtsRequest {
  text: string;
  mode?: 'single' | 'dual';
  voiceName?: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  style?: string;
  speaker1Name?: string;
  speaker1Voice?: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  speaker1Style?: string;
  speaker2Name?: string;
  speaker2Voice?: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  speaker2Style?: string;
  text2?: string;
}

export async function generateTtsSpeech(req: TtsRequest): Promise<MediaAsset> {
  const ai = getGeminiClient('v1beta');
  const mode = req.mode ?? 'single';
  let base64Audio: string | undefined;

  const text2Trimmed = req.text2?.trim() || '';

  if (mode === 'dual' && text2Trimmed) {
    const s1 = req.speaker1Name || 'Alex';
    const s2 = req.speaker2Name || 'Sam';
    const interaction = await withGeminiRetry(() =>
      ai.interactions.create({
        api_version: 'v1beta',
        model: 'gemini-3.8-flash-tts',
        input: [
          {
            type: 'text',
            text: `${s1}: ${req.text.trim()}`,
            annotations: [
              {
                type: 'speech_metadata',
                speaker: s1,
                style: req.speaker1Style || 'Clear, expressive host',
              },
            ],
          },
          {
            type: 'text',
            text: `${s2}: ${text2Trimmed}`,
            annotations: [
              {
                type: 'speech_metadata',
                speaker: s2,
                style: req.speaker2Style || 'Engaged, articulate co-host',
              },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: {
            speakers: [
              {
                speaker: s1,
                voice: req.speaker1Voice || 'Puck',
              },
              {
                speaker: s2,
                voice: req.speaker2Voice || 'Kore',
              },
            ],
          },
        },
      })
    );
    base64Audio = interaction.output_audio?.data;
  } else {
    const interaction = await withGeminiRetry(() =>
      ai.interactions.create({
        api_version: 'v1beta',
        model: 'gemini-3.8-flash-lite-tts',
        input: [
          {
            type: 'text',
            text: req.text.trim(),
            ...(req.style?.trim()
              ? {
                  annotations: [
                    {
                      type: 'speech_metadata' as const,
                      style: req.style.trim(),
                    },
                  ],
                }
              : {}),
          },
        ],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [
            {
              language: 'en-US',
              voice: req.voiceName || 'Kore',
            },
          ],
        },
      })
    );
    base64Audio = interaction.output_audio?.data;
  }

  if (!base64Audio) {
    throw new Error('Gemini TTS completed without returning audio data.');
  }

  const wavBuffer = Buffer.from(base64Audio, 'base64');
  const id = `tts-${uuidv4().slice(0, 8)}`;
  const filename = `${id}.wav`;
  const filePath = path.join(GENERATED_DIR, filename);
  fs.writeFileSync(filePath, wavBuffer);

  const probed = await probeMedia(filePath);
  const voiceLabel =
    mode === 'dual' && req.text2?.trim()
      ? `${req.speaker1Voice || 'Puck'}+${req.speaker2Voice || 'Kore'}`
      : req.voiceName || 'Kore';
  const asset: MediaAsset = {
    id,
    name: `TTS (${voiceLabel}): ${req.text.slice(0, 24)}${req.text.length > 24 ? '...' : ''}.wav`,
    type: 'audio',
    source: 'tts',
    url: `/media/generated/${filename}`,
    duration: probed.duration || 3,
    mimeType: 'audio/wav',
    prompt: req.text,
    voiceName: voiceLabel,
    createdAt: new Date().toISOString(),
  };

  return registerAsset(asset);
}

function buildWavHeader(dataSize: number, sampleRate = 48000, channels = 2, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

/**
 * 100% Free-Tier AI Music / Soundtrack Synthesizer:
 * Uses Free-Tier `gemini-4-hydrogen` to compose chord progressions, BPM, and bassline,
 * then synthesizes a stereo 48kHz WAV soundtrack in pure DSP.
 */
export async function generateFreeMusic(prompt: string, durationSec = 16): Promise<MediaAsset> {
  const ai = getGeminiClient('v1beta');
  const clampedDur = Math.min(30, Math.max(6, Math.round(durationSec)));

  const musicResp = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Compose a 4-chord musical background soundtrack specification for: "${prompt}".
Return:
- trackTitle: short 2-4 word title
- bpm: integer between 72 and 130
- style: one of ambient, pulse, cinematic, lofi
- bassNotes: array of exactly 4 root frequencies in Hz between 55 and 130
- chords: array of 4 chords, each an array of 3 frequencies in Hz between 180 and 540`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            trackTitle: { type: Type.STRING },
            bpm: { type: Type.INTEGER },
            style: { type: Type.STRING },
            bassNotes: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
            },
            chords: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
              },
            },
          },
          required: ['trackTitle', 'bpm', 'style', 'bassNotes', 'chords'],
        },
      },
    })
  );

  let bpm = 96;
  let style = 'ambient';
  let trackTitle = 'Studio Score';
  let bassNotes = [110, 87.31, 98, 82.41];
  let chords = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
    [164.81, 196, 246.94],
  ];

  try {
    const parsed = JSON.parse((musicResp.text ?? '{}').trim());
    if (typeof parsed.bpm === 'number' && parsed.bpm >= 60 && parsed.bpm <= 150) {
      bpm = Math.round(parsed.bpm);
    }
    if (typeof parsed.style === 'string') style = parsed.style;
    if (typeof parsed.trackTitle === 'string' && parsed.trackTitle.trim()) {
      trackTitle = parsed.trackTitle.trim().slice(0, 30);
    }
    if (Array.isArray(parsed.bassNotes) && parsed.bassNotes.length === 4) {
      bassNotes = parsed.bassNotes.map((n: number) => Math.min(180, Math.max(45, Number(n) || 98)));
    }
    if (
      Array.isArray(parsed.chords) &&
      parsed.chords.length === 4 &&
      parsed.chords.every((c: unknown) => Array.isArray(c) && c.length >= 3)
    ) {
      chords = parsed.chords.map((c: number[]) =>
        c.slice(0, 3).map((f) => Math.min(720, Math.max(130, Number(f) || 261.63)))
      );
    }
  } catch {
    // Keep harmonic fallback
  }

  const sampleRate = 48000;
  const totalSamples = clampedDur * sampleRate;
  const pcm = Buffer.alloc(totalSamples * 4); // stereo 16-bit
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;
  const twoPi = Math.PI * 2;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barDur) % 4;
    const barPos = (t % barDur) / barDur;
    const beatPos = (t % beatDur) / beatDur;

    // Smooth bar crossfade envelope
    const barEnv = Math.min(1, barPos / 0.12) * Math.min(1, (1 - barPos) / 0.12);
    const masterFade = Math.min(1, t / 0.4) * Math.min(1, (clampedDur - t) / 0.6);

    const rootFreq = bassNotes[barIdx];
    const chord = chords[barIdx];

    // Warm sub bass + pulse
    const bassEnv = style === 'pulse' ? Math.exp(-beatPos * 2.4) : 0.75;
    const bass = Math.sin(twoPi * rootFreq * t) * 0.28 * bassEnv;

    // Detuned stereo chord pads
    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c++) {
      const freq = chord[c];
      const shimmer = 1 + (style === 'pulse' ? 0.18 * Math.sin(twoPi * (bpm / 60) * t) : 0);
      padL += Math.sin(twoPi * (freq * 0.998) * t) * 0.11 * shimmer;
      padR += Math.sin(twoPi * (freq * 1.002) * t) * 0.11 * shimmer;
      // Soft octave overtone
      padL += Math.sin(twoPi * (freq * 2) * t) * 0.025;
      padR += Math.sin(twoPi * (freq * 2) * t) * 0.025;
    }

    const leftSample = Math.max(-0.92, Math.min(0.92, (bass + padL * barEnv) * masterFade));
    const rightSample = Math.max(-0.92, Math.min(0.92, (bass + padR * barEnv) * masterFade));

    pcm.writeInt16LE((leftSample * 32767) | 0, i * 4);
    pcm.writeInt16LE((rightSample * 32767) | 0, i * 4 + 2);
  }

  const wavBuffer = Buffer.concat([buildWavHeader(pcm.length, sampleRate, 2, 16), pcm]);
  const id = `music-${uuidv4().slice(0, 8)}`;
  const filename = `${id}.wav`;
  const filePath = path.join(GENERATED_DIR, filename);
  fs.writeFileSync(filePath, wavBuffer);

  const probed = await probeMedia(filePath);
  const asset: MediaAsset = {
    id,
    name: `AI Music (${bpm} BPM): ${trackTitle}.wav`,
    type: 'audio',
    source: 'ai-music',
    url: `/media/generated/${filename}`,
    duration: probed.duration || clampedDur,
    mimeType: 'audio/wav',
    prompt,
    createdAt: new Date().toISOString(),
  };

  return registerAsset(asset);
}

// Keep alias so existing /api/v1/ai/music and inlineAiClips run on Free Tier
export async function generateLyriaMusic(prompt: string): Promise<MediaAsset> {
  return generateFreeMusic(prompt);
}

export interface ApiCodeGenRequest {
  goal: string;
  language: 'node' | 'python' | 'curl' | 'apps_script';
  baseUrl: string;
  includeYoutubeUpload?: boolean;
}

export interface ApiCodeGenResult {
  title: string;
  instructions: string[];
  code: string;
}

export function buildAppsScriptTemplate(baseUrl: string): string {
  return `/**
 * FrameForge Studio - Google Apps Script (Code.gs)
 * Paste this file into https://script.google.com -> Code.gs
 *
 * Setup in script.google.com:
 * 1. Click "Services (+)" in the left sidebar and add "YouTube Data API v3" (identifier: YouTube).
 * 2. Ensure FRAMEFORGE_BASE_URL below points to your publicly shared/deployed FrameForge App URL.
 * 3. Select a function in the top toolbar and click Run:
 *    - listDriveAudioFiles()                -> Lists audio files in your Google Drive
 *    - renderWithDriveAudioAndUpload()      -> Uses Drive audio + AI video -> uploads to YouTube
 *    - renderAndUploadToYouTube()           -> Uses AI video + TTS + music -> uploads to YouTube
 */

const FRAMEFORGE_BASE_URL = '${baseUrl}';

/**
 * Lists audio files in your Google Drive using DriveApp (triggers Drive OAuth scope automatically)
 * and logs their File IDs and names in the Apps Script Execution Log.
 */
function listDriveAudioFiles() {
  const files = DriveApp.searchFiles(
    "trashed = false and (mimeType contains 'audio/' or title contains '.mp3' or title contains '.wav' or title contains '.m4a')"
  );
  const results = [];
  while (files.hasNext() && results.length < 25) {
    const f = files.next();
    results.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType() });
    Logger.log(f.getId() + ' | ' + f.getName() + ' (' + f.getMimeType() + ')');
  }
  if (results.length === 0) {
    Logger.log('No audio files found in Google Drive.');
  }
  return results;
}

/**
 * Renders a YouTube MP4 using an audio file from Google Drive + AI Video + Text Overlay,
 * then uploads the exported MP4 directly to YouTube via YouTube.Videos.insert.
 * Pass a specific Drive File ID, or leave blank to auto-pick your newest Drive audio file.
 */
function renderWithDriveAudioAndUpload(optionalDriveFileId) {
  let fileId = optionalDriveFileId;
  let fileName = '';

  if (!fileId) {
    const found = listDriveAudioFiles();
    if (!found.length) {
      throw new Error('No audio files found in Google Drive. Upload an MP3/WAV/M4A to Drive first.');
    }
    fileId = found[0].id;
    fileName = found[0].name;
  } else {
    // Accessing DriveApp guarantees ScriptApp.getOAuthToken() carries Drive scope
    fileName = DriveApp.getFileById(fileId).getName();
  }

  Logger.log('Using Google Drive audio: ' + fileName + ' (' + fileId + ')');

  const oauthToken = ScriptApp.getOAuthToken();
  const payload = {
    projectName: 'Apps Script Drive Audio Video',
    aspectRatio: '16:9',
    youtubePreset: 'youtube_1080p30',
    inlineAiClips: [
      {
        kind: 'video',
        prompt: 'Cinematic sunrise over misty alpine peaks, golden light',
        duration: 5,
        effect: 'cinematic',
        transitionIn: 'fade',
        overlay: {
          text: fileName.replace(/\\.[^.]+$/, '').toUpperCase(),
          position: 'bottom',
          fontSize: 44,
          color: '#FFFFFF',
          accentColor: '#2563EB',
          bgOpacity: 0.65,
          effect: 'lower_third',
          transition: 'slide_up',
          transitionDuration: 0.5
        }
      },
      {
        kind: 'drive_audio',
        fileId: fileId,
        fileName: fileName,
        track: 'A2',
        startTime: 0,
        volume: 0.85
      }
    ],
    youtubeMetadata: {
      title: 'FrameForge + Google Drive Audio: ' + fileName,
      description: 'Rendered via FrameForge Studio API using audio imported from Google Drive.',
      tags: ['AppsScript', 'GoogleDrive', 'FrameForge'],
      privacyStatus: 'private',
      categoryId: '22'
    }
  };

  // Pass ScriptApp.getOAuthToken() so FrameForge can fetch the Drive audio during render
  const job = dispatchAndWaitForRender_(payload, oauthToken);
  return uploadRenderedJobToYouTube_(job, payload.youtubeMetadata);
}

function renderAndUploadToYouTube() {
  const payload = {
    projectName: 'Apps Script YouTube Render',
    aspectRatio: '16:9',
    youtubePreset: 'youtube_1080p30',
    inlineAiClips: [
      {
        kind: 'video',
        prompt: 'Cinematic sunrise over misty alpine peaks, golden light',
        duration: 5,
        effect: 'cinematic',
        transitionIn: 'fade',
        overlay: {
          text: 'AUTOMATED VIA CODE.GS',
          position: 'bottom',
          fontSize: 44,
          color: '#FFFFFF',
          accentColor: '#2563EB',
          bgOpacity: 0.65,
          effect: 'lower_third',
          transition: 'slide_up',
          transitionDuration: 0.5
        }
      },
      {
        kind: 'tts',
        text: 'This YouTube video was generated and uploaded automatically from Google Apps Script.',
        voiceName: 'Kore',
        style: 'Clear, upbeat YouTube presenter',
        track: 'A1',
        startTime: 0.2
      },
      {
        kind: 'music',
        prompt: 'Warm minimalist electronic ambient soundtrack',
        duration: 7,
        track: 'A2',
        startTime: 0,
        volume: 0.32
      },
      {
        kind: 'sfx',
        sfxPreset: 'whoosh',
        startTime: 0,
        volume: 0.7
      }
    ],
    youtubeMetadata: {
      title: 'FrameForge Studio + Google Apps Script Demo',
      description: 'Rendered via FrameForge REST API and uploaded from Code.gs.',
      tags: ['AppsScript', 'YouTubeAPI', 'FrameForge'],
      privacyStatus: 'private',
      categoryId: '22'
    }
  };

  const job = dispatchAndWaitForRender_(payload);
  return uploadRenderedJobToYouTube_(job, payload.youtubeMetadata);
}

function renderMp4Only() {
  const payload = {
    projectName: 'Apps Script MP4 Only',
    aspectRatio: '16:9',
    youtubePreset: 'youtube_1080p30',
    inlineAiClips: [
      { kind: 'video', prompt: 'Clean studio technology backdrop', duration: 4, effect: 'cinematic' },
      { kind: 'tts', text: 'Your MP4 is ready for download.', voiceName: 'Kore', track: 'A1', startTime: 0.2 }
    ]
  };
  const job = dispatchAndWaitForRender_(payload);
  Logger.log('Download URL: ' + FRAMEFORGE_BASE_URL + job.downloadUrl);
  return job;
}

function uploadRenderedJobToYouTube_(job, fallbackMeta) {
  Logger.log('Render completed: ' + job.filename + ' (' + job.fileSizeBytes + ' bytes)');
  const mp4Response = UrlFetchApp.fetch(FRAMEFORGE_BASE_URL + job.downloadUrl, {
    muteHttpExceptions: true
  });
  if (mp4Response.getResponseCode() !== 200) {
    throw new Error('Failed to download MP4: HTTP ' + mp4Response.getResponseCode());
  }
  const mp4Blob = mp4Response.getBlob().setName(job.filename || 'frameforge-export.mp4');

  const spec = job.youtubeUploadSpec || {
    snippet: fallbackMeta,
    status: { privacyStatus: 'private', selfDeclaredMadeForKids: false }
  };

  const uploadedVideo = YouTube.Videos.insert(
    { snippet: spec.snippet, status: spec.status },
    'snippet,status',
    mp4Blob
  );

  Logger.log('Uploaded to YouTube! Video ID: ' + uploadedVideo.id);
  Logger.log('Watch URL: https://www.youtube.com/watch?v=' + uploadedVideo.id);
  return uploadedVideo;
}

function dispatchAndWaitForRender_(payload, optionalBearerToken) {
  const headers = optionalBearerToken
    ? { Authorization: 'Bearer ' + optionalBearerToken }
    : {};

  const startRes = UrlFetchApp.fetch(FRAMEFORGE_BASE_URL + '/api/v1/render', {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = startRes.getResponseCode();
  const text = startRes.getContentText();
  if (code < 200 || code >= 300 || text.trim().charAt(0) === '<') {
    throw new Error(
      'Render dispatch failed (HTTP ' + code + '). Verify FRAMEFORGE_BASE_URL is publicly accessible: ' + text.slice(0, 300)
    );
  }

  let job = JSON.parse(text).job;
  const maxPolls = 45;
  for (let i = 0; i < maxPolls; i++) {
    if (job.status === 'completed') return job;
    if (job.status === 'failed') {
      throw new Error('FrameForge render failed: ' + (job.error || job.stage));
    }
    Utilities.sleep(3000);
    const pollRes = UrlFetchApp.fetch(FRAMEFORGE_BASE_URL + '/api/v1/jobs/' + job.id, {
      muteHttpExceptions: true
    });
    job = JSON.parse(pollRes.getContentText()).job;
  }

  throw new Error('Timed out waiting for FrameForge render job ' + job.id);
}
`;
}

export async function generateApiCodeAndInstructions(
  req: ApiCodeGenRequest
): Promise<ApiCodeGenResult> {
  const ai = getGeminiClient('v1beta');
  const langLabel =
    req.language === 'apps_script'
      ? 'Google Apps Script (Code.gs for script.google.com using UrlFetchApp, DriveApp, ScriptApp.getOAuthToken(), Utilities.sleep, Logger.log, and YouTube.Videos.insert)'
      : req.language === 'python'
        ? 'Python (requests)'
        : req.language === 'curl'
          ? 'Bash + cURL'
          : 'Node.js (fetch)';

  const appsScriptRules =
    req.language === 'apps_script'
      ? `
Special rules for Google Apps Script (Code.gs in script.google.com):
- Use V8 Apps Script syntax with top-level function declarations (e.g. function renderWithDriveAudioAndUpload()).
- Use UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true }).
- Prefer async dispatch (POST /api/v1/render without ?wait=true) + polling GET /api/v1/jobs/:id with Utilities.sleep(3000) to avoid UrlFetchApp's 60-second socket timeout.
- When accessing Google Drive audio from Code.gs: call DriveApp.searchFiles(...) or DriveApp.getFileById(fileId) so Apps Script automatically grants Drive scope, and pass headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } to GET /api/v1/drive/files, POST /api/v1/drive/import, or POST /api/v1/render (with inlineAiClips kind: "drive_audio").
- Download the MP4 via UrlFetchApp.fetch(BASE_URL + job.downloadUrl).getBlob().setName(job.filename || 'export.mp4').
- If uploading to YouTube, call YouTube.Videos.insert({ snippet: job.youtubeUploadSpec.snippet, status: job.youtubeUploadSpec.status }, 'snippet,status', mp4Blob) and explain in instructions how to enable "YouTube Data API v3" under Services (+) in script.google.com.`
      : '';

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `You are an expert API documentation engineer for FrameForge Studio.
Base URL: ${req.baseUrl}
Authentication note: FrameForge Studio does NOT require a FRAMEFORGE_API_KEY or X-API-Key header. Only send Authorization: Bearer <google_oauth_token> when accessing Google Drive endpoints (/api/v1/drive/* or inline drive_audio).

Available Free-Tier REST endpoints on this server:
1. POST ${req.baseUrl}/api/v1/ai/video  body: { "prompt": string, "aspectRatio": "16:9"|"9:16", "durationSec": 3..15, "resolution": "360p"|"720p"|"1080p" } -> returns { asset: { id, url, duration } }
2. POST ${req.baseUrl}/api/v1/ai/tts    body: { "mode": "single"|"dual", "text": string, "voiceName": "Kore"|"Puck"|"Charon"|"Fenrir"|"Zephyr", "style": string } -> returns { asset: { id, url, duration } }
3. POST ${req.baseUrl}/api/v1/ai/music  body: { "prompt": string, "durationSec": 6..30 } -> returns { asset: { id, url, duration } }
4. POST ${req.baseUrl}/api/v1/audio/sfx body: { "preset": "whoosh"|"chime"|"riser"|"subdrop"|"click", "durationSec": number } -> returns { asset: { id, url, duration } }
5. GET  ${req.baseUrl}/api/v1/drive/files?q=<optional_search>  headers: { "Authorization": "Bearer <google_oauth_token>" } -> returns { files: [{ id, name, mimeType, size }] }
6. POST ${req.baseUrl}/api/v1/drive/import  headers: { "Authorization": "Bearer <google_oauth_token>" }  body: { "fileId": string, "fileName"?: string } -> returns { asset: { id, url, duration } }
7. POST ${req.baseUrl}/api/v1/render  (supports ?wait=true or async job polling via GET /api/v1/jobs/:id) body: {
   "projectName": string,
   "aspectRatio": "16:9"|"9:16",
   "youtubePreset": "youtube_1080p60"|"youtube_1080p30"|"youtube_4k"|"youtube_shorts_1080x1920",
   "videoClips": [
     { "id": "v1", "assetId": "<asset_id_or_https_url>", "name": "Scene 1", "track": "V1", "startTime": 0, "duration": 5, "trimStart": 0, "speed": 1, "transitionIn": "none|fade|fadeblack|wipeleft|dissolve|...", "transitionDuration": 0.6, "effect": "none|cinematic|bw|vintage|vivid|noir|warm|cool|blur|sharpen|vignette", "brightness": 0, "contrast": 1, "saturation": 1, "volume": 1, "muted": false, "overlay": { "text": "...", "position": "bottom|center|top", "fontSize": 48, "color": "#FFFFFF", "accentColor": "#3B82F6", "bgOpacity": 0.55, "effect": "box|shadow|outline|neon|lower_third|cinematic|none", "transition": "none|fade|slide_up|slide_down|slide_left|slide_right|zoom|typewriter", "transitionDuration": 0.5 } }
   ], // optional if inlineAiClips provided; assetId is required per clip
   "audioClips": [
     { "id": "a1", "assetId": "<asset_id_url_or_gdrive:fileId>", "track": "A1|A2", "startTime": 0, "duration": 5, "trimStart": 0, "volume": 1, "fadeIn": 0.1, "fadeOut": 0.2, "muted": false }
   ],
   "inlineAiClips": [
     { "kind": "video", "prompt": "...", "duration": 5, "effect": "cinematic", "transitionIn": "fade", "overlay": { "text": "...", "position": "bottom", "fontSize": 44, "color": "#FFFFFF", "accentColor": "#2563EB", "bgOpacity": 0.65, "effect": "lower_third", "transition": "slide_up", "transitionDuration": 0.5 } },
     { "kind": "tts", "text": "...", "voiceName": "Kore", "track": "A1", "startTime": 0.2 },
     { "kind": "music", "prompt": "...", "duration": 8, "track": "A2", "startTime": 0, "volume": 0.35 },
     { "kind": "sfx", "sfxPreset": "whoosh", "startTime": 0, "volume": 0.7 },
     { "kind": "drive_audio", "fileId": "<google_drive_file_id>", "track": "A2", "startTime": 0, "volume": 0.6 }
   ],
   "youtubeMetadata": { "title": "...", "description": "...", "tags": ["..."], "privacyStatus": "private", "categoryId": "22" }
} -> returns { job: { id, status, downloadUrl, youtubeCompliance, youtubeUploadSpec } }
8. GET ${req.baseUrl}/api/v1/jobs/:id -> returns { job }
9. GET ${req.baseUrl}/api/v1/exports/:filename?download=1 -> downloads the YouTube-ready H.264/AAC MP4.
10. GET ${req.baseUrl}/api/v1/schema -> returns JSON Schemas for videoClips, audioClips, inlineAiClips, and renderRequest.
${appsScriptRules}

User's automation goal: "${req.goal}"
Target language: ${langLabel}
Include YouTube Upload API v3 upload step: ${req.includeYoutubeUpload !== false ? 'Yes' : 'No'}

Generate:
- title: short title for this integration
- instructions: 4 to 6 crisp, numbered-style step-by-step instructions (plain sentences, no markdown prefixes)
- code: complete, runnable, well-formatted ${langLabel} code using the exact URLs and payload fields above (do NOT invent any FRAMEFORGE_API_KEY variable).`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            instructions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            code: { type: Type.STRING },
          },
          required: ['title', 'instructions', 'code'],
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    title: String(parsed.title || 'FrameForge API Automation'),
    instructions: Array.isArray(parsed.instructions)
      ? parsed.instructions.map((s: unknown) => String(s))
      : ['Send a POST request to /api/v1/render and download the resulting MP4.'],
    code: String(parsed.code || ''),
  };
}

export type SfxPreset = 'whoosh' | 'chime' | 'riser' | 'subdrop' | 'click';

export async function generateSfxAudio(preset: SfxPreset, durationSec = 1.5): Promise<MediaAsset> {
  const d = Math.min(8, Math.max(0.25, durationSec));
  const id = `sfx-${uuidv4().slice(0, 8)}`;
  const filename = `${id}.wav`;
  const filePath = path.join(GENERATED_DIR, filename);

  let filterInput = '';
  let label = 'SFX';

  switch (preset) {
    case 'whoosh':
      label = 'Transition Whoosh';
      filterInput = `anoisesrc=color=pink:duration=${d}:sample_rate=48000,bandpass=f=700:width_type=h:w=900,afade=t=in:st=0:d=${(d * 0.4).toFixed(2)},afade=t=out:st=${(d * 0.45).toFixed(2)}:d=${(d * 0.55).toFixed(2)},volume=1.6`;
      break;
    case 'chime':
      label = 'Studio Chime';
      filterInput = `sine=frequency=880:duration=${d}:sample_rate=48000,afade=t=in:st=0:d=0.02,afade=t=out:st=0.1:d=${Math.max(0.2, d - 0.1).toFixed(2)},aecho=0.8:0.85:60:0.45,volume=0.85`;
      break;
    case 'riser':
      label = 'Cinematic Riser';
      filterInput = `anoisesrc=color=white:duration=${d}:sample_rate=48000,lowpass=f=1800,afade=t=in:st=0:d=${(d * 0.9).toFixed(2)},afade=t=out:st=${Math.max(0, d - 0.1).toFixed(2)}:d=0.1,volume=1.3`;
      break;
    case 'subdrop':
      label = 'Sub Bass Drop';
      filterInput = `sine=frequency=75:duration=${d}:sample_rate=48000,afade=t=in:st=0:d=0.03,afade=t=out:st=0.12:d=${Math.max(0.2, d - 0.12).toFixed(2)},volume=1.4`;
      break;
    case 'click':
    default:
      label = 'UI Marker Click';
      filterInput = `sine=frequency=1320:duration=0.18:sample_rate=48000,afade=t=out:st=0.02:d=0.16,volume=0.9`;
      break;
  }

  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    filterInput,
    '-ac',
    '2',
    '-ar',
    '48000',
    filePath,
  ]);

  const probed = await probeMedia(filePath);
  const asset: MediaAsset = {
    id,
    name: `${label}.wav`,
    type: 'audio',
    source: 'sfx',
    url: `/media/generated/${filename}`,
    duration: probed.duration,
    mimeType: 'audio/wav',
    createdAt: new Date().toISOString(),
  };

  return registerAsset(asset);
}
