// IndexedDB store for the photos the puzzles are made from. They never leave the device.
// Camera photos are downscaled to a JPEG first so a dozen of them stay small.

const DB_NAME = 'snap_puzzle';
const STORE = 'puzzle_photos';
const MAX_PHOTOS = 12;
const MAX_EDGE = 1280;

export interface PuzzlePhoto {
  id: string;
  createdAt: number;
  width: number;
  height: number;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Allow a retry later if opening failed
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
};

const run = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

/** Saved photos, newest first */
export const listPhotos = async (): Promise<PuzzlePhoto[]> => {
  try {
    const all = await run<PuzzlePhoto[]>('readonly', (store) => store.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.error('Failed to list photos', e);
    return [];
  }
};

export const deletePhoto = async (id: string): Promise<void> => {
  try {
    await run('readwrite', (store) => store.delete(id));
  } catch (e) {
    console.error('Failed to delete photo', id, e);
  }
};

/** Decodes a camera/gallery file, shrinks it to MAX_EDGE as a JPEG, and saves it */
export const addPhoto = async (file: Blob): Promise<PuzzlePhoto> => {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that picture'));
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  // naturalWidth/Height already account for EXIF rotation in current browsers
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save picture'))), 'image/jpeg', 0.85)
  );

  const photo: PuzzlePhoto = {
    id: `photo_${Date.now()}`,
    createdAt: Date.now(),
    width,
    height,
    blob,
  };

  // Still playable this session even if saving fails
  try {
    await run('readwrite', (store) => store.put(photo));
    const all = await listPhotos();
    for (const old of all.slice(MAX_PHOTOS)) await deletePhoto(old.id);
  } catch (e) {
    console.error('Failed to save photo', e);
  }
  return photo;
};
