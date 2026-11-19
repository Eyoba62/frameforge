import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { MediaAsset } from '../src/types/editor.ts';
import { UPLOADS_DIR, probeMedia, registerAsset } from './storage.ts';

export class DriveApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

export async function listDriveAudioViaToken(
  token: string,
  searchQuery = ''
): Promise<DriveFileSummary[]> {
  const audioFilter =
    "(mimeType contains 'audio/' or fileExtension = 'mp3' or fileExtension = 'wav' or fileExtension = 'm4a' or fileExtension = 'aac' or fileExtension = 'ogg' or fileExtension = 'flac')";
  const safeSearch = searchQuery.trim().replace(/['\\]/g, '');
  const q = safeSearch
    ? `trashed = false and ${audioFilter} and name contains '${safeSearch}'`
    : `trashed = false and ${audioFilter}`;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', '40');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  url.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime)');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw new DriveApiError(
      401,
      'Google Drive token expired or lacks drive.readonly/drive permission.'
    );
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new DriveApiError(res.status, `Google Drive list failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

export async function importDriveAudioAsset(params: {
  token: string;
  fileId: string;
  fileName?: string;
  mimeType?: string;
}): Promise<MediaAsset> {
  const { token, fileId } = params;
  let resolvedName = params.fileName?.trim();
  let resolvedMime = params.mimeType?.trim();

  // Auto-fetch metadata from Drive if fileName or mimeType wasn't supplied (e.g. Code.gs passing only fileId)
  if (!resolvedName || !resolvedMime) {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (metaRes.status === 401 || metaRes.status === 403) {
      throw new DriveApiError(
        401,
        'Google Drive token expired or unauthorized. Ensure the token has Drive permission.'
      );
    }
    if (metaRes.ok) {
      const meta = await metaRes.json().catch(() => ({}));
      if (!resolvedName && typeof meta.name === 'string') resolvedName = meta.name;
      if (!resolvedMime && typeof meta.mimeType === 'string') resolvedMime = meta.mimeType;
    }
  }

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (driveRes.status === 401 || driveRes.status === 403) {
    throw new DriveApiError(
      401,
      'Google Drive token expired or unauthorized. Please sign in or authorize Drive access.'
    );
  }

  if (!driveRes.ok) {
    const errText = await driveRes.text().catch(() => '');
    throw new DriveApiError(
      driveRes.status,
      `Failed to download Drive audio (${driveRes.status}): ${errText.slice(0, 200)}`
    );
  }

  const safeOriginal = path.basename(resolvedName || 'drive-audio.mp3');
  const rawExt = path.extname(safeOriginal);
  const fallbackExt =
    resolvedMime && resolvedMime.includes('wav')
      ? '.wav'
      : resolvedMime && resolvedMime.includes('mp4')
        ? '.m4a'
        : resolvedMime && resolvedMime.includes('ogg')
          ? '.ogg'
          : resolvedMime && resolvedMime.includes('flac')
            ? '.flac'
            : '.mp3';
  const ext = rawExt || fallbackExt;
  const storedFilename = `drive-${uuidv4().slice(0, 8)}${ext}`;
  const filePath = path.join(UPLOADS_DIR, storedFilename);

  const arrayBuffer = await driveRes.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

  const probed = await probeMedia(filePath).catch(() => ({
    duration: 5,
    width: undefined,
    height: undefined,
    hasAudio: true,
    hasVideo: false,
  }));

  return registerAsset({
    id: `drive-${uuidv4().slice(0, 8)}`,
    name: safeOriginal,
    type: 'audio',
    source: 'google-drive',
    url: `/media/uploads/${storedFilename}`,
    duration: probed.duration || 5,
    mimeType: resolvedMime || 'audio/mpeg',
    createdAt: new Date().toISOString(),
  });
}
