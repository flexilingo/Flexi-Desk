import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { imageToPdf } from '@/pages/reader/lib/image-to-pdf';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 3000, height: 1500, close: vi.fn() })),
  );
  const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob([JPEG_BYTES], { type: 'image/jpeg' })));
  // PNG goes down the lossless path only where CompressionStream exists.
  vi.stubGlobal('CompressionStream', undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('imageToPdf', () => {
  it('wraps a photo in a one-page PDF with a correct header and cross-reference table', async () => {
    const pdf = await imageToPdf(new File([JPEG_BYTES], 'page one.jpg', { type: 'image/jpeg' }));
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.name).toBe('page one.pdf');

    const bytes = await readBytes(pdf);
    const text = latin1(bytes);
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Pages /Kids [3 0 R] /Count 1');
    expect(text).toContain('/Filter /DCTDecode');

    // 3000 x 1500 px at 300 DPI = 720 x 360 pt.
    expect(text).toContain('/MediaBox [0 0 720.00 360.00]');

    // startxref points at the table, and every entry points at its object.
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(5);
    entries.forEach((offset, i) => {
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    expect(text).toContain('xref\n0 6\n0000000000 65535 f \n');
    expect(text).toContain('/Size 6 /Root 1 0 R');
  });

  it('shrinks a very large photo to the 4096 px limit, keeping its shape', async () => {
    (createImageBitmap as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ width: 8192, height: 4096, close: vi.fn() });
    const pdf = await imageToPdf(new File([JPEG_BYTES], 'big.png', { type: 'image/png' }));
    const text = latin1(await readBytes(pdf));
    expect(text).toContain('/Width 4096 /Height 2048');
  });

  it('rejects when the photo cannot be decoded', async () => {
    (createImageBitmap as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad'));
    await expect(imageToPdf(new File([JPEG_BYTES], 'x.jpg', { type: 'image/jpeg' }))).rejects.toThrow();
  });
});
