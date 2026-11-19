import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { LogOut, Music2, RefreshCw, Search } from 'lucide-react';
import type { MediaAsset } from '../types/editor';
import {
  clearDriveAccessToken,
  DriveAuthExpiredError,
  getDriveAccessToken,
  googleSignInForDrive,
  initDriveAuth,
  listDriveAudioFiles,
  logoutDrive,
  type DriveAudioFile,
} from '../services/googleDriveAuth';

interface DriveAudioPanelProps {
  onImported: (asset: MediaAsset, targetTrack: 'A1' | 'A2') => void;
  onError: (message: string) => void;
}

function formatFileSize(sizeStr?: string): string {
  const bytes = Number(sizeStr || 0);
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAudioExt(name: string, mimeType: string): string {
  const match = name.match(/\.([a-zA-Z0-9]+)$/);
  if (match) return match[1].toUpperCase();
  if (mimeType.includes('/')) return mimeType.split('/')[1].toUpperCase();
  return 'AUDIO';
}

export const DriveAudioPanel: React.FC<DriveAudioPanelProps> = ({ onImported, onError }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getDriveAccessToken());
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getDriveAccessToken());
  const [signingIn, setSigningIn] = useState(false);

  const [files, setFiles] = useState<DriveAudioFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  const loadFiles = useCallback(
    async (token: string, query: string) => {
      setLoadingFiles(true);
      try {
        const list = await listDriveAudioFiles(token, query);
        setFiles(list);
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          setAccessToken(null);
          setNeedsAuth(true);
        }
        onError(err instanceof Error ? err.message : 'Failed to list Google Drive audio files.');
      } finally {
        setLoadingFiles(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    const unsub = initDriveAuth(
      (signedInUser, token) => {
        setUser(signedInUser);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (accessToken && !needsAuth) {
      void loadFiles(accessToken, '');
    }
  }, [accessToken, needsAuth, loadFiles]);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      const result = await googleSignInForDrive();
      setUser(result.user);
      setAccessToken(result.accessToken);
      setNeedsAuth(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutDrive();
    setUser(null);
    setAccessToken(null);
    setFiles([]);
    setNeedsAuth(true);
  };

  const handleImport = async (file: DriveAudioFile, targetTrack: 'A1' | 'A2') => {
    const token = accessToken || getDriveAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setImportingId(`${file.id}:${targetTrack}`);
    try {
      const res = await fetch('/api/v1/drive/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        clearDriveAccessToken();
        setAccessToken(null);
        setNeedsAuth(true);
        throw new Error(data.error || 'Google Drive session expired. Please sign in again.');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import Google Drive audio.');
      }
      onImported(data.asset, targetTrack);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to import audio from Google Drive.');
    } finally {
      setImportingId(null);
    }
  };

  if (needsAuth || !accessToken) {
    return (
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col justify-center items-center text-center space-y-4">
        <div className="w-10 h-10 rounded-lg bg-[#1B1F26] border border-[#262B35] flex items-center justify-center text-[#60A5FA]">
          <Music2 className="w-5 h-5" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-[#F8FAFC]">Google Drive Audio</h3>
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">
            Connect Google Drive to browse MP3, WAV, M4A, AAC, OGG, and FLAC audio files and insert them directly onto Track A1 or A2.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={signingIn}
          className="gsi-material-button inline-flex items-center justify-center gap-2.5 px-4 py-2 rounded bg-white hover:bg-[#F8FAFC] text-[#1F1F1F] text-xs font-medium border border-[#DADCE0] shadow-sm transition-colors disabled:opacity-60"
        >
          <span className="gsi-material-button-icon w-[18px] h-[18px] shrink-0">
            <svg
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="block w-full h-full"
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
          </span>
          <span className="gsi-material-button-contents">
            {signingIn ? 'Connecting...' : 'Sign in with Google'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 border-b border-[#262B35] space-y-2.5 bg-[#12151A]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[#E2E8F0] truncate">
              {user?.displayName || user?.email || 'Google Drive Connected'}
            </div>
            {user?.email && user?.displayName && (
              <div className="text-[10px] text-[#64748B] truncate">{user.email}</div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void loadFiles(accessToken, searchQuery)}
              disabled={loadingFiles}
              title="Refresh Drive audio files"
              className="p-1.5 rounded border border-[#262B35] bg-[#1B1F26] hover:border-[#3B4454] text-[#94A3B8] hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              title="Disconnect Google Drive"
              className="p-1.5 rounded border border-[#262B35] bg-[#1B1F26] hover:border-red-800/70 text-[#94A3B8] hover:text-red-300"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadFiles(accessToken, searchQuery);
          }}
          className="relative"
        >
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audio in Drive..."
            className="w-full rounded-md border border-[#262B35] bg-[#0D0F12] pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
          />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loadingFiles && files.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#94A3B8]">Loading Drive audio...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#94A3B8] space-y-1">
            <p>No audio files matched your filter.</p>
            <p className="text-[11px] text-[#64748B]">
              Supports MP3, WAV, M4A, AAC, OGG, and FLAC files in Google Drive.
            </p>
          </div>
        ) : (
          files.map((file) => {
            const sizeLabel = formatFileSize(file.size);
            const ext = formatAudioExt(file.name, file.mimeType);
            const busyA1 = importingId === `${file.id}:A1`;
            const busyA2 = importingId === `${file.id}:A2`;
            const anyBusy = importingId !== null;
            return (
              <div
                key={file.id}
                className="rounded-md border border-[#262B35] bg-[#1B1F26] p-2.5 space-y-2 hover:border-[#3B4454] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#E2E8F0] truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] font-mono text-[#64748B]">
                      {ext}
                      {sizeLabel ? ` · ${sizeLabel}` : ''}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => void handleImport(file, 'A1')}
                    className="py-1 px-2 rounded bg-[#2563EB]/15 hover:bg-[#2563EB] text-[#60A5FA] hover:text-white text-[11px] font-medium transition-colors disabled:opacity-50"
                  >
                    {busyA1 ? 'Importing...' : '+ Track A1'}
                  </button>
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => void handleImport(file, 'A2')}
                    className="py-1 px-2 rounded border border-[#262B35] bg-[#14171C] hover:border-[#2563EB] text-[#CBD5E1] hover:text-white text-[11px] font-medium transition-colors disabled:opacity-50"
                  >
                    {busyA2 ? 'Importing...' : '+ Track A2'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
