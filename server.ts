import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { createServer as createViteServer } from 'vite';
import {
  EXPORTS_DIR,
  GENERATED_DIR,
  UPLOADS_DIR,
  getJob,
  initStorage,
  listAssets,
  listJobs,
  probeMedia,
  registerAsset,
} from './server/storage.ts';
import {
  buildAppsScriptTemplate,
  formatGeminiError,
  generateApiCodeAndInstructions,
  generateFreeMusic,
  generateFreeVideo,
  generateSfxAudio,
  generateTtsSpeech,
} from './server/gemini.ts';
import { processRenderJob } from './server/renderer.ts';
import {
  DriveApiError,
  importDriveAudioAsset,
  listDriveAudioViaToken,
} from './server/drive.ts';
import {
  AUDIO_CLIP_JSON_SCHEMA,
  INLINE_AI_CLIP_JSON_SCHEMA,
  RENDER_PROJECT_JSON_SCHEMA,
  TEXT_OVERLAY_JSON_SCHEMA,
  VIDEO_CLIP_JSON_SCHEMA,
  YOUTUBE_METADATA_JSON_SCHEMA,
  validateAndNormalizeRenderSpec,
} from './server/schema.ts';

function extractBearerToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const bodyToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
  if (bodyToken) return bodyToken;
  const queryToken = typeof req.query?.accessToken === 'string' ? req.query.accessToken.trim() : '';
  return queryToken || undefined;
}

function getRequestBaseUrl(req: express.Request): string {
  const host = req.get('host') || '';
  if (host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host)) {
    return `${req.protocol}://${host}`;
  }
  return process.env.APP_URL || `${req.protocol}://${host || `localhost:${PORT}`}`;
}

function buildApiManual(baseUrl: string) {
  return {
    service: 'FrameForge Studio Render API',
    version: 'v1',
    tier: 'free-only',
    baseUrl,
    authentication: {
      apiKeyRequired: false,
      note: 'No FRAMEFORGE_API_KEY or X-API-Key is required. GEMINI_API_KEY is configured server-side only.',
      googleDriveAuth:
        'Only Google Drive endpoints (/api/v1/drive/files, /api/v1/drive/import, and inlineAiClips kind="drive_audio") require "Authorization: Bearer <google_oauth_token>".',
    },
    endpoints: [
      { method: 'GET', path: '/api/v1', description: 'This JSON API manual.' },
      { method: 'GET', path: '/api/v1/health', description: 'Server health & Gemini configuration check.' },
      { method: 'GET', path: '/api/v1/schema', description: 'Full JSON Schemas for videoClips, audioClips, inlineAiClips, textOverlay, and renderRequest.' },
      { method: 'GET', path: '/api/v1/assets', description: 'List all registered media assets (builtin, uploaded, AI-generated, Google Drive).' },
      { method: 'POST', path: '/api/v1/media/upload', contentType: 'multipart/form-data (field: file)', description: 'Upload video, image, or audio file.' },
      { method: 'GET', path: '/api/v1/drive/files?q=', headers: ['Authorization: Bearer <token>'], description: 'List Google Drive audio files.' },
      { method: 'POST', path: '/api/v1/drive/import', headers: ['Authorization: Bearer <token>'], body: { fileId: '<drive_file_id>' }, description: 'Import a Drive audio file into Studio Assets.' },
      { method: 'POST', path: '/api/v1/ai/video', body: { prompt: '...', aspectRatio: '16:9', durationSec: 5, resolution: '720p' }, description: 'Generate Free-Tier AI motion video MP4.' },
      { method: 'POST', path: '/api/v1/ai/tts', body: { mode: 'single', text: '...', voiceName: 'Kore', style: '...' }, description: 'Generate Gemini TTS voiceover WAV.' },
      { method: 'POST', path: '/api/v1/ai/music', body: { prompt: '...', durationSec: 12 }, description: 'Generate Free-Tier AI background music WAV.' },
      { method: 'POST', path: '/api/v1/audio/sfx', body: { preset: 'whoosh', durationSec: 1.5 }, description: 'Generate studio SFX WAV (whoosh, chime, riser, subdrop, click).' },
      { method: 'POST', path: '/api/v1/ai/api-code', body: { goal: '...', language: 'apps_script|node|python|curl', includeYoutubeUpload: true }, description: 'Generate custom runnable client code & setup instructions.' },
      { method: 'GET', path: '/api/v1/sdk/code.gs', description: 'Download ready-to-paste Google Apps Script (Code.gs) for script.google.com.' },
      { method: 'POST', path: '/api/v1/render', queryParams: ['wait=true|false'], description: 'Render videoClips and/or inlineAiClips into YouTube-compliant H.264/AAC MP4.' },
      { method: 'GET', path: '/api/v1/jobs', description: 'List render jobs.' },
      { method: 'GET', path: '/api/v1/jobs/:id', description: 'Poll render job progress, YouTube compliance report, and downloadUrl.' },
      { method: 'GET', path: '/api/v1/exports/:filename?download=1', description: 'Download or stream rendered MP4.' },
    ],
    schemaUrl: `${baseUrl}/api/v1/schema`,
    appsScriptUrl: `${baseUrl}/api/v1/sdk/code.gs`,
  };
}

const PORT = 3000;

async function startServer() {
  initStorage();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Permissive CORS for external API callers (curl, Zapier, YouTube automation backends)
  app.use('/api', (_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Serve uploaded & generated media files
  app.use('/media/uploads', express.static(UPLOADS_DIR));
  app.use('/media/generated', express.static(GENERATED_DIR));

  // Multer file upload setup
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.bin';
        cb(null, `upload-${uuidv4().slice(0, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 250 * 1024 * 1024 },
  });

  // --- API Routes ---

  app.get(['/api', '/api/v1', '/api/v1/manual'], (req, res) => {
    res.json(buildApiManual(getRequestBaseUrl(req)));
  });

  app.get('/api/v1/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'FrameForge Studio Render API',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/assets', (_req, res) => {
    res.json({ assets: listAssets() });
  });

  app.get(['/api/files', '/api/v1/files'], async (req, res) => {
    const token = extractBearerToken(req);
    if (token) {
      try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const files = await listDriveAudioViaToken(token, q);
        res.json({ source: 'google-drive', files });
        return;
      } catch (err) {
        if (err instanceof DriveApiError) {
          res.status(err.status).json({ error: err.message });
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to list Google Drive audio';
        res.status(500).json({ error: message });
        return;
      }
    }
    const assets = listAssets();
    res.json({ source: 'studio-assets', files: assets, assets });
  });

  app.post('/api/v1/media/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Send multipart/form-data with field "file".' });
        return;
      }

      const filePath = req.file.path;
      const mime = req.file.mimetype || 'application/octet-stream';
      const probed = await probeMedia(filePath).catch(() => ({
        duration: 5,
        width: undefined,
        height: undefined,
        hasAudio: mime.startsWith('audio/'),
        hasVideo: mime.startsWith('video/'),
      }));

      let type: 'video' | 'image' | 'audio' = 'video';
      if (mime.startsWith('image/')) type = 'image';
      else if (mime.startsWith('audio/')) type = 'audio';

      const asset = registerAsset({
        id: `upload-${uuidv4().slice(0, 8)}`,
        name: req.file.originalname,
        type,
        source: 'upload',
        url: `/media/uploads/${req.file.filename}`,
        duration: type === 'image' ? 5 : probed.duration || 5,
        width: probed.width,
        height: probed.height,
        mimeType: mime,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({ asset });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/v1/drive/files', async (req, res) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        res.status(401).json({
          error: 'Missing Authorization: Bearer <token> header for Google Drive.',
        });
        return;
      }
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const files = await listDriveAudioViaToken(token, q);
      res.json({ files });
    } catch (err) {
      if (err instanceof DriveApiError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to list Google Drive audio';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/v1/drive/import', async (req, res) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        res.status(401).json({
          error: 'Missing Authorization: Bearer <token> header for Google Drive.',
        });
        return;
      }

      const { fileId, fileName, mimeType } = req.body || {};
      if (!fileId || typeof fileId !== 'string') {
        res.status(400).json({ error: 'Field "fileId" is required.' });
        return;
      }

      const asset = await importDriveAudioAsset({
        token,
        fileId: fileId.trim(),
        fileName: typeof fileName === 'string' ? fileName : undefined,
        mimeType: typeof mimeType === 'string' ? mimeType : undefined,
      });

      res.status(201).json({ asset });
    } catch (err) {
      if (err instanceof DriveApiError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : 'Google Drive import failed';
      res.status(500).json({ error: message });
    }
  });

  const handleFreeVideo = async (req: express.Request, res: express.Response) => {
    try {
      const { prompt, aspectRatio, durationSec, resolution, referenceImageBase64, referenceImageMimeType } =
        req.body || {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Field "prompt" is required for AI video generation.' });
        return;
      }
      const asset = await generateFreeVideo({
        prompt: prompt.trim(),
        aspectRatio,
        durationSec,
        resolution,
        referenceImageBase64,
        referenceImageMimeType,
      });
      res.status(201).json({ asset });
    } catch (err: unknown) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  };

  app.post('/api/v1/ai/video', handleFreeVideo);
  app.post('/api/v1/ai/veo', handleFreeVideo);

  app.post('/api/v1/ai/tts', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
        res.status(400).json({ error: 'Field "text" is required for Gemini TTS generation.' });
        return;
      }
      const asset = await generateTtsSpeech(body);
      res.status(201).json({ asset });
    } catch (err: unknown) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/v1/ai/music', async (req, res) => {
    try {
      const { prompt, durationSec } = req.body || {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Field "prompt" is required for AI music generation.' });
        return;
      }
      const asset = await generateFreeMusic(prompt.trim(), durationSec);
      res.status(201).json({ asset });
    } catch (err: unknown) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/v1/ai/api-code', async (req, res) => {
    try {
      const { goal, language, includeYoutubeUpload } = req.body || {};
      if (!goal || typeof goal !== 'string' || !goal.trim()) {
        res.status(400).json({ error: 'Field "goal" is required to generate API code and instructions.' });
        return;
      }
      const baseUrl = getRequestBaseUrl(req);
      const normalizedLang =
        language === 'python' || language === 'curl' || language === 'apps_script'
          ? language
          : 'node';
      const result = await generateApiCodeAndInstructions({
        goal: goal.trim(),
        language: normalizedLang,
        baseUrl,
        includeYoutubeUpload: includeYoutubeUpload !== false,
      });
      res.json(result);
    } catch (err: unknown) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/v1/sdk/code.gs', (req, res) => {
    const baseUrl = getRequestBaseUrl(req);
    const script = buildAppsScriptTemplate(baseUrl);
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', 'attachment; filename="Code.gs"');
    }
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.send(script);
  });

  app.post('/api/v1/audio/sfx', async (req, res) => {
    try {
      const { preset, durationSec } = req.body || {};
      const asset = await generateSfxAudio(preset || 'whoosh', durationSec ?? 1.5);
      res.status(201).json({ asset });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SFX generation failed';
      res.status(500).json({ error: message });
    }
  });

  // Main Headless Video Render API (supports async job polling or ?wait=true synchronous return)
  app.post('/api/v1/render', async (req, res) => {
    try {
      const { errors, normalizedSpec } = validateAndNormalizeRenderSpec(req.body);
      if (errors.length > 0 || !normalizedSpec) {
        res.status(400).json({
          error: errors[0] || 'Invalid render specification.',
          validationErrors: errors,
        });
        return;
      }

      const jobId = uuidv4();
      const waitSync = req.query.wait === 'true' || req.body?.wait === true;
      const authBearerToken = extractBearerToken(req);

      if (waitSync) {
        const completedJob = await processRenderJob(jobId, normalizedSpec, authBearerToken);
        res.status(completedJob.status === 'completed' ? 200 : 500).json({ job: completedJob });
        return;
      }

      // Launch background render job immediately and return 202 with polling URL
      const initialJob = {
        id: jobId,
        projectName: normalizedSpec.projectName || 'Untitled YouTube Export',
        status: 'queued' as const,
        progress: 0,
        stage: 'Queued for rendering...',
        youtubePreset: normalizedSpec.youtubePreset || ('youtube_1080p60' as const),
        aspectRatio: normalizedSpec.aspectRatio || ('16:9' as const),
        createdAt: new Date().toISOString(),
      };

      void processRenderJob(jobId, normalizedSpec, authBearerToken);

      res.status(202).json({
        job: initialJob,
        statusUrl: `/api/v1/jobs/${jobId}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Render request failed';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/v1/jobs', (_req, res) => {
    res.json({ jobs: listJobs() });
  });

  app.get('/api/v1/jobs/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: `Render job "${req.params.id}" not found.` });
      return;
    }
    res.json({ job });
  });

  // Stream or download rendered MP4 with HTTP Range support
  app.get('/api/v1/exports/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(EXPORTS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Exported MP4 file not found.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  app.get('/api/v1/schema', (req, res) => {
    const baseUrl = getRequestBaseUrl(req);
    res.json({
      baseUrl,
      tier: 'free-only',
      endpoints: {
        render: { method: 'POST', path: '/api/v1/render', queryParams: ['wait=true|false'] },
        jobStatus: { method: 'GET', path: '/api/v1/jobs/:id' },
        downloadMp4: { method: 'GET', path: '/api/v1/exports/:filename?download=1' },
        aiVideoGenerate: { method: 'POST', path: '/api/v1/ai/video' },
        ttsGenerate: { method: 'POST', path: '/api/v1/ai/tts' },
        musicGenerate: { method: 'POST', path: '/api/v1/ai/music' },
        sfxGenerate: { method: 'POST', path: '/api/v1/audio/sfx' },
        apiCodeGenerate: {
          method: 'POST',
          path: '/api/v1/ai/api-code',
          languages: ['apps_script', 'node', 'python', 'curl'],
        },
        appsScriptSdk: { method: 'GET', path: '/api/v1/sdk/code.gs' },
        driveFiles: {
          method: 'GET',
          path: '/api/v1/drive/files',
          queryParams: ['q=<optional_search>'],
          headers: ['Authorization: Bearer <google_oauth_token>'],
        },
        driveImport: {
          method: 'POST',
          path: '/api/v1/drive/import',
          headers: ['Authorization: Bearer <google_oauth_token>'],
        },
        uploadMedia: { method: 'POST', path: '/api/v1/media/upload' },
      },
      youtubeEncodingSpec: {
        container: 'MP4 (+faststart moov atom)',
        videoCodec: 'H.264 High@L4.2 (libx264, yuv420p, closed GOP)',
        audioCodec: 'AAC-LC Stereo 48kHz 192kbps',
      },
      schemas: {
        renderRequest: RENDER_PROJECT_JSON_SCHEMA,
        videoClip: VIDEO_CLIP_JSON_SCHEMA,
        textOverlay: TEXT_OVERLAY_JSON_SCHEMA,
        audioClip: AUDIO_CLIP_JSON_SCHEMA,
        inlineAiClip: INLINE_AI_CLIP_JSON_SCHEMA,
        youtubeMetadata: YOUTUBE_METADATA_JSON_SCHEMA,
      },
    });
  });

  // Ensure unmatched /api/* routes and wrong HTTP methods NEVER fall through to SPA homepage HTML
  const POST_ONLY_API_ROUTES = new Set([
    '/api/v1/render',
    '/api/v1/media/upload',
    '/api/v1/drive/import',
    '/api/v1/ai/video',
    '/api/v1/ai/veo',
    '/api/v1/ai/tts',
    '/api/v1/ai/music',
    '/api/v1/ai/api-code',
    '/api/v1/audio/sfx',
  ]);

  app.use('/api', (req, res) => {
    const cleanPath = req.originalUrl.split('?')[0].replace(/\/+$/, '') || '/api';
    const baseUrl = getRequestBaseUrl(req);
    if (POST_ONLY_API_ROUTES.has(cleanPath)) {
      res.status(405).json({
        error: `Method ${req.method} is not allowed on ${cleanPath}. Send a POST request with Content-Type: application/json.`,
        allowedMethod: 'POST',
        endpoint: `${baseUrl}${cleanPath}`,
        manualUrl: `${baseUrl}/api/v1`,
        schemaUrl: `${baseUrl}/api/v1/schema`,
      });
      return;
    }

    res.status(404).json({
      error: `API endpoint "${cleanPath}" not found.`,
      manualUrl: `${baseUrl}/api/v1`,
      schemaUrl: `${baseUrl}/api/v1/schema`,
      healthUrl: `${baseUrl}/api/v1/health`,
    });
  });

  // Catch JSON parse errors (e.g. malformed JSON body) so /api always returns JSON instead of HTML
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 400;
    const message = err instanceof Error ? err.message : 'Invalid API request';
    res.status(status).json({ error: message });
  });

  // --- Vite / Static Frontend ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FrameForge Studio running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start FrameForge server:', err);
  process.exit(1);
});
