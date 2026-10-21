/* global CompressionStream */
/**
 * A photo, turned into a one-page PDF before it is stored on this computer.
 *
 * A photo used to go its own way: OCR pulled the text out and the reader got
 * that text back as plain paragraphs, with the picture itself thrown away. A
 * scanned book page does not work like that. It stays exactly as printed, and
 * the OCR words are laid over it (`reader_pages.ocr_words`), so every word is
 * tappable right where it sits on the page. A photo is a scanned page too, so
 * wrapping it as a one-page PDF gives it that same view. Storage and the
 * text layer are the ones a PDF already uses.
 *
 * No PDF library: one page holding one image is five objects, written below.
 */

/**
 * Scanned pages are rendered at 300 DPI for OCR (the website's worker uses the
 * same figure). Sizing the page so the photo's own pixels come out at 300 DPI
 * means OCR reads it at its native resolution, with no resampling either way.
 * The viewer fits the page to the screen width, so its size in points never
 * shows.
 */
const OCR_DPI = 300;

/**
 * Longest side, in px. Beyond this a phone photo only makes OCR slower, and
 * iOS Safari refuses a canvas over about 16.7 million pixels.
 */
const MAX_SIDE = 4096;

type ImageStream = { data: Uint8Array<ArrayBuffer>; filter: 'DCTDecode' | 'FlateDecode' };

export async function imageToPdf(file: File): Promise<File> {
  // `from-image`: a phone photo stands the way it was taken. Its EXIF rotation
  // would be lost if the JPEG were copied into the PDF as it is.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('canvas unavailable');
  }
  // White under a transparent PNG. The PDF image has no alpha channel, and
  // transparent pixels would otherwise come out black, hiding black text.
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // A photo is JPEG already, so one more pass at high quality costs nothing
  // visible. A screenshot is usually PNG, with small sharp type, and OCR
  // struggles on those as it is. JPEG artefacts would make that worse, so the
  // pixels go in losslessly.
  const lossless = file.type !== 'image/jpeg' && typeof CompressionStream !== 'undefined';
  const image = lossless ? await flateStream(ctx, width, height) : await jpegStream(canvas);

  const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.pdf`;
  return new File(pdfParts(image, width, height), name, { type: 'application/pdf' });
}

async function jpegStream(canvas: HTMLCanvasElement): Promise<ImageStream> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('could not encode the photo');
  return { data: new Uint8Array(await blob.arrayBuffer()), filter: 'DCTDecode' };
}

/** Raw RGB, zlib-deflated, which is exactly what PDF's FlateDecode reads. */
async function flateStream(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): Promise<ImageStream> {
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  const deflated = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
  return {
    data: new Uint8Array(await new Response(deflated).arrayBuffer()),
    filter: 'FlateDecode',
  };
}

/** A PDF 1.4 file, one page covered by the one image, as parts ready for a `File`. */
function pdfParts(image: ImageStream, width: number, height: number): Uint8Array<ArrayBuffer>[] {
  const w = ((width * 72) / OCR_DPI).toFixed(2);
  const h = ((height * 72) / OCR_DPI).toFixed(2);
  const encoder = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const offsets: number[] = [];
  let length = 0;

  const write = (chunk: string | Uint8Array<ArrayBuffer>) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (body: string) => {
    offsets.push(length);
    write(`${offsets.length} 0 obj\n${body}\nendobj\n`);
  };
  const stream = (dict: string, data: Uint8Array<ArrayBuffer>) => {
    offsets.push(length);
    write(`${offsets.length} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`);
    write(data);
    write('\nendstream\nendobj\n');
  };

  // The second line's high bytes mark the file as binary for anything that
  // would otherwise treat it as text.
  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object('<< /Type /Catalog /Pages 2 0 R >>');
  object('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
  );
  stream(
    `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter}`,
    image.data,
  );
  stream('', encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`));

  // Every cross-reference entry is exactly 20 bytes, its line break included.
  const xref = length;
  write(
    `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n` +
      offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') +
      `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  return parts;
}
