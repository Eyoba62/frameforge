import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { MediaAsset, RenderJob } from '../src/types/editor.ts';

const execFileAsync = promisify(execFile);

export const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const GENERATED_DIR = path.join(STORAGE_ROOT, 'generated');
export const EXPORTS_DIR = path.join(STORAGE_ROOT, 'exports');

const assetsStore = new Map<string, MediaAsset>();
const jobsStore = new Map<string, RenderJob>();

function resolveBuiltinAssetFile(relPath: string): string | null {
  const devPath = path.resolve(process.cwd(), relPath.replace(/^\//, ''));
  if (fs.existsSync(devPath)) return devPath;
  const distPath = path.resolve(process.cwd(), 'dist', relPath.replace(/^\//, ''));
  if (fs.existsSync(distPath)) return distPath;
  return null;
}

export function initStorage(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });

  const builtins: MediaAsset[] = [
    {
      id: 'builtin-alpine-sunrise',
      name: 'Alpine Sunrise Aerial.jpg',
      type: 'image',
      source: 'builtin',
      url: '/src/assets/images/clip_alpine_sunrise_1795013852378.jpg',
      duration: 5,
      width: 1920,
      height: 1080,
      mimeType: 'image/jpeg',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'builtin-coastal-highway',
      name: 'Pacific Coastal Twilight.jpg',
      type: 'image',
      source: 'builtin',
      url: '/src/assets/images/clip_coastal_highway_1795013853419.jpg',
      duration: 5,
      width: 1920,
      height: 1080,
      mimeType: 'image/jpeg',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'builtin-kinetic-studio',
      name: 'Architectural Light Studio.jpg',
      type: 'image',
      source: 'builtin',
      url: '/src/assets/images/clip_kinetic_studio_1795013854172.jpg',
      duration: 5,
      width: 1920,
      height: 1080,
      mimeType: 'image/jpeg',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const asset of builtins) {
    if (!assetsStore.has(asset.id)) {
      assetsStore.set(asset.id, asset);
    }
  }
}

export function registerAsset(asset: MediaAsset): MediaAsset {
  assetsStore.set(asset.id, asset);
  return asset;
}

export function listAssets(): MediaAsset[] {
  return Array.from(assetsStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getAssetById(id: string): MediaAsset | undefined {
  return assetsStore.get(id);
}

export function saveJob(job: RenderJob): RenderJob {
  jobsStore.set(job.id, job);
  return job;
}

export function getJob(id: string): RenderJob | undefined {
  return jobsStore.get(id);
}

export function listJobs(): RenderJob[] {
  return Array.from(jobsStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function resolveLocalMediaPath(assetOrUrl: string): string | null {
  const byId = assetsStore.get(assetOrUrl);
  const url = byId ? byId.url : assetOrUrl;

  if (url.startsWith('/media/uploads/')) {
    const candidate = path.join(UPLOADS_DIR, path.basename(url));
    return fs.existsSync(candidate) ? candidate : null;
  }
  if (url.startsWith('/media/generated/')) {
    const candidate = path.join(GENERATED_DIR, path.basename(url));
    return fs.existsSync(candidate) ? candidate : null;
  }
  if (url.startsWith('/api/v1/exports/')) {
    const candidate = path.join(EXPORTS_DIR, path.basename(url));
    return fs.existsSync(candidate) ? candidate : null;
  }
  if (url.startsWith('/src/assets/')) {
    return resolveBuiltinAssetFile(url);
  }
  if (fs.existsSync(url)) {
    return url;
  }
  return null;
}

export async function downloadRemoteAssetIfNeeded(url: string, targetFilename: string): Promise<string> {
  const local = resolveLocalMediaPath(url);
  if (local) return local;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch remote media (${res.status}): ${url}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const outPath = path.join(UPLOADS_DIR, targetFilename);
    fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
    return outPath;
  }

  throw new Error(`Media asset could not be resolved locally: ${url}`);
}

export interface ProbeResult {
  duration: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  videoCodec?: string;
  audioCodec?: string;
  pixelFormat?: string;
  fps?: number;
  audioSampleRate?: number;
  audioChannels?: number;
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const parsed = JSON.parse(stdout || '{}');
  const streams: Array<Record<string, unknown>> = Array.isArray(parsed.streams) ? parsed.streams : [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  let fps: number | undefined;
  if (videoStream && typeof videoStream.r_frame_rate === 'string') {
    const [numStr, denStr] = videoStream.r_frame_rate.split('/');
    const num = Number(numStr);
    const den = Number(denStr || '1');
    if (den > 0 && Number.isFinite(num / den)) {
      fps = Math.round((num / den) * 100) / 100;
    }
  }

  const rawDuration = Number(parsed.format?.duration ?? videoStream?.duration ?? audioStream?.duration ?? 5);
  return {
    duration: Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration * 100) / 100 : 5,
    width: typeof videoStream?.width === 'number' ? videoStream.width : undefined,
    height: typeof videoStream?.height === 'number' ? videoStream.height : undefined,
    hasAudio: Boolean(audioStream),
    hasVideo: Boolean(videoStream),
    videoCodec: typeof videoStream?.codec_name === 'string' ? videoStream.codec_name : undefined,
    audioCodec: typeof audioStream?.codec_name === 'string' ? audioStream.codec_name : undefined,
    pixelFormat: typeof videoStream?.pix_fmt === 'string' ? videoStream.pix_fmt : undefined,
    fps,
    audioSampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : undefined,
    audioChannels: typeof audioStream?.channels === 'number' ? audioStream.channels : undefined,
  };
}
