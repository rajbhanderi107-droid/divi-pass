# Divi Garba promo video

`divi-garba-promo.mp4` — 21 s vertical reel (1080×1920, 30 fps, H.264 + AAC) for Instagram / WhatsApp Status.

Scenes: mandala intro (નવરાત્રી ગરબા) → DIVI title with toran and diyas → garba dancers → 11–19 October with nine diyas → Solo / Couple pass cards → WhatsApp call to action. The music (dhol, dandiya, drone, flute) is synthesised by `music.py` and its hits land on the scene cuts.

## Change and re-render
1. Edit the `EVENT` block at the top of `divi-garba.html` (names, dates, prices, call to action). Open the file in a browser to preview it live; add `?t=15` to see one moment.
2. Render:
```
npm i --no-save playwright-core
CHROMIUM=/path/to/chrome node render.mjs frames 30
python3 music.py music.wav
ffmpeg -framerate 30 -i frames/f_%05d.png -i music.wav -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart divi-garba-promo.mp4
```
