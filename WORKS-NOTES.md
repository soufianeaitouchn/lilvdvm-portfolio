# WORKS media and loading

All ten projects remain in the portfolio. The original source files remain untouched.

## Findings

- The four reported projects used the same delegated click handler as TOURJOS. Their source paths, capitalization and extensions matched the local files, including `HENSEI_YOUTUBE.mov.mp4`.
- AKIDOUR, HBIBA, STYLE RARE and ILBADE used 3840×2880 masters at approximately 10, 64, 72 and 15 Mbps. The working TOURJOS comparison is 960×720 at 1.3 Mbps.
- Project opening replaced a small thumbnail with a large BMP and sought into the master. Playback was marked ready before it actually started; rejected play promises were hidden. AKIDOUR's requested starting point was near the end of its film.
- All source media lived under ignored `portfolio/`; those files were not tracked for deployment.
- Supporting project media was not rendered. The client label was hardcoded across projects, and callbacks from old videos could run after switching projects.
- Most thumbnails had already been distorted to 640×360, including 4:3 originals. CSS already specified `object-fit: cover`; regenerating the files at their original aspect ratio fixes the actual image distortion.

## Current behavior

- `js/works-data.js` is the explicit manifest for IDs and media. Both strip copies use the same stable IDs.
- Grid loading requests nearby small WebP thumbnails only. No project videos or BMPs load on entry.
- A tap immediately opens the existing rectangle animation. Only the selected project's short, muted preview starts. Its WebP stays visible until a real `playing` event.
- Full films and additional videos get a source only when their tile is visible; images load within 250 pixels of the dialog viewport. Full films use native playback controls. Inactive videos pause, and offscreen videos release their source.
- Failed images/videos offer local recovery. Autoplay rejection offers a play button. BACK, Escape and project navigation work independently of media readiness.
- Closing releases listeners, observers, timers and videos and restores the strip without reloading the page.
- Rectangles retain their geometry, spacing and animation. Thumbnails use centered `object-fit: cover` and retain source proportions.
- Responsive WebP and AVIF candidates are generated directly from originals with Lanczos resizing, never upscaled. Browsers that support AVIF select it through `picture`, with WebP as the fallback. Grid sources use `srcset` with a 960-pixel budget (480 on constrained connections); the slot calculation accounts for the height cropped by `object-fit: cover`. Detail images select 480–2400-pixel candidates for their displayed width, with density capped at 1.5×. Offscreen candidates have neither `src` nor `srcset` until needed.
- Fullscreen stills can select up to 1920 pixels. The current grid image remains during the rectangle animation; a larger still is requested only if playback has not started when expansion finishes. Hidden hero posters do not download behind playing video.
- Desktop video can select an H.264 version up to 1920×1080 when the viewport is at least 1000 pixels wide and bandwidth is known to be at least 6 Mbps. Phones, Save-Data, slower connections, and unknown bandwidth use the smaller version. Browsers without Network Information use completed media transfer timings, without a probe download. A four-second HD playback stall or HD request failure falls back to the small source and retains playback position.

## Build and deploy

Deploy `works.html`, `css/style.css`, the JavaScript files, **`pics/works/thumbs/` and `media/works/`** together. The generated media is not ignored by Git. There is no runtime dependency on `portfolio/`, Python or FFmpeg.

Regenerate from local originals with Pillow and FFmpeg:

```sh
python scripts/build-works-media.py --ffmpeg /path/to/ffmpeg
```

The build is incremental. `--refresh-images` regenerates images only; `--force` regenerates everything. A local recipe stamp rebuilds media after encoder settings change. It also detects and repairs existing images whose proportions differ from their source. Videos use H.264 Main, yuv420p, AAC for full films, and MP4 faststart. The medium encoder preset improves compression efficiency over the previous veryfast exports. Current encoder ceilings are 1.2 Mbps for small previews, 2 Mbps for small films, 4 Mbps for HD previews and 5 Mbps for HD films; content-dependent CRF encoding usually produces lower average rates. Source resolution and display aspect ratio are preserved, including non-square source pixels; nothing is upscaled during encoding. AVIF generation works with Pillow alone. Videos use the broadly supported H.264 path; the build does not generate WebM.

Production hosting should serve MP4 as `video/mp4`, support byte ranges (`206`), and cache media. Upload changed thumbnails with cache invalidation if the host uses long-lived caching. `dev-server.py` supports ranges for local testing.

## Verification

```sh
node verify-works.mjs
```

Requires Puppeteer (already available in this workspace). The test checks exact-case asset paths for every responsive candidate, MP4 faststart, zero initial video requests, grid image byte budgets, centered cover images and aspect ratios, HD selection and decoded resolution, every project's desktop/mobile opening and playback, lazy details, failure recovery, autoplay rejection, rapid switching, tap jitter and swipes. Network cases emulate 750 kbps with 300 ms latency and check slow-desktop/Save-Data selection and a deliberately stalled HD request. Browser mobile emulation is not a physical iPhone/Safari test.


## September 2026 delivery refinements

- Added 720-pixel Works thumbnails, 960-pixel posters, and 800/1200-pixel detail candidates, directly from the masters. Existing larger candidates remain available for sharper desktop displays.
- Unknown video bandwidth defaults to the small preview. HD needs 6 Mbps of reported/measured capacity; bandwidth samples are cached instead of rescanned for each image. Unknown image bandwidth retains the normal responsive quality budget.
- AVIF candidates are assigned before the WebP fallback, and failed thumbnail fallbacks survive resize. Constrained film posters are capped at 640 pixels. Project videos release their source when the document is hidden, and the visible hero resumes at its saved position on return.
- Gallery pictures now use WebP candidates from 320 to 2400 pixels, generated from `portfolio/selected pics`. The viewer selects the fitted size and requests more detail after zooming or resizing settles. Grid thumbnails remain lazy; gallery films load only after an item is opened.
- Homepage/gallery films are encoded from the masters in H.264 with faststart, original frame rates, square pixels, and no upscaling. HD exports use a 1920-pixel long edge and a 4 Mbps ceiling; small exports use a 960-pixel long edge and a 1 Mbps ceiling. The smaller statement reel stays at 960 pixels (2 Mbps HD ceiling). Gallery audio uses 128 kbps AAC; decorative homepage videos have no audio track.
- The statement reel has no video or poster URL until it enters view. The homepage hero pauses outside the viewport and in background tabs.

Build the gallery and homepage assets with `python scripts/build-site-media.py --ffmpeg /path/to/ffmpeg`. Deploy all HTML/JS changes, `pics/gallery/responsive/`, `pics/works/thumbs/`, `media/works/`, and the `video/` delivery files together. Source masters remain local and untouched. The site build uses per-file recipe/source stamps in `.tools/site-media/`; `--force` rebuilds all outputs.

`npm test` runs the tracked media-delivery checks (requires the Puppeteer dev dependency). It covers unknown/slow/fast connections, gallery responsive selection and zoom, zero gallery-video grid requests, deferred statement media, offscreen hero pause, and zero Works startup video requests. The existing local `verify-works.mjs` additionally checks all projects on mobile/desktop and throttled playback. Browser emulation does not replace physical Safari/device testing.
