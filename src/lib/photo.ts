export interface ReaderConfig { url: string; token: string }
export interface PreparedPhoto { base64: string; mediaType: 'image/jpeg'; previewUrl: string }

const MAX_SIDE = 1600;

/** Shrink to ≤1600px JPEG so phone photos upload fast and stay under the server limit. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)); const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser cannot read photos');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not prepare the photo');
  const base64 = await new Promise<string>((res, rej) => {
    const fr = new FileReader(); fr.onerror = () => rej(new Error('Could not prepare the photo'));
    fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.readAsDataURL(blob);
  });
  return { base64, mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob) };
}

export class ReaderError extends Error { constructor(message: string, public status = 0) { super(message); } }

/** Ask the photo reader (your Cloudflare Worker) to turn a screenshot into text the parser understands. */
export async function readPhotoText(cfg: ReaderConfig, image: string, mediaType = 'image/jpeg', timeoutMs = 60_000): Promise<string> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-app-token': cfg.token }, body: JSON.stringify({ image, mediaType }) });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok) throw new ReaderError(res.status === 401 ? 'Wrong access code — check More → Photo reader.' : data.error ?? `Reader error (${res.status})`, res.status);
    return data.text ?? '';
  } catch (e) {
    if (e instanceof ReaderError) throw e;
    if ((e as Error).name === 'AbortError') throw new ReaderError('The reader took too long. Try again.');
    throw new ReaderError('Could not reach the reader. Check your internet and the link in More → Photo reader.');
  } finally { clearTimeout(t); }
}

/** Free check: a bad media type is rejected with 400 only AFTER the access code is accepted (401 = wrong code). */
export async function testReader(cfg: ReaderConfig): Promise<'ok' | 'wrong-code'> {
  try {
    await readPhotoText(cfg, 'x', 'text/plain', 15_000);
    return 'ok';
  } catch (e) {
    if (e instanceof ReaderError && e.status === 401) return 'wrong-code';
    if (e instanceof ReaderError && e.status === 400) return 'ok';
    throw e;
  }
}
