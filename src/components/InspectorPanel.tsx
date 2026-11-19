import React from 'react';
import { ArrowLeft, ArrowRight, Sliders, Type, Volume2, VolumeX } from 'lucide-react';
import type {
  AudioClip,
  EffectPreset,
  TextEffectType,
  TextTransitionType,
  TransitionType,
  VideoClip,
} from '../types/editor';

interface InspectorPanelProps {
  selectedVideoClip: VideoClip | null;
  selectedAudioClip: AudioClip | null;
  onUpdateVideoClip: (id: string, patch: Partial<VideoClip>) => void;
  onUpdateAudioClip: (id: string, patch: Partial<AudioClip>) => void;
  onMoveVideoClip: (id: string, direction: -1 | 1) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selectedVideoClip,
  selectedAudioClip,
  onUpdateVideoClip,
  onUpdateAudioClip,
  onMoveVideoClip,
}) => {
  if (!selectedVideoClip && !selectedAudioClip) {
    return (
      <div className="w-[300px] h-full bg-[#14171C] flex flex-col items-center justify-center p-6 text-center shrink-0">
        <Sliders className="w-6 h-6 text-[#475569] mb-3" />
        <p className="text-sm font-medium text-[#CBD5E1]">Clip Inspector</p>
        <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
          Select any video or audio clip on the timeline to adjust trim, speed, transitions, color grades, volume, or text overlays.
        </p>
      </div>
    );
  }

  if (selectedAudioClip) {
    return (
      <div className="w-[300px] h-full bg-[#14171C] flex flex-col overflow-y-auto shrink-0">
        <div className="px-4 py-3 border-b border-[#262B35] flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-[#60A5FA] font-mono">Track {selectedAudioClip.track}</p>
            <h3 className="text-sm font-semibold text-[#F8FAFC] truncate">
              {selectedAudioClip.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateAudioClip(selectedAudioClip.id, { muted: !selectedAudioClip.muted })
            }
            className="p-2 rounded border border-[#262B35] bg-[#1B1F26] text-[#CBD5E1] hover:text-white"
            title={selectedAudioClip.muted ? 'Unmute' : 'Mute'}
          >
            {selectedAudioClip.muted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">Start Time (s)</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={Number(selectedAudioClip.startTime.toFixed(2))}
                onChange={(e) =>
                  onUpdateAudioClip(selectedAudioClip.id, {
                    startTime: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">Duration (s)</label>
              <input
                type="number"
                step={0.1}
                min={0.3}
                value={Number(selectedAudioClip.duration.toFixed(2))}
                onChange={(e) =>
                  onUpdateAudioClip(selectedAudioClip.id, {
                    duration: Math.max(0.3, Number(e.target.value) || 1),
                  })
                }
                className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#CBD5E1]">Gain / Volume</span>
              <span className="font-mono tabular-nums text-[#94A3B8]">
                {Math.round(selectedAudioClip.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={selectedAudioClip.volume}
              onChange={(e) =>
                onUpdateAudioClip(selectedAudioClip.id, { volume: Number(e.target.value) })
              }
              className="w-full accent-[#2563EB]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">Fade In (s)</label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={3}
                value={selectedAudioClip.fadeIn}
                onChange={(e) =>
                  onUpdateAudioClip(selectedAudioClip.id, {
                    fadeIn: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">Fade Out (s)</label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={3}
                value={selectedAudioClip.fadeOut}
                onChange={(e) =>
                  onUpdateAudioClip(selectedAudioClip.id, {
                    fadeOut: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#94A3B8] mb-1">Audio Track</label>
            <div className="grid grid-cols-2 gap-2">
              {(['A1', 'A2'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onUpdateAudioClip(selectedAudioClip.id, { track: t })}
                  className={`py-1.5 rounded border text-xs font-medium ${
                    selectedAudioClip.track === t
                      ? 'border-[#2563EB] bg-[#2563EB]/15 text-white'
                      : 'border-[#262B35] bg-[#1B1F26] text-[#94A3B8]'
                  }`}
                >
                  {t === 'A1' ? 'A1 · Voice' : 'A2 · Music/SFX'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Video clip inspector
  const vc = selectedVideoClip!;

  return (
    <div className="w-[300px] h-full bg-[#14171C] flex flex-col overflow-y-auto shrink-0">
      <div className="px-4 py-3 border-b border-[#262B35] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-[#60A5FA] font-mono">Track V1</p>
          <h3 className="text-sm font-semibold text-[#F8FAFC] truncate">{vc.name}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onMoveVideoClip(vc.id, -1)}
            title="Move Earlier"
            className="p-1.5 rounded border border-[#262B35] bg-[#1B1F26] text-[#CBD5E1] hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMoveVideoClip(vc.id, 1)}
            title="Move Later"
            className="p-1.5 rounded border border-[#262B35] bg-[#1B1F26] text-[#CBD5E1] hover:text-white"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Timing & Speed */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[11px] text-[#94A3B8] mb-1">Duration (s)</label>
            <input
              type="number"
              step={0.2}
              min={0.5}
              value={Number(vc.duration.toFixed(2))}
              onChange={(e) =>
                onUpdateVideoClip(vc.id, { duration: Math.max(0.5, Number(e.target.value) || 1) })
              }
              className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs font-mono tabular-nums text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#94A3B8] mb-1">Trim In (s)</label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={Number(vc.trimStart.toFixed(2))}
              onChange={(e) =>
                onUpdateVideoClip(vc.id, { trimStart: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs font-mono tabular-nums text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#94A3B8] mb-1">Speed</label>
            <select
              value={vc.speed}
              onChange={(e) => onUpdateVideoClip(vc.id, { speed: Number(e.target.value) })}
              className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-1.5 py-1.5 text-xs font-mono text-white"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((sp) => (
                <option key={sp} value={sp}>
                  {sp}x
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Transition In */}
        <div className="pt-3 border-t border-[#262B35] space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">Transition In</label>
              <select
                value={vc.transitionIn}
                onChange={(e) =>
                  onUpdateVideoClip(vc.id, { transitionIn: e.target.value as TransitionType })
                }
                className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs text-white"
              >
                <option value="none">None (Cut)</option>
                <option value="fade">Cross Dissolve</option>
                <option value="fadeblack">Dip to Black</option>
                <option value="fadewhite">Dip to White</option>
                <option value="wipeleft">Wipe Left</option>
                <option value="wiperight">Wipe Right</option>
                <option value="wipeup">Wipe Up</option>
                <option value="wipedown">Wipe Down</option>
                <option value="slideleft">Slide Left</option>
                <option value="slideright">Slide Right</option>
                <option value="slideup">Slide Up</option>
                <option value="slidedown">Slide Down</option>
                <option value="smoothleft">Smooth Left</option>
                <option value="smoothright">Smooth Right</option>
                <option value="circleopen">Iris Open</option>
                <option value="circleclose">Iris Close</option>
                <option value="horzopen">Horz Barn Open</option>
                <option value="vertopen">Vert Barn Open</option>
                <option value="dissolve">Film Dissolve</option>
                <option value="radial">Radial Sweep</option>
                <option value="pixelize">Pixelize</option>
                <option value="diagtl">Diagonal Wipe</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">Trans. Dur (s)</label>
              <input
                type="number"
                step={0.1}
                min={0.1}
                max={2.5}
                value={vc.transitionDuration}
                onChange={(e) =>
                  onUpdateVideoClip(vc.id, {
                    transitionDuration: Math.max(0.1, Math.min(2.5, Number(e.target.value) || 0.6)),
                  })
                }
                className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs font-mono tabular-nums text-white"
              />
            </div>
          </div>
        </div>

        {/* Visual Effect & Color Adjustments */}
        <div className="pt-3 border-t border-[#262B35] space-y-2.5">
          <div>
            <label className="block text-[11px] text-[#94A3B8] mb-1">Color Grade / Effect</label>
            <select
              value={vc.effect}
              onChange={(e) =>
                onUpdateVideoClip(vc.id, { effect: e.target.value as EffectPreset })
              }
              className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs text-white"
            >
              <option value="none">Original</option>
              <option value="cinematic">Cinematic</option>
              <option value="bw">Monochrome B&amp;W</option>
              <option value="vintage">Kodak Warm</option>
              <option value="vivid">YouTube Vivid</option>
              <option value="noir">Film Noir</option>
              <option value="warm">Golden Hour</option>
              <option value="cool">Nordic Cool</option>
              <option value="blur">Gaussian Blur</option>
              <option value="sharpen">Crisp Sharpen</option>
              <option value="vignette">Lens Vignette</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-[#94A3B8] mb-1">
              <span>Brightness</span>
              <span className="font-mono tabular-nums">{vc.brightness.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={-0.35}
              max={0.35}
              step={0.02}
              value={vc.brightness}
              onChange={(e) => onUpdateVideoClip(vc.id, { brightness: Number(e.target.value) })}
              className="w-full accent-[#2563EB]"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-[#94A3B8] mb-1">
              <span>Contrast</span>
              <span className="font-mono tabular-nums">{vc.contrast.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.8}
              step={0.05}
              value={vc.contrast}
              onChange={(e) => onUpdateVideoClip(vc.id, { contrast: Number(e.target.value) })}
              className="w-full accent-[#2563EB]"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-[#94A3B8] mb-1">
              <span>Saturation</span>
              <span className="font-mono tabular-nums">{vc.saturation.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={vc.saturation}
              onChange={(e) => onUpdateVideoClip(vc.id, { saturation: Number(e.target.value) })}
              className="w-full accent-[#2563EB]"
            />
          </div>
        </div>

        {/* Text Overlay / Effects & Transitions */}
        <div className="pt-3 border-t border-[#262B35] space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#E2E8F0]">
            <Type className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>Text Effects &amp; Transition</span>
          </div>
          <input
            type="text"
            value={vc.overlay?.text || ''}
            placeholder="Enter title or caption text..."
            onChange={(e) =>
              onUpdateVideoClip(vc.id, {
                overlay: {
                  text: e.target.value,
                  position: vc.overlay?.position || 'bottom',
                  fontSize: vc.overlay?.fontSize || 48,
                  color: vc.overlay?.color || '#FFFFFF',
                  bgOpacity: vc.overlay?.bgOpacity ?? 0.55,
                  effect: vc.overlay?.effect || 'box',
                  accentColor: vc.overlay?.accentColor || '#3B82F6',
                  transition: vc.overlay?.transition || 'none',
                  transitionDuration: vc.overlay?.transitionDuration ?? 0.5,
                },
              })
            }
            className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2.5 py-1.5 text-xs text-white placeholder-[#64748B]"
          />
          {vc.overlay?.text && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#94A3B8] mb-1">Text Effect</label>
                  <select
                    value={vc.overlay.effect || 'box'}
                    onChange={(e) =>
                      onUpdateVideoClip(vc.id, {
                        overlay: {
                          ...vc.overlay!,
                          effect: e.target.value as TextEffectType,
                        },
                      })
                    }
                    className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs text-white"
                  >
                    <option value="box">Card Box</option>
                    <option value="lower_third">Lower-Third Bar</option>
                    <option value="neon">Neon Glow</option>
                    <option value="outline">Bold Outline</option>
                    <option value="shadow">Drop Shadow</option>
                    <option value="cinematic">Cinematic Band</option>
                    <option value="none">Clean Text</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#94A3B8] mb-1">Text Transition</label>
                  <select
                    value={vc.overlay.transition || 'none'}
                    onChange={(e) =>
                      onUpdateVideoClip(vc.id, {
                        overlay: {
                          ...vc.overlay!,
                          transition: e.target.value as TextTransitionType,
                        },
                      })
                    }
                    className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs text-white"
                  >
                    <option value="none">None</option>
                    <option value="fade">Fade In/Out</option>
                    <option value="slide_up">Slide Up</option>
                    <option value="slide_down">Slide Down</option>
                    <option value="slide_left">Slide Left</option>
                    <option value="slide_right">Slide Right</option>
                    <option value="zoom">Pop / Zoom</option>
                    <option value="typewriter">Typewriter</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-[#94A3B8] mb-1">Position</label>
                  <select
                    value={vc.overlay.position}
                    onChange={(e) =>
                      onUpdateVideoClip(vc.id, {
                        overlay: {
                          ...vc.overlay!,
                          position: e.target.value as 'top' | 'center' | 'bottom',
                        },
                      })
                    }
                    className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-1.5 py-1.5 text-xs text-white"
                  >
                    <option value="bottom">Bottom</option>
                    <option value="center">Center</option>
                    <option value="top">Top</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#94A3B8] mb-1">Size</label>
                  <input
                    type="number"
                    min={20}
                    max={96}
                    value={vc.overlay.fontSize}
                    onChange={(e) =>
                      onUpdateVideoClip(vc.id, {
                        overlay: {
                          ...vc.overlay!,
                          fontSize: Number(e.target.value) || 48,
                        },
                      })
                    }
                    className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#94A3B8] mb-1">Anim (s)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0.15}
                    max={2.0}
                    value={vc.overlay.transitionDuration ?? 0.5}
                    onChange={(e) =>
                      onUpdateVideoClip(vc.id, {
                        overlay: {
                          ...vc.overlay!,
                          transitionDuration: Math.max(0.15, Math.min(2, Number(e.target.value) || 0.5)),
                        },
                      })
                    }
                    className="w-full rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1 text-[11px] text-[#94A3B8]">
                  <span>Text</span>
                  <input
                    type="color"
                    value={vc.overlay.color || '#FFFFFF'}
                    onChange={(e) =>
                      onUpdateVideoClip(vc.id, {
                        overlay: { ...vc.overlay!, color: e.target.value },
                      })
                    }
                    className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between rounded border border-[#262B35] bg-[#0D0F12] px-2 py-1 text-[11px] text-[#94A3B8]">
                  <span>Accent</span>
                  <input
                    type="color"
                    value={vc.overlay.accentColor || '#3B82F6'}
                    onChange={(e) =>
                      onUpdateVideoClip(vc.id, {
                        overlay: { ...vc.overlay!, accentColor: e.target.value },
                      })
                    }
                    className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
