import React, { useState } from 'react';
import { Check, Copy, Download, Film, RefreshCw } from 'lucide-react';
import type { RenderJob } from '../types/editor';
import { buildYoutubePresetLabel } from '../utils/timelineMath';

interface ExportsViewProps {
  jobs: RenderJob[];
  onRefreshJobs: () => void;
}

export const ExportsView: React.FC<ExportsViewProps> = ({ jobs, onRefreshJobs }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopySpec = (job: RenderJob) => {
    if (!job.youtubeUploadSpec) return;
    void navigator.clipboard.writeText(JSON.stringify(job.youtubeUploadSpec, null, 2));
    setCopiedId(job.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0F12] p-6">
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex items-center justify-between border-b border-[#262B35] pb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#F8FAFC]">
              MP4 Render Queue &amp; YouTube Upload Verification
            </h1>
            <p className="text-sm text-[#94A3B8] mt-1">
              Every export is encoded to YouTube Data API v3 specifications: H.264 High@L4.2, yuv420p, AAC 48kHz stereo, and faststart moov atom.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshJobs}
            className="px-3.5 py-2 rounded-md border border-[#262B35] bg-[#14171C] hover:bg-[#1B1F26] text-xs font-medium text-[#E2E8F0] flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Queue</span>
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="border border-[#262B35] rounded-lg bg-[#14171C] p-12 text-center">
            <Film className="w-8 h-8 text-[#475569] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#E2E8F0]">No MP4 exports rendered yet</p>
            <p className="text-xs text-[#64748B] mt-1.5">
              Click Export MP4 in the top bar or trigger POST /api/v1/render from the API Console.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="border border-[#262B35] rounded-lg bg-[#14171C] overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-[#262B35] flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-semibold text-[#F8FAFC]">{job.projectName}</h2>
                      <span
                        className={`text-xs font-mono ${
                          job.status === 'completed'
                            ? 'text-emerald-400'
                            : job.status === 'failed'
                              ? 'text-red-400'
                              : 'text-[#60A5FA]'
                        }`}
                      >
                        {job.status.toUpperCase()} ({job.progress}%)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8] mt-1">
                      <span className="font-mono">{job.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{buildYoutubePresetLabel(job.youtubePreset)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.stage}</span>
                    </div>
                  </div>

                  {job.status === 'completed' && job.downloadUrl && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopySpec(job)}
                        className="px-3 py-1.5 rounded-md border border-[#262B35] bg-[#1B1F26] hover:bg-[#232832] text-xs font-medium text-[#E2E8F0] flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {copiedId === job.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedId === job.id ? 'Copied Spec' : 'Copy YouTube API JSON'}</span>
                      </button>
                      <a
                        href={job.downloadUrl}
                        download={job.filename || 'export.mp4'}
                        className="px-3.5 py-1.5 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download MP4</span>
                      </a>
                    </div>
                  )}
                </div>

                {job.status !== 'completed' && job.status !== 'failed' && (
                  <div className="px-5 py-4">
                    <div className="w-full h-1.5 bg-[#0D0F12] rounded overflow-hidden">
                      <div
                        style={{ width: `${job.progress}%` }}
                        className="h-full bg-[#2563EB] transition-all duration-300"
                      />
                    </div>
                  </div>
                )}

                {job.status === 'failed' && (
                  <div className="px-5 py-4 text-xs text-red-400 font-mono">{job.error}</div>
                )}

                {job.status === 'completed' && job.outputUrl && (
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <div className="lg:col-span-6 bg-black border border-[#262B35] rounded overflow-hidden">
                      <video
                        src={job.outputUrl}
                        controls
                        playsInline
                        className="w-full max-h-[300px]"
                      />
                    </div>

                    <div className="lg:col-span-6 space-y-3">
                      <div className="text-xs font-semibold text-[#E2E8F0]">
                        FFprobe YouTube Upload API Compliance
                      </div>
                      {job.youtubeCompliance && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border border-[#262B35] rounded-md p-3.5 bg-[#0D0F12]">
                          <div className="text-[#94A3B8]">Video Codec</div>
                          <div className="font-mono text-right text-[#F8FAFC]">
                            {job.youtubeCompliance.videoCodec} (High@L4.2)
                          </div>
                          <div className="text-[#94A3B8]">Pixel Format</div>
                          <div className="font-mono text-right text-[#F8FAFC]">
                            {job.youtubeCompliance.pixelFormat}
                          </div>
                          <div className="text-[#94A3B8]">Resolution / FPS</div>
                          <div className="font-mono text-right tabular-nums text-[#F8FAFC]">
                            {job.youtubeCompliance.resolution} @ {job.youtubeCompliance.fps}fps
                          </div>
                          <div className="text-[#94A3B8]">Audio Stream</div>
                          <div className="font-mono text-right tabular-nums text-[#F8FAFC]">
                            {job.youtubeCompliance.audioCodec} · {job.youtubeCompliance.audioSampleRate}Hz · {job.youtubeCompliance.audioChannels}ch
                          </div>
                          <div className="text-[#94A3B8]">Duration / Size</div>
                          <div className="font-mono text-right tabular-nums text-[#F8FAFC]">
                            {job.durationSec?.toFixed(2)}s ·{' '}
                            {((job.fileSizeBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                          </div>
                          <div className="text-[#94A3B8]">Faststart Moov</div>
                          <div className="font-mono text-right text-emerald-400">
                            {job.youtubeCompliance.faststart ? 'Verified (+faststart)' : 'Standard'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
