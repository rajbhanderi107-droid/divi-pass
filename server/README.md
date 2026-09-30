# Photo reader (optional server)

Lets the app's **Add from photo** button read a WhatsApp or payment screenshot with Claude.
It is a tiny Cloudflare Worker: it checks your access code, sends the photo to Claude, and returns the text.
The app then fills the sale form with its normal parser, and you check and tap Save.

Cost: roughly ₹1 per photo (one image in, a few lines out). Nothing is stored on the server.

## One-time setup (about 10 minutes)
You need a free Cloudflare account and an Anthropic API key (console.anthropic.com).

```
cd server
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY     # paste your Anthropic key
npx wrangler secret put APP_TOKEN             # choose a long random access code, e.g. 20+ characters
npx wrangler deploy                           # prints https://divi-pass-photo-reader.<you>.workers.dev
```

Optional: in `wrangler.toml` set `ALLOWED_ORIGIN` to your site (for example `https://rajbhanderi107-droid.github.io`) and deploy again, so only your site can call it.

Then in the app: **More → Photo reader** → paste the link and the access code → **Test connection** → **Save**.

## Safety
- The Anthropic key lives only in Cloudflare secrets, never in the app.
- Anyone without the access code gets a 401 and costs you nothing.
- Set a monthly spend limit on your Anthropic account.

## Develop
`npm run typecheck` here, and `npm test` at the repo root runs the worker's checks.
