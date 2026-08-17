# ghostlyactive.github.io

My portfolio — interactive installations, augmented reality and real-time 3D, alongside the
renderers and firmware I write on my own time.

**→ [ghostlyactive.github.io](https://ghostlyactive.github.io)**

A static site: plain HTML, CSS and a few hundred lines of JavaScript. No build step, no
dependencies, no framework. Clone it and open `index.html`.

## What is on it

- **Own builds** — seven projects with source on GitHub, each with its own page on how it works:
  a raycasting engine on an 8 KB microcontroller, a Commodore 64 rebuilt on an AMOLED panel, a
  telegraph driven by a single solenoid, two voxel engines, a DirectX 11 engine, a cartridge console.
- **Client work & experiments** — thirteen recorded projects: museum exhibits, AR on iPad, arcade
  games, virtual production in Unreal Engine.

## Structure

```
index.html                 Hero, own builds, client work & experiments, contact
projects/                  One page per repository
  ghost-pixel-lab.html
  ghost-engine-classic-2d.html
  ghost-morse-telegraph.html
  voxel-terraformer.html
  ghost-engine-3d.html
  voxel-pi.html
  ghost-station.html
assets/
  css/
    tokens.css             Design tokens — colours, type scale, spacing. Change here first.
    base.css               Reset, typography, accessibility helpers
    site.css               Landing-page components
    project.css            Project-page components
  js/video.js              YouTube facades, reduced-motion handling, deferred playback
  js/scenes.js             The two canvas backgrounds and the loop that drives them
  js/filter.js             Topic chips over the card grids, built from the cards themselves
  js/reveal.js             Fade-up on first scroll into view
  img/projects/            Stills and MP4 loops pulled from the project repositories
  img/video/               YouTube poster frames, one per video ID
  img/og-image.jpg         1200 × 630 link preview — see below
  apple-touch-icon.png     180 × 180, iOS home screen
  logo.svg                 Round jellyfish mark — nav logo and favicon
```

## Local preview

Every path in the project is relative, so opening `index.html` in a browser works. A server is
closer to production:

```bash
python3 -m http.server 4173
```

## Deploying to GitHub Pages

Name the repository **`GhostlyActive.github.io`**. GitHub treats a repo named `<username>.github.io`
as the account's user site and serves it at the bare `https://ghostlyactive.github.io/` — no
`/portfolio/` sub-path in the URL. Any other name works too and lands at
`https://ghostlyactive.github.io/<repo>/`; since no path here is absolute, nothing breaks either way.

```bash
git init -b main
git add .
git commit -m "feat: portfolio site"
git remote add origin git@github.com:GhostlyActive/GhostlyActive.github.io.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source: Deploy from a branch → `main` / `root`.**
The site is live a minute later. `.nojekyll` is present so Jekyll does not touch the files.

## Adding a video

Poster frames are stored in this repo, so nothing is requested from YouTube until someone clicks
play. Download the thumbnail, then drop a facade into the markup:

```bash
curl -L "https://i.ytimg.com/vi/<VIDEO_ID>/maxresdefault.jpg" -o assets/img/video/<VIDEO_ID>.jpg
```

```html
<button class="video" type="button" data-video-id="<VIDEO_ID>" data-video-title="Title">
  <img src="assets/img/video/<VIDEO_ID>.jpg" alt="Describe the frame" loading="lazy" decoding="async">
  <span class="video__play"><svg aria-hidden="true"><use href="#i-play"></use></svg></span>
  <span class="video__duration">1:23</span>
  <span class="visually-hidden">Play video: Title</span>
</button>
```

The client-work section shows the thirteen public videos from the channel. Unlisted ones do not
appear in the channel feed, so their IDs have to come from the share URL by hand.

## Media notes

The animated GIFs in the source repositories total about 54 MB. They are converted to H.264 MP4
here — twelve clips, 3 MB in total — each with a poster frame:

```bash
ffmpeg -i in.gif -movflags +faststart -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -crf 27 -preset slow -an out.mp4
ffmpeg -ss 3 -i out.mp4 -vframes 1 -q:v 5 out.jpg
```

Two rules govern how these clips play, both enforced in `video.js`:

**Reduced motion.** CSS cannot switch off an autoplaying video, so when
`prefers-reduced-motion: reduce` is set the script drops the autoplay and shows controls instead.
Any page with an autoplaying clip has to load the script, even one with no YouTube facades on it.

**Below the fold.** `autoplay` overrides `preload="none"`, so a clip far down the page would be
fetched on load whether or not anyone scrolls to it. Those use `data-play-in-view` instead and start
on an IntersectionObserver. The contact clip is the only one today; use the same attribute for any
future clip that is not near the top of its page.

The hero clip is `ghost-pixel-lab-flight.mp4`, 400 × 224 native and displayed around 434 px wide —
near enough to 1:1 to stay sharp. A larger source is fine; a smaller one will look soft.

## Link previews

`img/og-image.jpg` is what WhatsApp, LinkedIn, Slack and the rest show when someone posts the URL.
It is 1200 × 630 because those cards crop to roughly 1.91:1 — a portrait image loses everything but
a strip out of its middle. The background is the real terrain renderer, screenshotted out of a page
that loads `scenes.js`, so the preview and the hero show the same world.

The `og:` URLs are the only absolute paths on the site. Everything else is relative so the site
works from any sub-path, but a scraper has no document to resolve a relative path against, and a
good number of them drop the image without saying so.

Only `index.html` carries these tags. A shared project page falls back to its `<title>` and
description with no image.

## The canvas scenes

`scenes.js` draws a background behind two sections. A `<canvas data-scene="…">` inside a `.scene`
wrapper picks the renderer; both write into a pixel buffer at a third of the display size, which is
then scaled up with smoothing off.

**`terrain`** (hero) is the Comanche VoxelSpace algorithm — the same front-to-back column renderer
as VoxelPi and Outer Pixels. A seeded value-noise height map, a per-column occlusion array, camera
drift on a slow sine; the pointer steers yaw and horizon.

**`raycast`** (contact) is Wolfenstein's grid DDA, the algorithm underneath Ghost Engine Classic 2D.
The camera circles a cleared ring through a field of pillars, so no collision test is needed.
Y-facing walls are drawn darker — the original's stand-in for lighting.

Both take their **vertical scale from the buffer width, not its height**. The field of view is
horizontal, so scaling off the height stretches the world vertically on a tall phone canvas. For
the same reason `.scene` is only full-bleed once the layout has two columns; below that it is a band
along the bottom edge, which is a sane shape for a horizon.

Both pause when their section scrolls away or the tab is hidden, and under
`prefers-reduced-motion: reduce` a single frame is drawn and the loop never starts.

## Filtering and reveals

`filter.js` builds the chips above each grid from the `data-topics` on the cards, so the counts
cannot drift and a visitor without JavaScript gets the full grid instead of dead controls. Topics
are the coarse buckets worth filtering by; the tag row under each card stays free to carry detail
that would make a useless filter of its own (`TCP`, `IO-Link`, `avr_boot`).

`reveal.js` fades elements up the first time they scroll into view. The hidden state is behind the
`.js` class set by an inline script in `<head>`, so the page is never blank without JavaScript.

## The logo

`assets/logo.svg` is a round mark drawn after a reference photo of a jellyfish: magenta bell at the
top, oral arms and tentacles trailing down and out through the edge of a deep-blue disc. It is the
photograph redrawn rather than cropped, because a photo cutout turns to mush at 16 px — this stays
sharp as both the 34 px nav mark and the favicon. Everything is clipped to `circle(32 32 32)`, so
whatever leaves the disc is simply cut off.

`apple-touch-icon.png` is the same drawing without the circular clip, because iOS rounds the corners
itself and would fill a transparent margin with black. Both it and the share image are rendered from
the site's own markup with headless Chrome:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --window-size=1200,630 --screenshot=out.png file://$PWD/page.html
```

Colours are hard-coded, since a standalone SVG cannot read CSS custom properties. The mark is the
one place on the site that is not in the amber palette; if that ever has to match `tokens.css`, the
`bell` and `sea` gradients are what to change.
