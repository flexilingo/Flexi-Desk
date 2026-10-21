/** What the Add dialog accepts, and the small pure rules around it. */

export type AddKind = 'pdf' | 'image';

export const ADD_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const;

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** The kind of a file by its name (and MIME type when it has one); null when it is neither. */
export function addKindOf(name: string, mime?: string): AddKind | null {
  const ext = extensionOf(name);
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext in IMAGE_MIME || (mime && Object.values(IMAGE_MIME).includes(mime))) return 'image';
  return null;
}

/** The MIME type to give a photo read from disk, so the PDF converter picks lossy or lossless. */
export const imageMimeOf = (name: string) => IMAGE_MIME[extensionOf(name)] ?? 'image/jpeg';

/** The last segment of a path, on either separator. */
export const baseName = (path: string) => path.split(/[\\/]/).pop() || path;

/** A file the reader chose: from the picker (a path) or dropped (the bytes). */
export interface ChosenFile {
  name: string;
  /** Byte size; 0 when unknown (a photo from the picker, which is converted anyway). */
  size: number;
  kind: AddKind;
  path?: string;
  file?: File;
}
