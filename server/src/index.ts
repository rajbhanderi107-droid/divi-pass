import Anthropic from '@anthropic-ai/sdk';

interface Env { ANTHROPIC_API_KEY: string; APP_TOKEN: string; ALLOWED_ORIGIN: string }

const MODEL = 'claude-opus-5-5';
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_B64 = 6_000_000; // ~4.5 MB image

const SYSTEM = `You transcribe screenshots for a pass-sales register. Reply with plain text only: no commentary, no markdown.

Screenshot kinds and the exact output format:
1) WhatsApp message about a pass sale. Copy the buyer's lines exactly, one per line, keeping the labels the sender used, e.g.
Name : niyati patel
Pass : 2 solo
No : 9913803737
Date : 16th october Friday
Skip chat timestamps, read ticks, contact names, and the quoted header ("Divya Achariya Divi Pass", "Photo").
The message may show a small payment screenshot at its top (a quoted photo). If its rupee amount is clearly legible, add a final line with just the amount, e.g. ₹1,300. Add "Paid to <name>", the date and "UPI transaction ID <digits>" only if every character is clearly legible at that size; otherwise leave those lines out. Never guess from a tiny thumbnail.
2) UPI payment card (Google Pay, PhonePe, Paytm, bank app). Output exactly:
₹<amount>
Paid to <name>          (or "Received from <name>" when the card says received / from)
<date and time exactly as shown>
UPI transaction ID <the 12-digit UTR/UPI reference, digits only>
Skip ads and buttons (Pay again, Check balance, payment tune, etc).

If a screenshot holds several messages or payment cards, output each one, separated by one blank line, top to bottom.
Copy digits exactly. Never guess a digit: if a number is unreadable, write ? in its place.
If the image contains neither kind, output nothing.`;

function cors(env: Env, extra: Record<string, string> = {}) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'content-type, x-app-token',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    ...extra,
  };
}
const json = (env: Env, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: cors(env, { 'content-type': 'application/json' }) });

// Constant-time-ish compare so the token can't be guessed byte by byte.
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (req.method !== 'POST') return json(env, 405, { error: 'POST only' });
    if (!env.APP_TOKEN || !same(req.headers.get('x-app-token') ?? '', env.APP_TOKEN)) return json(env, 401, { error: 'Wrong access code' });

    let body: { image?: unknown; mediaType?: unknown };
    try { body = await req.json(); } catch { return json(env, 400, { error: 'Bad request' }); }
    const image = typeof body.image === 'string' ? body.image : '';
    const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
    if (!image || image.length > MAX_B64 || !TYPES.has(mediaType)) return json(env, 400, { error: 'Send one JPEG/PNG/WebP photo under 4 MB' });

    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: image } },
            { type: 'text', text: 'Transcribe this screenshot.' },
          ],
        }],
      });
      if (res.stop_reason === 'refusal') return json(env, 422, { error: 'The photo could not be read' });
      const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
      return json(env, 200, { text });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json(env, 429, { error: 'Too many photos at once — try again in a minute' });
      if (e instanceof Anthropic.AuthenticationError) return json(env, 500, { error: 'Server key is wrong — check ANTHROPIC_API_KEY' });
      if (e instanceof Anthropic.APIError) return json(env, 502, { error: 'Reader is unavailable right now' });
      return json(env, 500, { error: 'Something went wrong' });
    }
  },
};
