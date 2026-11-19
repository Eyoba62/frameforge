import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function initDriveAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function googleSignInForDrive(): Promise<{
  user: User;
  accessToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in completed without returning a Drive access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getDriveAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearDriveAccessToken(): void {
  cachedAccessToken = null;
}

export async function logoutDrive(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}

export interface DriveAudioFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Google Drive session expired. Please sign in again.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

export async function listDriveAudioFiles(
  accessToken: string,
  searchQuery = ''
): Promise<DriveAudioFile[]> {
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new DriveAuthExpiredError();
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Google Drive request failed (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}
