import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type {
  AudioClip,
  EffectPreset,
  MediaAsset,
  RenderJob,
  RenderProjectSpec,
  TextOverlay,
  TransitionType,
  VideoClip,
  YouTubeMetadata,
  YouTubePreset,
} from './types/editor';
import { computeVideoSegments } from './utils/timelineMath';
import { LeftToolDrawer, type ToolTab } from './components/LeftToolDrawer';
import { ProgramMonitor } from './components/ProgramMonitor';
import { InspectorPanel } from './components/InspectorPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { ApiConsoleView } from './components/ApiConsoleView';
import { ExportsView } from './components/ExportsView';
import { ExportModal } from './components/ExportModal';

type WorkspaceTab = 'editor' | 'api' | 'exports' | 'assets';

const DEFAULT_VIDEO_CLIPS: VideoClip[] = [
  {
    id: 'v-clip-1',
    assetId: 'builtin-alpine-sunrise',
    name: 'Alpine Sunrise Aerial',
    track: 'V1',
    startTime: 0,
    duration: 4,
    trimStart: 0,
    speed: 1,
    transitionIn: 'none',
    transitionDuration: 0.6,
    effect: 'cinematic',
    brightness: 0,
    contrast: 1.05,
    saturation: 1.05,
    volume: 1,
    muted: false,
    overlay: {
      text: 'HORIZON DISPATCH · EPISODE 01',
      position: 'bottom',
      fontSize: 44,
      color: '#FFFFFF',
      accentColor: '#2563EB',
      bgOpacity: 0.6,
      effect: 'lower_third',
      transition: 'slide_up',
      transitionDuration: 0.5,
    },
  },
  {
    id: 'v-clip-2',
    assetId: 'builtin-coastal-highway',
    name: 'Pacific Coastal Twilight',
    track: 'V1',
    startTime: 4,
    duration: 4,
    trimStart: 0,
    speed: 1,
    transitionIn: 'fade',
    transitionDuration: 0.7,
    effect: 'vivid',
    brightness: 0,
    contrast: 1.08,
    saturation: 1.15,
    volume: 1,
    muted: false,
  },
  {
    id: 'v-clip-3',
    assetId: 'builtin-kinetic-studio',
    name: 'Architectural Light Studio',
    track: 'V1',
    startTime: 8,
    duration: 4,
    trimStart: 0,
    speed: 1,
    transitionIn: 'wipeleft',
    transitionDuration: 0.6,
    effect: 'warm',
    brightness: 0,
    contrast: 1.05,
    saturation: 1.0,
    volume: 1,
    muted: false,
  },
];

export default function App() {
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('editor');
  const [toolTab, setToolTab] = useState<ToolTab>('media');

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [videoClips, setVideoClips] = useState<VideoClip[]>(DEFAULT_VIDEO_CLIPS);
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [selectedClipId, setSelectedClipId] = useState<string | null>('v-clip-1');

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/assets');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.assets)) setAssets(data.assets);
    } catch {
      // ignore initial load hiccup
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/jobs');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.jobs)) setJobs(data.jobs);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchAssets();
    void fetchJobs();
  }, [fetchAssets, fetchJobs]);

  // Poll active render jobs every 1.2s
  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === 'queued' || j.status === 'generating_ai' || j.status === 'rendering'
    );
    if (!hasActive) return;
    const timer = setInterval(() => {
      void fetchJobs();
    }, 1200);
    return () => clearInterval(timer);
  }, [jobs, fetchJobs]);

  const { totalVideoDuration } = useMemo(() => computeVideoSegments(videoClips), [videoClips]);
  const totalAudioDuration = useMemo(
    () => audioClips.reduce((acc, c) => Math.max(acc, c.startTime + c.duration), 0),
    [audioClips]
  );
  const totalDuration = Math.max(totalVideoDuration, totalAudioDuration, 0.5);

  // Playback loop via requestAnimationFrame
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalDuration]);

  const selectedVideoClip = useMemo(
    () => videoClips.find((c) => c.id === selectedClipId) || null,
    [videoClips, selectedClipId]
  );
  const selectedAudioClip = useMemo(
    () => audioClips.find((c) => c.id === selectedClipId) || null,
    [audioClips, selectedClipId]
  );

  const handleAddAssetToTimeline = useCallback(
    (asset: MediaAsset, targetTrack?: 'A1' | 'A2') => {
      if (asset.type === 'audio') {
        const track: 'A1' | 'A2' = targetTrack || (asset.source === 'tts' ? 'A1' : 'A2');
        const clipId = `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const isMusic = asset.source === 'lyria' || asset.source === 'ai-music';
        const newAudio: AudioClip = {
          id: clipId,
          assetId: asset.id,
          name: asset.name,
          track,
          startTime: isMusic ? 0 : Math.round(currentTime * 10) / 10,
          duration: asset.duration || 4,
          trimStart: 0,
          volume: isMusic ? 0.38 : 1.0,
          fadeIn: isMusic ? 0.4 : 0.05,
          fadeOut: isMusic ? 0.8 : 0.1,
          muted: false,
        };
        setAudioClips((prev) => [...prev, newAudio]);
        setSelectedClipId(clipId);
      } else {
        const clipId = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        setVideoClips((prev) => {
          const nextStart = prev.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0);
          const newVideo: VideoClip = {
            id: clipId,
            assetId: asset.id,
            name: asset.name.replace(/\.[^.]+$/, ''),
            track: 'V1',
            startTime: nextStart,
            duration: asset.type === 'image' ? 4 : Math.max(1, asset.duration || 5),
            trimStart: 0,
            speed: 1,
            transitionIn: prev.length > 0 ? 'fade' : 'none',
            transitionDuration: 0.6,
            effect: 'none',
            brightness: 0,
            contrast: 1,
            saturation: 1,
            volume: 1,
            muted: false,
          };
          return [...prev, newVideo];
        });
        setSelectedClipId(clipId);
      }
    },
    [currentTime]
  );

  const handleAssetCreated = useCallback(
    (asset: MediaAsset, autoAddToTimeline = true, targetTrack?: 'A1' | 'A2') => {
      setAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
      if (autoAddToTimeline) {
        handleAddAssetToTimeline(asset, targetTrack);
      }
    },
    [handleAddAssetToTimeline]
  );

  const handleUpdateVideoClip = (id: string, patch: Partial<VideoClip>) => {
    setVideoClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleUpdateAudioClip = (id: string, patch: Partial<AudioClip>) => {
    setAudioClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleMoveVideoClip = (id: string, direction: -1 | 1) => {
    setVideoClips((prev) => {
      const sorted = [...prev].sort((a, b) => a.startTime - b.startTime);
      const idx = sorted.findIndex((c) => c.id === id);
      const targetIdx = idx + direction;
      if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return prev;
      const temp = sorted[idx];
      sorted[idx] = sorted[targetIdx];
      sorted[targetIdx] = temp;
      let t = 0;
      return sorted.map((c) => {
        const updated = { ...c, startTime: t };
        t += c.duration;
        return updated;
      });
    });
  };

  const handleSplitAtPlayhead = () => {
    const { segments } = computeVideoSegments(videoClips);
    const activeSeg = segments.find(
      (s) => currentTime > s.effectiveStart + 0.3 && currentTime < s.effectiveEnd - 0.3
    );
    if (!activeSeg) {
      setErrorBanner('Move the playhead inside a video clip (at least 0.3s from edges) to split.');
      return;
    }

    const offsetIntoClip = currentTime - activeSeg.effectiveStart;
    const orig = activeSeg.clip;
    const firstPart: VideoClip = {
      ...orig,
      duration: Math.round(offsetIntoClip * 10) / 10,
    };
    const secondPart: VideoClip = {
      ...orig,
      id: `v-split-${Date.now().toString(36)}`,
      name: `${orig.name} (Part 2)`,
      startTime: orig.startTime + firstPart.duration,
      duration: Math.max(0.5, Math.round((orig.duration - firstPart.duration) * 10) / 10),
      trimStart: orig.trimStart + firstPart.duration * orig.speed,
      transitionIn: 'none',
    };

    setVideoClips((prev) => {
      const idx = prev.findIndex((c) => c.id === orig.id);
      if (idx < 0) return prev;
      const next = [...prev];
      next.splice(idx, 1, firstPart, secondPart);
      return next;
    });
    setSelectedClipId(secondPart.id);
  };

  const handleDeleteSelected = () => {
    if (!selectedClipId) return;
    setVideoClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    setAudioClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    setSelectedClipId(null);
  };

  const currentProjectSpec: RenderProjectSpec = useMemo(
    () => ({
      projectName: 'Horizon Dispatch MP4',
      aspectRatio,
      youtubePreset:
        aspectRatio === '9:16' ? 'youtube_shorts_1080x1920' : 'youtube_1080p60',
      videoClips,
      audioClips,
      youtubeMetadata: {
        title: 'Horizon Dispatch — Automated Studio Edit',
        description: 'Exported via FrameForge Studio.',
        tags: ['FrameForge', 'YouTube', 'AI'],
        privacyStatus: 'private',
        categoryId: '22',
      },
    }),
    [aspectRatio, videoClips, audioClips]
  );

  const handleStartExport = async (params: {
    projectName: string;
    youtubePreset: YouTubePreset;
    youtubeMetadata: YouTubeMetadata;
  }) => {
    const payload: RenderProjectSpec = {
      ...currentProjectSpec,
      projectName: params.projectName,
      youtubePreset: params.youtubePreset,
      youtubeMetadata: params.youtubeMetadata,
    };

    const res = await fetch('/api/v1/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || 'Failed to queue MP4 render');
      return;
    }
    if (data.job) {
      setJobs((prev) => [data.job, ...prev]);
      setWorkspaceTab('exports');
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0D0F12] text-[#F1F5F9]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="h-13 px-6 border-b border-[#262B35] bg-[#14171C] flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Single text wordmark */}
        <a
          href="#editor"
          onClick={(e) => {
            e.preventDefault();
            setWorkspaceTab('editor');
          }}
          className="text-base font-bold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0 font-display"
        >
          FrameForge
        </a>

        {/* Zone 2: 4 clean single-line nav links */}
        <nav className="flex items-center gap-6 text-sm font-medium">
          {(
            [
              { id: 'editor', label: 'Editor' },
              { id: 'api', label: 'API Console' },
              { id: 'exports', label: `Exports${jobs.length ? ` (${jobs.length})` : ''}` },
              { id: 'assets', label: `Assets (${assets.length})` },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setWorkspaceTab(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                workspaceTab === item.id
                  ? 'text-[#F8FAFC] border-[#2563EB]'
                  : 'text-[#94A3B8] border-transparent hover:text-[#E2E8F0]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="px-4 py-2 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Export MP4
          </button>
        </div>
      </header>

      {/* Non-blocking Error Banner */}
      {errorBanner && (
        <div className="px-6 py-2.5 bg-red-950/80 border-b border-red-800/70 flex items-center justify-between gap-4 text-xs text-red-100 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Workspace */}
      {workspaceTab === 'editor' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <LeftToolDrawer
              activeTab={toolTab}
              onTabChange={setToolTab}
              assets={assets}
              onAssetCreated={handleAssetCreated}
              onAddAssetToTimeline={handleAddAssetToTimeline}
              selectedVideoClipId={selectedVideoClip?.id || null}
              currentTransition={selectedVideoClip?.transitionIn || 'none'}
              currentTransitionDuration={selectedVideoClip?.transitionDuration ?? 0.6}
              currentEffect={selectedVideoClip?.effect || 'none'}
              currentOverlay={selectedVideoClip?.overlay}
              onApplyTransition={(t: TransitionType) => {
                if (selectedVideoClip) {
                  handleUpdateVideoClip(selectedVideoClip.id, { transitionIn: t });
                }
              }}
              onApplyTransitionDuration={(d: number) => {
                if (selectedVideoClip) {
                  handleUpdateVideoClip(selectedVideoClip.id, { transitionDuration: d });
                }
              }}
              onApplyEffect={(ef: EffectPreset) => {
                if (selectedVideoClip) {
                  handleUpdateVideoClip(selectedVideoClip.id, { effect: ef });
                }
              }}
              onApplyOverlay={(overlay: TextOverlay) => {
                if (selectedVideoClip) {
                  handleUpdateVideoClip(selectedVideoClip.id, { overlay });
                }
              }}
              aspectRatio={aspectRatio}
              onError={(msg) => setErrorBanner(msg)}
            />

            <div className="flex-1 min-w-0 h-full">
              <ProgramMonitor
                assets={assets}
                videoClips={videoClips}
                audioClips={audioClips}
                aspectRatio={aspectRatio}
                onAspectRatioChange={setAspectRatio}
                currentTime={currentTime}
                totalDuration={totalDuration}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onSeek={(t) => setCurrentTime(t)}
                selectedClipId={selectedClipId}
                onSplitAtPlayhead={handleSplitAtPlayhead}
                onDeleteSelected={handleDeleteSelected}
              />
            </div>

            <InspectorPanel
              selectedVideoClip={selectedVideoClip}
              selectedAudioClip={selectedAudioClip}
              onUpdateVideoClip={handleUpdateVideoClip}
              onUpdateAudioClip={handleUpdateAudioClip}
              onMoveVideoClip={handleMoveVideoClip}
            />
          </div>

          <TimelinePanel
            assets={assets}
            videoClips={videoClips}
            audioClips={audioClips}
            currentTime={currentTime}
            totalDuration={totalDuration}
            selectedClipId={selectedClipId}
            onSelectClip={setSelectedClipId}
            onSeek={(t) => {
              setIsPlaying(false);
              setCurrentTime(t);
            }}
            onUpdateAudioClipStart={(id, startTime) => handleUpdateAudioClip(id, { startTime })}
            onResizeVideoClipDuration={(id, duration) => handleUpdateVideoClip(id, { duration })}
          />
        </div>
      )}

      {workspaceTab === 'api' && (
        <ApiConsoleView
          currentProjectSpec={currentProjectSpec}
          onJobStarted={(job) => setJobs((prev) => [job, ...prev])}
          onGoToExports={() => setWorkspaceTab('exports')}
        />
      )}

      {workspaceTab === 'exports' && (
        <ExportsView jobs={jobs} onRefreshJobs={() => void fetchJobs()} />
      )}

      {workspaceTab === 'assets' && (
        <div className="flex-1 overflow-y-auto p-6 bg-[#0D0F12]">
          <div className="max-w-[1200px] mx-auto space-y-5">
            <div className="flex items-center justify-between border-b border-[#262B35] pb-4">
              <div>
                <h1 className="text-xl font-semibold text-[#F8FAFC]">Registered Studio Assets</h1>
                <p className="text-sm text-[#94A3B8] mt-1">
                  Reference any Asset ID below in POST /api/v1/render payloads or insert directly into the Editor timeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWorkspaceTab('editor')}
                className="px-3.5 py-2 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold"
              >
                Back to Editor
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="border border-[#262B35] rounded-lg bg-[#14171C] overflow-hidden flex flex-col"
                >
                  {asset.type === 'image' ? (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      referrerPolicy="no-referrer"
                      className="h-40 w-full object-cover bg-black"
                    />
                  ) : asset.type === 'video' ? (
                    <video
                      src={asset.url}
                      controls
                      playsInline
                      className="h-40 w-full object-cover bg-black"
                    />
                  ) : (
                    <div className="h-40 bg-[#0D0F12] flex flex-col items-center justify-center p-4 gap-3">
                      <audio src={asset.url} controls className="w-full" />
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#F8FAFC] truncate">
                        {asset.name}
                      </h3>
                      <p className="text-xs font-mono text-[#94A3B8] mt-1">
                        ID: {asset.id}
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {asset.type} · {asset.source} · {asset.duration.toFixed(2)}s
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleAddAssetToTimeline(asset);
                        setWorkspaceTab('editor');
                      }}
                      className="w-full py-2 rounded-md border border-[#262B35] bg-[#1B1F26] hover:border-[#2563EB] text-xs font-medium text-[#E2E8F0] transition-colors"
                    >
                      Add to Timeline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        aspectRatio={aspectRatio}
        projectName="Horizon Dispatch MP4"
        onStartExport={handleStartExport}
      />
    </div>
  );
}
