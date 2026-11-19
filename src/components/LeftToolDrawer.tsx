import React, { useRef, useState } from 'react';
import {
  Film,
  HardDrive,
  Layers,
  Mic,
  Music,
  Plus,
  Sparkles,
  Type,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import type {
  EffectPreset,
  MediaAsset,
  TextEffectType,
  TextOverlay,
  TextTransitionType,
  TransitionType,
} from '../types/editor';
import { DriveAudioPanel } from './DriveAudioPanel';

export type ToolTab = 'media' | 'veo' | 'audio' | 'text' | 'transitions' | 'effects';

interface LeftToolDrawerProps {
  activeTab: ToolTab;
  onTabChange: (tab: ToolTab) => void;
  assets: MediaAsset[];
  onAssetCreated: (
    asset: MediaAsset,
    autoAddToTimeline?: boolean,
    targetTrack?: 'A1' | 'A2'
  ) => void;
  onAddAssetToTimeline: (asset: MediaAsset, targetTrack?: 'A1' | 'A2') => void;
  selectedVideoClipId: string | null;
  currentTransition: TransitionType;
  currentTransitionDuration: number;
  currentEffect: EffectPreset;
  currentOverlay?: TextOverlay;
  onApplyTransition: (t: TransitionType) => void;
  onApplyTransitionDuration: (duration: number) => void;
  onApplyEffect: (e: EffectPreset) => void;
  onApplyOverlay: (overlay: TextOverlay) => void;
  aspectRatio: '16:9' | '9:16';
  onError: (msg: string) => void;
}

const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: 'none', label: 'Cut (None)' },
  { id: 'fade', label: 'Cross Dissolve' },
  { id: 'fadeblack', label: 'Dip to Black' },
  { id: 'fadewhite', label: 'Dip to White' },
  { id: 'wipeleft', label: 'Wipe Left' },
  { id: 'wiperight', label: 'Wipe Right' },
  { id: 'wipeup', label: 'Wipe Up' },
  { id: 'wipedown', label: 'Wipe Down' },
  { id: 'slideleft', label: 'Slide Left' },
  { id: 'slideright', label: 'Slide Right' },
  { id: 'slideup', label: 'Slide Up' },
  { id: 'slidedown', label: 'Slide Down' },
  { id: 'smoothleft', label: 'Smooth Left' },
  { id: 'smoothright', label: 'Smooth Right' },
  { id: 'circleopen', label: 'Iris Open' },
  { id: 'circleclose', label: 'Iris Close' },
  { id: 'horzopen', label: 'Horz Barn Open' },
  { id: 'vertopen', label: 'Vert Barn Open' },
  { id: 'dissolve', label: 'Film Dissolve' },
  { id: 'radial', label: 'Radial Sweep' },
  { id: 'pixelize', label: 'Pixelize' },
  { id: 'diagtl', label: 'Diagonal Wipe' },
];

const TEXT_EFFECTS: { id: TextEffectType; label: string; desc: string }[] = [
  { id: 'box', label: 'Card Box', desc: 'Translucent backdrop' },
  { id: 'lower_third', label: 'Lower-Third', desc: 'Accent bar + left lock' },
  { id: 'neon', label: 'Neon Glow', desc: 'Electric outer glow' },
  { id: 'outline', label: 'Bold Outline', desc: 'Crisp dark stroke' },
  { id: 'shadow', label: 'Drop Shadow', desc: 'Clean floating type' },
  { id: 'cinematic', label: 'Cinema Band', desc: 'Full-width letterbox bar' },
  { id: 'none', label: 'Plain Text', desc: 'Unstyled typography' },
];

const TEXT_TRANSITIONS: { id: TextTransitionType; label: string }[] = [
  { id: 'none', label: 'Instant (None)' },
  { id: 'fade', label: 'Fade In & Out' },
  { id: 'slide_up', label: 'Slide Up' },
  { id: 'slide_down', label: 'Slide Down' },
  { id: 'slide_left', label: 'Slide From Right' },
  { id: 'slide_right', label: 'Slide From Left' },
  { id: 'zoom', label: 'Pop / Zoom In' },
  { id: 'typewriter', label: 'Typewriter Reveal' },
];

const TEXT_TEMPLATES: { label: string; overlay: TextOverlay }[] = [
  {
    label: 'Broadcast Lower-Third',
    overlay: {
      text: 'FEATURED STORY · EPISODE 01',
      position: 'bottom',
      fontSize: 44,
      color: '#FFFFFF',
      accentColor: '#2563EB',
      bgOpacity: 0.65,
      effect: 'lower_third',
      transition: 'slide_right',
      transitionDuration: 0.5,
    },
  },
  {
    label: 'Neon Hook Title',
    overlay: {
      text: 'WATCH UNTIL THE END',
      position: 'center',
      fontSize: 58,
      color: '#FFFFFF',
      accentColor: '#22D3EE',
      bgOpacity: 0.5,
      effect: 'neon',
      transition: 'zoom',
      transitionDuration: 0.45,
    },
  },
  {
    label: 'Typewriter Subtitle',
    overlay: {
      text: 'Built with FrameForge Studio API',
      position: 'bottom',
      fontSize: 40,
      color: '#F8FAFC',
      accentColor: '#3B82F6',
      bgOpacity: 0.6,
      effect: 'outline',
      transition: 'typewriter',
      transitionDuration: 0.8,
    },
  },
  {
    label: 'Cinema Chapter Card',
    overlay: {
      text: 'PART II — THE ARCHITECTURE',
      position: 'center',
      fontSize: 48,
      color: '#F8FAFC',
      accentColor: '#F59E0B',
      bgOpacity: 0.72,
      effect: 'cinematic',
      transition: 'fade',
      transitionDuration: 0.6,
    },
  },
];

const EFFECTS: { id: EffectPreset; label: string; desc: string }[] = [
  { id: 'none', label: 'Original', desc: 'Unfiltered source' },
  { id: 'cinematic', label: 'Cinematic', desc: 'Filmic contrast + vignette' },
  { id: 'bw', label: 'Monochrome', desc: 'High-contrast B&W' },
  { id: 'vintage', label: 'Kodak Warm', desc: 'Sepia + soft fade' },
  { id: 'vivid', label: 'YouTube Vivid', desc: 'Punchy color pop' },
  { id: 'noir', label: 'Film Noir', desc: 'Deep shadows + vignette' },
  { id: 'warm', label: 'Golden Hour', desc: 'Warm tungsten tint' },
  { id: 'cool', label: 'Nordic Cool', desc: 'Crisp slate blue' },
  { id: 'blur', label: 'Gaussian Blur', desc: 'Soft backdrop defocus' },
  { id: 'sharpen', label: 'Crisp Sharpen', desc: 'Edge detail boost' },
  { id: 'vignette', label: 'Lens Vignette', desc: 'Darkened edge framing' },
];

export const LeftToolDrawer: React.FC<LeftToolDrawerProps> = ({
  activeTab,
  onTabChange,
  assets,
  onAssetCreated,
  onAddAssetToTimeline,
  selectedVideoClipId,
  currentTransition,
  currentTransitionDuration,
  currentEffect,
  currentOverlay,
  onApplyTransition,
  onApplyTransitionDuration,
  onApplyEffect,
  onApplyOverlay,
  aspectRatio,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // Veo AI state
  const [veoPrompt, setVeoPrompt] = useState(
    'Slow tracking shot through a futuristic glass botanical conservatory at dawn, mist rising'
  );
  const [veoDuration, setVeoDuration] = useState(5);
  const [veoResolution, setVeoResolution] = useState<'360p' | '720p' | '1080p'>('720p');
  const [veoRefAssetId, setVeoRefAssetId] = useState<string>('');
  const [veoBusy, setVeoBusy] = useState(false);

  // Audio / TTS / Lyria / Drive state
  const [audioSubTab, setAudioSubTab] = useState<'tts' | 'lyria' | 'sfx' | 'drive'>('tts');
  const [ttsMode, setTtsMode] = useState<'single' | 'dual'>('single');
  const [ttsText, setTtsText] = useState(
    'Welcome back to the channel. Today we break down how automated video pipelines scale YouTube production.'
  );
  const [ttsText2, setTtsText2] = useState(
    'And with real-time transitions and AI voice synthesis, you can ship studio-grade MP4s in seconds.'
  );
  const [ttsVoice, setTtsVoice] = useState<'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr'>('Kore');
  const [ttsVoice2, setTtsVoice2] = useState<'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr'>('Puck');
  const [ttsStyle, setTtsStyle] = useState('Clear, authoritative YouTube documentary narrator');
  const [ttsBusy, setTtsBusy] = useState(false);

  const [lyriaPrompt, setLyriaPrompt] = useState(
    'Minimalist electronic ambient soundtrack with warm analog synth pads and subtle pulse, 110 BPM'
  );
  const [lyriaBusy, setLyriaBusy] = useState(false);
  const [sfxBusy, setSfxBusy] = useState<string | null>(null);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/media/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onAssetCreated(data.asset, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateVeo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!veoPrompt.trim()) return;
    setVeoBusy(true);
    try {
      let referenceImageBase64: string | undefined;
      let referenceImageMimeType: string | undefined;

      if (veoRefAssetId) {
        const refAsset = assets.find((a) => a.id === veoRefAssetId);
        if (refAsset && refAsset.type === 'image') {
          const imgRes = await fetch(refAsset.url);
          const blob = await imgRes.blob();
          referenceImageMimeType = blob.type || 'image/jpeg';
          referenceImageBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const str = String(reader.result || '');
              resolve(str.split(',')[1] || '');
            };
            reader.onerror = () => reject(new Error('Failed to read reference image'));
            reader.readAsDataURL(blob);
          });
        }
      }

      const res = await fetch('/api/v1/ai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: veoPrompt.trim(),
          aspectRatio,
          durationSec: veoDuration,
          resolution: veoResolution,
          referenceImageBase64,
          referenceImageMimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI video generation failed');
      onAssetCreated(data.asset, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'AI video generation failed');
    } finally {
      setVeoBusy(false);
    }
  };

  const handleGenerateTts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ttsText.trim()) return;
    setTtsBusy(true);
    try {
      const res = await fetch('/api/v1/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: ttsMode,
          text: ttsText.trim(),
          voiceName: ttsVoice,
          style: ttsStyle.trim(),
          speaker1Name: 'Host',
          speaker1Voice: ttsVoice,
          speaker1Style: ttsStyle.trim(),
          speaker2Name: 'Guest',
          speaker2Voice: ttsVoice2,
          speaker2Style: 'Engaged, conversational co-host',
          text2: ttsText2.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TTS generation failed');
      onAssetCreated(data.asset, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'TTS generation failed');
    } finally {
      setTtsBusy(false);
    }
  };

  const handleGenerateLyria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lyriaPrompt.trim()) return;
    setLyriaBusy(true);
    try {
      const res = await fetch('/api/v1/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: lyriaPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lyria music generation failed');
      onAssetCreated(data.asset, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lyria music generation failed');
    } finally {
      setLyriaBusy(false);
    }
  };

  const handleGenerateSfx = async (preset: 'whoosh' | 'chime' | 'riser' | 'subdrop' | 'click') => {
    setSfxBusy(preset);
    try {
      const res = await fetch('/api/v1/audio/sfx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset, durationSec: preset === 'click' ? 0.25 : 1.4 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SFX generation failed');
      onAssetCreated(data.asset, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'SFX generation failed');
    } finally {
      setSfxBusy(null);
    }
  };

  const tabs: { id: ToolTab; label: string; icon: React.ReactNode }[] = [
    { id: 'media', label: 'Media', icon: <Film className="w-4 h-4" /> },
    { id: 'veo', label: 'AI Video', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'audio', label: 'Audio', icon: <Mic className="w-4 h-4" /> },
    { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
    { id: 'transitions', label: 'Transitions', icon: <Layers className="w-4 h-4" /> },
    { id: 'effects', label: 'Effects', icon: <Wand2 className="w-4 h-4" /> },
  ];

  return (
    <div className="flex h-full bg-[#14171C] border-r border-[#262B35]">
      {/* Vertical Icon Rail */}
      <div className="w-[72px] flex flex-col items-center py-3 gap-2 border-r border-[#262B35] bg-[#0F1216] shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`w-14 py-2.5 px-1 rounded-md flex flex-col items-center gap-1.5 text-[11px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[#2563EB]/15 text-[#60A5FA] border border-[#2563EB]/40'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#1B1F26] border border-transparent'
            }`}
          >
            {tab.icon}
            <span className="truncate max-w-full">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tool Drawer Content */}
      <div className="w-[272px] flex flex-col min-w-0 h-full overflow-hidden">
        {activeTab === 'media' && (
          <div className="flex flex-col h-full">
            <div className="p-3.5 border-b border-[#262B35] flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#F8FAFC] truncate">Media Library</h2>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,image/*,audio/*"
                onChange={handleUploadFile}
                className="hidden"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onTabChange('audio');
                    setAudioSubTab('drive');
                  }}
                  title="Import audio from Google Drive"
                  className="px-2 py-1.5 rounded-md border border-[#262B35] bg-[#1B1F26] hover:border-[#2563EB] text-[#E2E8F0] text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                >
                  <HardDrive className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>Drive</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-2.5 py-1.5 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Uploading...' : 'Upload'}</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group rounded-md border border-[#262B35] bg-[#1B1F26] overflow-hidden hover:border-[#3B4454] transition-colors"
                >
                  {asset.type !== 'audio' ? (
                    <div className="relative h-24 bg-black overflow-hidden">
                      {asset.type === 'image' ? (
                        <img
                          src={asset.url}
                          alt={asset.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          src={asset.url}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute bottom-1.5 right-1.5 bg-black/75 px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums text-white">
                        {asset.duration.toFixed(1)}s
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 pt-2.5 flex items-center justify-between text-xs text-[#94A3B8]">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-3.5 h-3.5 text-[#60A5FA]" />
                        <span className="uppercase tracking-wider text-[10px] font-mono">
                          {asset.source}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums">{asset.duration.toFixed(1)}s</span>
                    </div>
                  )}

                  <div className="p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#E2E8F0] truncate">{asset.name}</p>
                      <p className="text-[11px] text-[#64748B] font-mono">
                        {asset.type} · {asset.source}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onAddAssetToTimeline(
                          asset,
                          asset.type === 'audio'
                            ? asset.source === 'tts'
                              ? 'A1'
                              : 'A2'
                            : undefined
                        )
                      }
                      title="Add to Timeline"
                      className="p-1.5 rounded bg-[#2563EB]/15 hover:bg-[#2563EB] text-[#60A5FA] hover:text-white transition-colors shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'veo' && (
          <form onSubmit={handleGenerateVeo} className="flex flex-col h-full overflow-y-auto p-3.5 space-y-3.5">
            <div>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">AI Video Generator</h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                Free Tier: <span className="font-mono text-[#CBD5E1]">gemini-4-hydrogen</span> + FFmpeg Motion
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                Video Prompt
              </label>
              <textarea
                rows={4}
                value={veoPrompt}
                onChange={(e) => setVeoPrompt(e.target.value)}
                placeholder="Describe camera motion, lighting, and subject..."
                className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-3 py-2 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                Start Keyframe (Optional Image-to-Video)
              </label>
              <select
                value={veoRefAssetId}
                onChange={(e) => setVeoRefAssetId(e.target.value)}
                className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
              >
                <option value="">Text-to-Video (No keyframe)</option>
                {assets
                  .filter((a) => a.type === 'image')
                  .map((img) => (
                    <option key={img.id} value={img.id}>
                      {img.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Duration ({veoDuration}s)
                </label>
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={veoDuration}
                  onChange={(e) => setVeoDuration(Number(e.target.value))}
                  className="w-full accent-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Resolution
                </label>
                <select
                  value={veoResolution}
                  onChange={(e) => setVeoResolution(e.target.value as '360p' | '720p' | '1080p')}
                  className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="360p">360p Fast</option>
                  <option value="720p">720p HD</option>
                  <option value="1080p">1080p Full HD</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={veoBusy || !veoPrompt.trim()}
              className="w-full py-2.5 px-4 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              {veoBusy ? 'Rendering AI Video...' : 'Generate & Add to Timeline'}
            </button>
            <p className="text-[11px] text-[#64748B] leading-relaxed">
              Calls <span className="font-mono">POST /api/v1/ai/video</span> using Free-Tier Gemini scene direction + FFmpeg motion synthesis and inserts the MP4 onto Track V1.
            </p>
          </form>
        )}

        {activeTab === 'audio' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-2 border-b border-[#262B35] grid grid-cols-4 gap-1 bg-[#0F1216]">
              {(['tts', 'lyria', 'sfx', 'drive'] as const).map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setAudioSubTab(sub)}
                  className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                    audioSubTab === sub
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {sub === 'tts'
                    ? 'TTS'
                    : sub === 'lyria'
                      ? 'Music'
                      : sub === 'sfx'
                        ? 'SFX'
                        : 'Drive'}
                </button>
              ))}
            </div>

            {audioSubTab === 'tts' && (
              <form onSubmit={handleGenerateTts} className="flex-1 overflow-y-auto p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#F8FAFC]">Voice Synthesis</span>
                  <div className="flex rounded border border-[#262B35] overflow-hidden text-[11px]">
                    <button
                      type="button"
                      onClick={() => setTtsMode('single')}
                      className={`px-2 py-1 ${ttsMode === 'single' ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8]'}`}
                    >
                      Single
                    </button>
                    <button
                      type="button"
                      onClick={() => setTtsMode('dual')}
                      className={`px-2 py-1 ${ttsMode === 'dual' ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8]'}`}
                    >
                      Dual
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#CBD5E1] mb-1">
                    {ttsMode === 'dual' ? 'Speaker 1 Script' : 'Narration Script'}
                  </label>
                  <textarea
                    rows={3}
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">Voice 1</label>
                    <select
                      value={ttsVoice}
                      onChange={(e) =>
                        setTtsVoice(e.target.value as 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr')
                      }
                      className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs text-white"
                    >
                      {['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  {ttsMode === 'dual' && (
                    <div>
                      <label className="block text-[11px] text-[#94A3B8] mb-1">Voice 2</label>
                      <select
                        value={ttsVoice2}
                        onChange={(e) =>
                          setTtsVoice2(e.target.value as 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr')
                        }
                        className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs text-white"
                      >
                        {['Puck', 'Kore', 'Charon', 'Fenrir', 'Zephyr'].map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {ttsMode === 'dual' && (
                  <div>
                    <label className="block text-xs text-[#CBD5E1] mb-1">Speaker 2 Script</label>
                    <textarea
                      rows={2}
                      value={ttsText2}
                      onChange={(e) => setTtsText2(e.target.value)}
                      className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-[#94A3B8] mb-1">Delivery Style</label>
                  <input
                    type="text"
                    value={ttsStyle}
                    onChange={(e) => setTtsStyle(e.target.value)}
                    className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2.5 py-1.5 text-xs text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={ttsBusy || !ttsText.trim()}
                  className="w-full py-2.5 px-4 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                >
                  {ttsBusy ? 'Synthesizing WAV...' : 'Generate TTS & Add to Track A1'}
                </button>
              </form>
            )}

            {audioSubTab === 'lyria' && (
              <form onSubmit={handleGenerateLyria} className="flex-1 overflow-y-auto p-3.5 space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-[#F8FAFC]">AI Soundtrack Composer</h3>
                  <p className="text-[11px] text-[#94A3B8] mt-1">
                    Free Tier: <span className="font-mono">gemini-4-hydrogen</span> harmonic composition + WAV synth.
                  </p>
                </div>
                <textarea
                  rows={4}
                  value={lyriaPrompt}
                  onChange={(e) => setLyriaPrompt(e.target.value)}
                  className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                />
                <button
                  type="submit"
                  disabled={lyriaBusy || !lyriaPrompt.trim()}
                  className="w-full py-2.5 px-4 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>{lyriaBusy ? 'Composing Track...' : 'Generate Music & Add to A2'}</span>
                </button>
              </form>
            )}

            {audioSubTab === 'sfx' && (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                <p className="text-xs text-[#94A3B8]">
                  Synthesize broadcast WAV sound effects directly at your playhead on Track A2.
                </p>
                {(
                  [
                    { id: 'whoosh', name: 'Transition Whoosh', len: '1.4s' },
                    { id: 'chime', name: 'Studio Bell Chime', len: '1.4s' },
                    { id: 'riser', name: 'Cinematic Riser', len: '1.4s' },
                    { id: 'subdrop', name: 'Sub Bass Drop', len: '1.4s' },
                    { id: 'click', name: 'UI Marker Click', len: '0.25s' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={sfxBusy !== null}
                    onClick={() => handleGenerateSfx(item.id)}
                    className="w-full px-3 py-2.5 rounded-md border border-[#262B35] bg-[#1B1F26] hover:border-[#2563EB] text-left flex items-center justify-between transition-colors disabled:opacity-50"
                  >
                    <span className="text-xs font-medium text-[#E2E8F0]">{item.name}</span>
                    <span className="text-[11px] font-mono text-[#94A3B8]">
                      {sfxBusy === item.id ? 'Creating...' : item.len}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {audioSubTab === 'drive' && (
              <DriveAudioPanel
                onImported={(asset, track) => onAssetCreated(asset, true, track)}
                onError={onError}
              />
            )}
          </div>
        )}

        {activeTab === 'text' && (
          <div className="flex flex-col h-full overflow-y-auto p-3.5 space-y-3.5">
            <div>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">Text Effects &amp; Motion</h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                {selectedVideoClipId
                  ? 'Style and animate titles for the selected V1 clip.'
                  : 'Select a clip on Track V1 to apply text effects and transitions.'}
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#CBD5E1] mb-1">
                Overlay Text
              </label>
              <input
                type="text"
                disabled={!selectedVideoClipId}
                value={currentOverlay?.text || ''}
                placeholder="Type headline or lower-third..."
                onChange={(e) =>
                  onApplyOverlay({
                    text: e.target.value,
                    position: currentOverlay?.position || 'bottom',
                    fontSize: currentOverlay?.fontSize || 48,
                    color: currentOverlay?.color || '#FFFFFF',
                    accentColor: currentOverlay?.accentColor || '#3B82F6',
                    bgOpacity: currentOverlay?.bgOpacity ?? 0.55,
                    effect: currentOverlay?.effect || 'box',
                    transition: currentOverlay?.transition || 'fade',
                    transitionDuration: currentOverlay?.transitionDuration ?? 0.5,
                  })
                }
                className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-2.5 py-1.5 text-xs text-white placeholder-[#64748B] disabled:opacity-40 focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <div className="text-[11px] font-medium text-[#CBD5E1] mb-1.5">Quick Presets</div>
              <div className="grid grid-cols-2 gap-1.5">
                {TEXT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    disabled={!selectedVideoClipId}
                    onClick={() => onApplyOverlay({ ...tpl.overlay })}
                    className="px-2 py-2 rounded-md border border-[#262B35] bg-[#1B1F26] hover:border-[#2563EB] text-[11px] font-medium text-[#E2E8F0] text-left transition-colors disabled:opacity-40"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-[#CBD5E1] mb-1.5">Text Effect</div>
              <div className="grid grid-cols-2 gap-1.5">
                {TEXT_EFFECTS.map((ef) => (
                  <button
                    key={ef.id}
                    type="button"
                    disabled={!selectedVideoClipId}
                    onClick={() =>
                      onApplyOverlay({
                        text: currentOverlay?.text || 'STUDIO TITLE',
                        position: currentOverlay?.position || 'bottom',
                        fontSize: currentOverlay?.fontSize || 48,
                        color: currentOverlay?.color || '#FFFFFF',
                        accentColor: currentOverlay?.accentColor || '#3B82F6',
                        bgOpacity: currentOverlay?.bgOpacity ?? 0.55,
                        effect: ef.id,
                        transition: currentOverlay?.transition || 'fade',
                        transitionDuration: currentOverlay?.transitionDuration ?? 0.5,
                      })
                    }
                    className={`px-2 py-2 rounded-md border text-left transition-colors disabled:opacity-40 ${
                      (currentOverlay?.effect || 'box') === ef.id && selectedVideoClipId
                        ? 'border-[#2563EB] bg-[#2563EB]/15 text-white'
                        : 'border-[#262B35] bg-[#1B1F26] text-[#CBD5E1] hover:border-[#3B4454]'
                    }`}
                  >
                    <div className="text-[11px] font-medium">{ef.label}</div>
                    <div className="text-[10px] text-[#64748B] truncate">{ef.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-[#CBD5E1] mb-1.5">Text Transition</div>
              <div className="grid grid-cols-2 gap-1.5">
                {TEXT_TRANSITIONS.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    disabled={!selectedVideoClipId}
                    onClick={() =>
                      onApplyOverlay({
                        text: currentOverlay?.text || 'STUDIO TITLE',
                        position: currentOverlay?.position || 'bottom',
                        fontSize: currentOverlay?.fontSize || 48,
                        color: currentOverlay?.color || '#FFFFFF',
                        accentColor: currentOverlay?.accentColor || '#3B82F6',
                        bgOpacity: currentOverlay?.bgOpacity ?? 0.55,
                        effect: currentOverlay?.effect || 'box',
                        transition: tr.id,
                        transitionDuration: currentOverlay?.transitionDuration ?? 0.5,
                      })
                    }
                    className={`px-2 py-2 rounded-md border text-[11px] font-medium text-left transition-colors disabled:opacity-40 ${
                      (currentOverlay?.transition || 'none') === tr.id && selectedVideoClipId
                        ? 'border-[#2563EB] bg-[#2563EB]/15 text-white'
                        : 'border-[#262B35] bg-[#1B1F26] text-[#CBD5E1] hover:border-[#3B4454]'
                    }`}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transitions' && (
          <div className="flex flex-col h-full overflow-y-auto p-3.5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">Video Transitions</h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                {selectedVideoClipId
                  ? 'Select incoming FFmpeg xfade transition for the highlighted V1 clip.'
                  : 'Select a clip on Track V1 to apply an FFmpeg xfade transition.'}
              </p>
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-[#94A3B8] mb-1">
                <span>Transition Duration</span>
                <span className="font-mono tabular-nums text-[#E2E8F0]">
                  {currentTransitionDuration.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={2.0}
                step={0.1}
                disabled={!selectedVideoClipId}
                value={currentTransitionDuration}
                onChange={(e) => onApplyTransitionDuration(Number(e.target.value))}
                className="w-full accent-[#2563EB] disabled:opacity-40"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TRANSITIONS.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  disabled={!selectedVideoClipId}
                  onClick={() => onApplyTransition(tr.id)}
                  className={`px-2.5 py-2 rounded-md border text-[11px] font-medium text-left transition-colors disabled:opacity-40 ${
                    currentTransition === tr.id && selectedVideoClipId
                      ? 'border-[#2563EB] bg-[#2563EB]/15 text-white'
                      : 'border-[#262B35] bg-[#1B1F26] text-[#CBD5E1] hover:border-[#3B4454]'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'effects' && (
          <div className="flex flex-col h-full overflow-y-auto p-3.5 space-y-2.5">
            <div>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">Visual Effects & Grades</h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                {selectedVideoClipId
                  ? 'Real-time Canvas preview + matching FFmpeg render filters.'
                  : 'Select a clip on Track V1 to apply color grades and filters.'}
              </p>
            </div>
            <div className="space-y-1.5">
              {EFFECTS.map((ef) => (
                <button
                  key={ef.id}
                  type="button"
                  disabled={!selectedVideoClipId}
                  onClick={() => onApplyEffect(ef.id)}
                  className={`w-full px-3 py-2 rounded-md border text-left transition-colors disabled:opacity-40 ${
                    currentEffect === ef.id && selectedVideoClipId
                      ? 'border-[#2563EB] bg-[#2563EB]/15 text-white'
                      : 'border-[#262B35] bg-[#1B1F26] text-[#CBD5E1] hover:border-[#3B4454]'
                  }`}
                >
                  <div className="text-xs font-medium">{ef.label}</div>
                  <div className="text-[11px] text-[#64748B]">{ef.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
