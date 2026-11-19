import React, { useEffect, useState } from 'react';
import { Check, Code2, Copy, Download, Play, RefreshCw } from 'lucide-react';
import type { RenderJob, RenderProjectSpec } from '../types/editor';
import { buildInlineAiExamplePayload } from '../utils/timelineMath';

interface ApiConsoleViewProps {
  currentProjectSpec: RenderProjectSpec;
  onJobStarted: (job: RenderJob) => void;
  onGoToExports: () => void;
}

interface GeneratedCodeGuide {
  title: string;
  instructions: string[];
  code: string;
}

export const ApiConsoleView: React.FC<ApiConsoleViewProps> = ({
  currentProjectSpec,
  onJobStarted,
  onGoToExports,
}) => {
  const [mode, setMode] = useState<'timeline' | 'inline_ai' | 'schema'>('inline_ai');
  const [payloadText, setPayloadText] = useState<string>(() =>
    JSON.stringify(buildInlineAiExamplePayload(), null, 2)
  );
  const [videoClipsSchemaText, setVideoClipsSchemaText] = useState<string>('Loading videoClips schema...');
  const [snippetTab, setSnippetTab] = useState<'apps_script' | 'curl' | 'node' | 'python'>('apps_script');
  const [responseText, setResponseText] = useState<string>('');
  const [executing, setExecuting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Interactive AI API Code & Instructions Generator state
  const [goal, setGoal] = useState(
    'Generate a 16:9 YouTube video with an AI backdrop, Kore TTS voiceover, background music, and upload the rendered MP4 to YouTube from Code.gs.'
  );
  const [codeLang, setCodeLang] = useState<'apps_script' | 'node' | 'python' | 'curl'>('apps_script');
  const [includeYt, setIncludeYt] = useState(true);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [generatedGuide, setGeneratedGuide] = useState<GeneratedCodeGuide | null>(null);

  useEffect(() => {
    if (mode === 'timeline') {
      setPayloadText(JSON.stringify(currentProjectSpec, null, 2));
    } else if (mode === 'inline_ai') {
      setPayloadText(JSON.stringify(buildInlineAiExamplePayload(), null, 2));
    }
  }, [mode, currentProjectSpec]);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/schema')
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const schemaBundle = {
          videoClips: data?.schemas?.renderRequest?.properties?.videoClips || {},
          videoClipItem: data?.schemas?.videoClip || {},
          textOverlay: data?.schemas?.textOverlay || {},
        };
        setVideoClipsSchemaText(JSON.stringify(schemaBundle, null, 2));
      })
      .catch(() => {
        if (active) setVideoClipsSchemaText('Failed to load /api/v1/schema');
      });
    return () => {
      active = false;
    };
  }, []);

  const snippetPayloadText =
    mode === 'schema' ? JSON.stringify(currentProjectSpec, null, 2) : payloadText;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const copyText = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleExecuteApi = async () => {
    setExecuting(true);
    setResponseText('');
    try {
      const parsed = JSON.parse(payloadText);
      const res = await fetch('/api/v1/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setResponseText(JSON.stringify(data, null, 2));
      if (res.ok && data.job) {
        onJobStarted(data.job);
      }
    } catch (err) {
      setResponseText(
        JSON.stringify(
          { error: err instanceof Error ? err.message : 'Invalid JSON or request failure' },
          null,
          2
        )
      );
    } finally {
      setExecuting(false);
    }
  };

  const handleGenerateApiCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    setGeneratingCode(true);
    setCodeError(null);
    try {
      const res = await fetch('/api/v1/ai/api-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          language: codeLang,
          includeYoutubeUpload: includeYt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate API code');
      setGeneratedGuide(data);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Failed to generate API code');
    } finally {
      setGeneratingCode(false);
    }
  };

  const appsScriptSnippet = `/**
 * Paste into https://script.google.com -> Code.gs
 * In script.google.com left sidebar: Services (+) -> add "YouTube Data API v3"
 * Calling DriveApp prompts Apps Script to include Drive scope in ScriptApp.getOAuthToken().
 */
const FRAMEFORGE_BASE_URL = "${baseUrl}";

function listDriveAudioFiles() {
  // Ensures Apps Script authorizes Drive access for ScriptApp.getOAuthToken()
  const localMatches = DriveApp.searchFiles("trashed = false and mimeType contains 'audio/'");
  while (localMatches.hasNext()) {
    const f = localMatches.next();
    Logger.log(f.getId() + " | " + f.getName() + " | " + f.getMimeType());
  }
  const res = UrlFetchApp.fetch(FRAMEFORGE_BASE_URL + "/api/v1/drive/files", {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText()).files || [];
}

function renderAndUploadToYouTube() {
  const payload = ${snippetPayloadText};

  // 1. Start async render (pass Bearer token if inlineAiClips includes kind: "drive_audio")
  const headers = { Authorization: "Bearer " + ScriptApp.getOAuthToken() };
  const startRes = UrlFetchApp.fetch(FRAMEFORGE_BASE_URL + "/api/v1/render", {
    method: "post",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const startText = startRes.getContentText();
  if (startRes.getResponseCode() >= 300 || startText.trim().charAt(0) === "<") {
    throw new Error("Ensure Shared/Public App URL is used: " + startText.slice(0, 200));
  }

  let job = JSON.parse(startText).job;
  while (job.status !== "completed") {
    if (job.status === "failed") throw new Error(job.error || job.stage);
    Utilities.sleep(3000);
    const poll = UrlFetchApp.fetch(FRAMEFORGE_BASE_URL + "/api/v1/jobs/" + job.id);
    job = JSON.parse(poll.getContentText()).job;
  }

  // 2. Fetch rendered H.264/AAC MP4 as Blob
  const mp4Blob = UrlFetchApp.fetch(FRAMEFORGE_BASE_URL + job.downloadUrl)
    .getBlob()
    .setName(job.filename || "frameforge-export.mp4");

  // 3. Upload via Apps Script YouTube Data API v3 Service
  const spec = job.youtubeUploadSpec || {
    snippet: payload.youtubeMetadata || { title: payload.projectName },
    status: { privacyStatus: "private", selfDeclaredMadeForKids: false }
  };
  const uploaded = YouTube.Videos.insert(
    { snippet: spec.snippet, status: spec.status },
    "snippet,status",
    mp4Blob
  );
  Logger.log("Uploaded YouTube Video ID: " + uploaded.id);
  return uploaded;
}`;

  const curlSnippet = `curl -X POST "${baseUrl}/api/v1/render?wait=true" \\
  -H "Content-Type: application/json" \\
  -d '${snippetPayloadText.replace(/'/g, "'\\''")}'`;

  const nodeSnippet = `const res = await fetch("${baseUrl}/api/v1/render?wait=true", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${snippetPayloadText})
});
const { job } = await res.json();
if (job.status !== "completed") throw new Error(job.error);

// Download YouTube-ready H.264/AAC MP4:
const mp4Res = await fetch("${baseUrl}" + job.downloadUrl);
const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());
console.log("MP4 ready:", job.youtubeCompliance, job.youtubeUploadSpec);`;

  const pythonSnippet = `import io, requests

render = requests.post(
    "${baseUrl}/api/v1/render",
    params={"wait": "true"},
    json=${snippetPayloadText.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None')}
).json()

mp4_url = "${baseUrl}" + render["job"]["downloadUrl"]
mp4_bytes = requests.get(mp4_url).content

# Upload directly to YouTube Data API v3 (videos.insert):
# from googleapiclient.http import MediaIoBaseUpload
# media = MediaIoBaseUpload(io.BytesIO(mp4_bytes), mimetype="video/mp4", resumable=True)
# youtube.videos().insert(
#     part="snippet,status",
#     body=render["job"]["youtubeUploadSpec"],
#     media_body=media
# ).execute()`;

  const activeSnippet =
    snippetTab === 'apps_script'
      ? appsScriptSnippet
      : snippetTab === 'curl'
        ? curlSnippet
        : snippetTab === 'node'
          ? nodeSnippet
          : pythonSnippet;

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0F12] p-6">
      <div className="max-w-[1280px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#262B35] pb-5">
          <div>
            <h1 className="text-xl font-semibold text-[#F8FAFC]">
              Free-Tier Video API, Code Generator &amp; Instructions
            </h1>
            <p className="text-sm text-[#94A3B8] mt-1 max-w-3xl">
              Every endpoint runs on the Gemini Free Tier (<span className="font-mono text-[#CBD5E1]">gemini-4-hydrogen</span>, <span className="font-mono text-[#CBD5E1]">gemini-3.8-flash-lite-tts</span>, and FFmpeg) to compose timelines, render H.264/AAC MP4s, and output YouTube Upload API v3 payloads.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToExports}
            className="px-3.5 py-2 rounded-md border border-[#262B35] bg-[#14171C] hover:bg-[#1B1F26] text-xs font-medium text-[#E2E8F0] whitespace-nowrap"
          >
            View Render Queue
          </button>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="border border-[#262B35] rounded-lg bg-[#14171C] p-5">
          <h2 className="text-sm font-semibold text-[#F8FAFC] mb-3">
            How to Generate &amp; Upload a YouTube MP4 via API
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="border border-[#262B35] rounded-md p-3.5 bg-[#0D0F12]">
              <div className="font-mono text-[#60A5FA] font-semibold mb-1">01. Send Render JSON</div>
              <p className="text-[#94A3B8] leading-relaxed">
                POST your <span className="font-mono text-[#E2E8F0]">videoClips</span> or <span className="font-mono text-[#E2E8F0]">inlineAiClips</span> (video, tts, music, sfx) to <span className="font-mono text-[#E2E8F0]">/api/v1/render?wait=true</span>.
              </p>
            </div>
            <div className="border border-[#262B35] rounded-md p-3.5 bg-[#0D0F12]">
              <div className="font-mono text-[#60A5FA] font-semibold mb-1">02. Wait or Poll Job</div>
              <p className="text-[#94A3B8] leading-relaxed">
                With <span className="font-mono text-[#E2E8F0]">?wait=true</span>, the response returns the completed job directly; otherwise poll <span className="font-mono text-[#E2E8F0]">GET /api/v1/jobs/:id</span>.
              </p>
            </div>
            <div className="border border-[#262B35] rounded-md p-3.5 bg-[#0D0F12]">
              <div className="font-mono text-[#60A5FA] font-semibold mb-1">03. Fetch MP4 Stream</div>
              <p className="text-[#94A3B8] leading-relaxed">
                Download from <span className="font-mono text-[#E2E8F0]">job.downloadUrl</span>. Encoded as H.264 High@L4.2, yuv420p, AAC 48kHz stereo, <span className="font-mono text-[#E2E8F0]">+faststart</span>.
              </p>
            </div>
            <div className="border border-[#262B35] rounded-md p-3.5 bg-[#0D0F12]">
              <div className="font-mono text-[#60A5FA] font-semibold mb-1">04. YouTube Upload API</div>
              <p className="text-[#94A3B8] leading-relaxed">
                Pass the MP4 bytes and <span className="font-mono text-[#E2E8F0]">job.youtubeUploadSpec</span> directly into YouTube Data API v3 <span className="font-mono text-[#E2E8F0]">videos.insert</span>.
              </p>
            </div>
          </div>
        </div>

        {/* AI API Code & Instructions Generator */}
        <div className="border border-[#262B35] rounded-lg bg-[#14171C] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#262B35] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">
                AI API Code &amp; Instructions Generator
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Describe your automation workflow to generate custom runnable code and setup steps using Free-Tier Gemini.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                {
                  label: 'Code.gs + Drive Audio',
                  lang: 'apps_script' as const,
                  text: 'Build a Google Apps Script Code.gs function using DriveApp and ScriptApp.getOAuthToken() to list/pick an audio file from Google Drive, render a 16:9 video with inline drive_audio + AI motion via /api/v1/render, and upload to YouTube.',
                },
                {
                  label: 'Code.gs + YouTube',
                  lang: 'apps_script' as const,
                  text: 'Build a Google Apps Script Code.gs function that renders a 16:9 YouTube video with AI motion, Kore TTS, and music, then uploads it with YouTube.Videos.insert.',
                },
                {
                  label: 'YouTube Short + TTS',
                  lang: 'apps_script' as const,
                  text: 'Generate a 9:16 vertical YouTube Short with AI motion video, Kore TTS voiceover, background music, and upload via Code.gs.',
                },
                {
                  label: 'Node.js Pipeline',
                  lang: 'node' as const,
                  text: 'Create a 1080p 60fps YouTube video combining two AI scenes with a wipeleft transition, cinematic color grade, dual-speaker TTS, and whoosh SFX.',
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setGoal(preset.text);
                    setCodeLang(preset.lang);
                  }}
                  className="px-2.5 py-1 rounded border border-[#262B35] bg-[#0D0F12] hover:border-[#3B4454] text-[11px] text-[#CBD5E1]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleGenerateApiCode} className="p-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-6">
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  What should your API integration do?
                </label>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Language</label>
                <select
                  value={codeLang}
                  onChange={(e) =>
                    setCodeLang(e.target.value as 'apps_script' | 'node' | 'python' | 'curl')
                  }
                  className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2.5 py-2 text-xs text-white"
                >
                  <option value="apps_script">Code.gs (script.google.com)</option>
                  <option value="node">Node.js (fetch)</option>
                  <option value="python">Python (requests)</option>
                  <option value="curl">Bash + cURL</option>
                </select>
              </div>
              <div className="lg:col-span-2 flex items-center gap-2 pb-2">
                <input
                  id="yt-upload-chk"
                  type="checkbox"
                  checked={includeYt}
                  onChange={(e) => setIncludeYt(e.target.checked)}
                  className="accent-[#2563EB]"
                />
                <label htmlFor="yt-upload-chk" className="text-xs text-[#CBD5E1]">
                  Include YouTube Upload
                </label>
              </div>
              <div className="lg:col-span-2">
                <button
                  type="submit"
                  disabled={generatingCode || !goal.trim()}
                  className="w-full py-2 px-4 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{generatingCode ? 'Generating...' : 'Generate Code'}</span>
                </button>
              </div>
            </div>

            {codeError && (
              <div className="p-3 rounded border border-red-800/70 bg-red-950/60 text-xs text-red-200">
                {codeError}
              </div>
            )}

            {generatedGuide && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2 border-t border-[#262B35]">
                <div className="lg:col-span-4 space-y-2.5">
                  <h3 className="text-xs font-semibold text-[#F8FAFC]">{generatedGuide.title}</h3>
                  <ol className="space-y-2 text-xs text-[#CBD5E1] list-decimal list-inside">
                    {generatedGuide.instructions.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="lg:col-span-8 border border-[#262B35] rounded-md bg-[#0B0D10] overflow-hidden flex flex-col">
                  <div className="px-3.5 py-2 border-b border-[#262B35] flex items-center justify-between bg-[#111419]">
                    <span className="text-xs font-mono text-[#94A3B8]">
                      Generated {codeLang.toUpperCase()} Script
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText('generated', generatedGuide.code)}
                      className="px-2.5 py-1 rounded border border-[#262B35] bg-[#1B1F26] text-xs text-[#E2E8F0] flex items-center gap-1.5"
                    >
                      {copied === 'generated' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copied === 'generated' ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                  <pre className="p-4 font-mono text-xs text-[#E2E8F0] overflow-auto max-h-[320px] leading-relaxed">
                    {generatedGuide.code}
                  </pre>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Endpoint Reference Grid */}
        <div className="border border-[#262B35] rounded-lg overflow-hidden bg-[#14171C]">
          <div className="px-4 py-3 border-b border-[#262B35] text-xs font-semibold text-[#E2E8F0]">
            REST Endpoints (Free Tier)
          </div>
          <div className="divide-y divide-[#262B35] text-xs">
            {[
              {
                method: 'POST',
                path: '/api/v1/render',
                desc: 'Render multi-track timeline or inline AI clips (video, tts, music, sfx, drive_audio) into YouTube MP4. Pass ?wait=true for synchronous response.',
              },
              {
                method: 'GET',
                path: '/api/v1/jobs/:id',
                desc: 'Poll render progress, FFprobe YouTube compliance metrics, and MP4 download URL.',
              },
              {
                method: 'GET',
                path: '/api/v1/exports/:filename',
                desc: 'Stream or download rendered MP4 (+faststart H.264 High@L4.2, AAC 48kHz stereo). Supports HTTP Range.',
              },
              {
                method: 'POST',
                path: '/api/v1/ai/video',
                desc: 'Generate motion MP4 clip via Free-Tier Gemini 4 Hydrogen scene direction + FFmpeg zoompan & color grading.',
              },
              {
                method: 'POST',
                path: '/api/v1/ai/tts',
                desc: 'Synthesize single-speaker or dual-speaker WAV voiceover via Gemini 3.8 TTS.',
              },
              {
                method: 'POST',
                path: '/api/v1/ai/music',
                desc: 'Compose and synthesize a WAV background soundtrack via Free-Tier Gemini 4 Hydrogen + DSP.',
              },
              {
                method: 'POST',
                path: '/api/v1/audio/sfx',
                desc: 'Generate studio WAV sound effects (whoosh, chime, riser, subdrop, click).',
              },
              {
                method: 'POST',
                path: '/api/v1/ai/api-code',
                desc: 'Generate custom runnable Code.gs, Node.js, Python, or cURL scripts and setup instructions.',
              },
              {
                method: 'GET',
                path: '/api/v1/sdk/code.gs',
                desc: 'Download ready-to-paste Google Apps Script (Code.gs) with DriveApp + ScriptApp.getOAuthToken() + YouTube.Videos.insert.',
              },
              {
                method: 'GET',
                path: '/api/v1/drive/files',
                desc: 'List Google Drive audio files via Authorization: Bearer <ScriptApp.getOAuthToken()>. Optional ?q=search.',
              },
              {
                method: 'POST',
                path: '/api/v1/drive/import',
                desc: 'Import a Google Drive audio file into Studio Assets using Authorization: Bearer <token> and { fileId } (name/mimeType auto-resolved).',
              },
              {
                method: 'GET',
                path: '/api/v1',
                desc: 'Return the complete JSON API manual (baseUrl, auth rules, and all endpoints).',
              },
              {
                method: 'GET',
                path: '/api/v1/schema',
                desc: 'Inspect full JSON Schemas for videoClips, audioClips, inlineAiClips, textOverlay, and renderRequest.',
              },
              {
                method: 'GET',
                path: '/api/v1/assets',
                desc: 'List all registered studio media assets (builtin, uploaded, AI-generated, and Google Drive).',
              },
            ].map((ep) => (
              <div
                key={ep.path}
                className="px-4 py-2.5 grid grid-cols-12 gap-4 items-center hover:bg-[#191D24]"
              >
                <span className="col-span-2 md:col-span-1 font-mono font-semibold text-[#60A5FA]">
                  {ep.method}
                </span>
                <span className="col-span-10 md:col-span-3 font-mono text-[#F8FAFC]">
                  {ep.path}
                </span>
                <span className="col-span-12 md:col-span-8 text-[#94A3B8]">{ep.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Payload Runner & Code Snippets */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="border border-[#262B35] rounded-lg bg-[#14171C] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[#262B35] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#0D0F12] border border-[#262B35] rounded-md">
                <button
                  type="button"
                  onClick={() => setMode('inline_ai')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    mode === 'inline_ai'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Free-Tier Inline AI Payload
                </button>
                <button
                  type="button"
                  onClick={() => setMode('timeline')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    mode === 'timeline' ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Current Timeline JSON
                </button>
                <button
                  type="button"
                  onClick={() => setMode('schema')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    mode === 'schema' ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  videoClips Schema
                </button>
              </div>

              {mode === 'schema' ? (
                <button
                  type="button"
                  onClick={() => copyText('videoClipsSchema', videoClipsSchemaText)}
                  className="px-3 py-1.5 rounded-md border border-[#262B35] bg-[#1B1F26] hover:bg-[#232832] text-xs text-[#E2E8F0] flex items-center gap-1.5 whitespace-nowrap"
                >
                  {copied === 'videoClipsSchema' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied === 'videoClipsSchema' ? 'Copied Schema' : 'Copy Schema'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleExecuteApi}
                  disabled={executing}
                  className="px-3.5 py-1.5 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                >
                  {executing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>{executing ? 'Dispatching...' : 'POST /api/v1/render'}</span>
                </button>
              )}
            </div>

            {mode === 'schema' ? (
              <pre className="w-full h-[360px] bg-[#0B0D10] p-4 font-mono text-xs text-[#E2E8F0] overflow-auto leading-relaxed">
                {videoClipsSchemaText}
              </pre>
            ) : (
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                spellCheck={false}
                className="w-full h-[360px] bg-[#0B0D10] p-4 font-mono text-xs text-[#E2E8F0] focus:outline-none resize-none"
              />
            )}

            {responseText && (
              <div className="border-t border-[#262B35] bg-[#0D0F12] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-emerald-400">API Response</span>
                  <button
                    type="button"
                    onClick={onGoToExports}
                    className="text-xs text-[#60A5FA] hover:underline"
                  >
                    Track in Render Queue →
                  </button>
                </div>
                <pre className="font-mono text-xs text-[#CBD5E1] overflow-x-auto max-h-40">
                  {responseText}
                </pre>
              </div>
            )}
          </div>

          <div className="border border-[#262B35] rounded-lg bg-[#14171C] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[#262B35] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 p-0.5 bg-[#0D0F12] border border-[#262B35] rounded-md">
                {(['apps_script', 'curl', 'node', 'python'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setSnippetTab(lang)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      snippetTab === lang
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {lang === 'apps_script'
                      ? 'Code.gs (script.google.com)'
                      : lang === 'curl'
                        ? 'cURL'
                        : lang === 'node'
                          ? 'Node.js'
                          : 'Python + YouTube API'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {snippetTab === 'apps_script' && (
                  <a
                    href="/api/v1/sdk/code.gs?download=1"
                    className="px-2.5 py-1.5 rounded border border-[#262B35] bg-[#1B1F26] hover:bg-[#232832] text-xs text-[#E2E8F0] flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Code.gs</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => copyText('snippet', activeSnippet)}
                  className="px-2.5 py-1.5 rounded border border-[#262B35] bg-[#1B1F26] hover:bg-[#232832] text-xs text-[#E2E8F0] flex items-center gap-1.5 whitespace-nowrap"
                >
                  {copied === 'snippet' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied === 'snippet' ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>
            </div>
            {snippetTab === 'apps_script' && (
              <div className="px-4 py-2.5 border-b border-[#262B35] bg-[#10141B] text-[11px] text-[#94A3B8]">
                In <span className="font-mono text-[#E2E8F0]">script.google.com</span>: paste into{' '}
                <span className="font-mono text-[#E2E8F0]">Code.gs</span> (or download full{' '}
                <span className="font-mono text-[#E2E8F0]">Code.gs</span> above for{' '}
                <span className="font-mono text-[#60A5FA]">renderWithDriveAudioAndUpload()</span>), add{' '}
                <span className="font-mono text-[#E2E8F0]">YouTube Data API v3</span> under{' '}
                <span className="font-mono text-[#E2E8F0]">Services (+)</span>, keep{' '}
                <span className="font-mono text-[#E2E8F0]">DriveApp</span> so{' '}
                <span className="font-mono text-[#E2E8F0]">ScriptApp.getOAuthToken()</span> grants Drive access, and point{' '}
                <span className="font-mono text-[#E2E8F0]">FRAMEFORGE_BASE_URL</span> to your Shared App URL.
              </div>
            )}
            <pre className="flex-1 p-4 bg-[#0B0D10] font-mono text-xs text-[#CBD5E1] overflow-auto leading-relaxed">
              {activeSnippet}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
