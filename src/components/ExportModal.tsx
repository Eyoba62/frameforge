import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { YouTubeMetadata, YouTubePreset } from '../types/editor';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  aspectRatio: '16:9' | '9:16';
  projectName: string;
  onStartExport: (params: {
    projectName: string;
    youtubePreset: YouTubePreset;
    youtubeMetadata: YouTubeMetadata;
  }) => Promise<void>;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  aspectRatio,
  projectName: initialName,
  onStartExport,
}) => {
  const [projectName, setProjectName] = useState(initialName);
  const [preset, setPreset] = useState<YouTubePreset>(
    aspectRatio === '9:16' ? 'youtube_shorts_1080x1920' : 'youtube_1080p60'
  );
  const [title, setTitle] = useState(initialName);
  const [description, setDescription] = useState(
    'Edited and exported in FrameForge Studio with YouTube Data API v3 compliant H.264 / AAC MP4 encoding.'
  );
  const [tagsText, setTagsText] = useState('video, studio, ai, youtube');
  const [privacyStatus, setPrivacyStatus] = useState<'private' | 'unlisted' | 'public'>('private');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onStartExport({
        projectName: projectName.trim() || 'FrameForge Export',
        youtubePreset: preset,
        youtubeMetadata: {
          title: title.trim() || projectName.trim() || 'FrameForge Export',
          description: description.trim(),
          tags: tagsText
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          privacyStatus,
          categoryId: '22',
        },
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-lg border border-[#262B35] bg-[#14171C] shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#262B35] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#F8FAFC]">
              Export MP4 for YouTube Upload API
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Renders server-side via FFmpeg (H.264 High@L4.2, yuv420p, AAC 48kHz, +faststart)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-[#94A3B8] hover:text-white hover:bg-[#1B1F26]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Export Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1">
                YouTube Encoding Preset
              </label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as YouTubePreset)}
                className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-3 py-2 text-xs text-white"
              >
                <option value="youtube_1080p60">1080p 60fps (12 Mbps)</option>
                <option value="youtube_1080p30">1080p 30fps (8 Mbps)</option>
                <option value="youtube_4k">4K UHD 30fps (35 Mbps)</option>
                <option value="youtube_shorts_1080x1920">YouTube Shorts (1080x1920)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-[#262B35] space-y-3">
            <div className="text-xs font-medium text-[#94A3B8]">
              YouTube Data API v3 Snippet (included in render job response)
            </div>
            <div>
              <label className="block text-xs text-[#CBD5E1] mb-1">Video Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#CBD5E1] mb-1">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#CBD5E1] mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#CBD5E1] mb-1">Privacy Status</label>
                <select
                  value={privacyStatus}
                  onChange={(e) =>
                    setPrivacyStatus(e.target.value as 'private' | 'unlisted' | 'public')
                  }
                  className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] px-3 py-2 text-xs text-white"
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-[#262B35] bg-[#1B1F26] text-xs font-medium text-[#E2E8F0] hover:bg-[#232832]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold"
            >
              {submitting ? 'Starting Render...' : 'Render YouTube MP4'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
