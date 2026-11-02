import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const invalid = () => Object.assign(new Error('請選擇有效的 JPG、PNG 或 WebP 照片'), { status: 415 });
export async function storePhoto(bytes, directory) {
  if (bytes.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('照片不能超過 10 MB'), { status: 413 });
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  if (!jpeg && !png && !webp) throw invalid();
  let output;
  try {
    // Decode and re-encode instead of trusting the name or browser MIME type.
    // Auto-orient, limit dimensions, and discard camera/location metadata.
    output = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' })
      .rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
  } catch { throw invalid(); }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `${randomUUID()}.webp`;
  await writeFile(join(directory,name), output.data, { flag: 'wx', mode: 0o600 });
  return { src: `/images/uploads/${name}`, width: output.info.width, height: output.info.height };
}
