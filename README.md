# LILVDVM — Portfolio

The portfolio website of **LILVDVM**, a Moroccan filmmaker and editor.

**Live site:** [www.lilvdvm.com](https://www.lilvdvm.com)

A dark, cinematic site built around the work: a full-screen showreel on the
home page, a ring of projects that open into films and stills, a photo wall,
a scroll-driven about page and a contact form.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Full-screen background showreel (a portrait cut on phones) |
| `works.html` | Projects on a rotating ring; each opens into its film, clips and stills |
| `gallery.html` | Photo wall in uneven columns; tap a photo to view it full screen |
| `infos.html` | About, told in four chapters over a film scrubbed by scrolling |
| `contact.html` | Contact details and a message form |

## Built with

No framework and no build step for the site itself: plain **HTML**, **CSS** and
**JavaScript**, served as static files.

- **[Lenis](https://github.com/darkroomengineering/lenis)** for smooth scrolling (bundled in `js/vendor/`)
- **[Web3Forms](https://web3forms.com)** to deliver contact-form messages
- **[Vercel](https://vercel.com)** for hosting; security headers and caching live in `vercel.json`

Media is prepared for the web ahead of time:

- **Images:** WebP (and AVIF for some work thumbnails) in several widths, picked per screen with `srcset`
- **Video:** H.264 MP4 in two sizes. Every screen gets the HD file unless the
  browser reports data saving or a slow line, and playback drops to the small
  file if HD is slow to start.
- **Fonts:** subset WOFF2

## Project layout

```
index.html, works.html, gallery.html, infos.html, contact.html
css/style.css            all styles
js/                      one script per feature (loader, nav, page slide,
                         cursor, works ring and project view, gallery wall,
                         infos sequence, contact form, video selection)
js/works-data.js         the projects: names, roles, media and sizes
js/gallery-data.js       the gallery photos and their image sizes
media/works/             project films, clips, stills and posters
pics/                    gallery photos, work thumbnails, posters, icons
video/                   home and infos films
fonts/                   web fonts
scripts/                 tools that build the media (not deployed)
vercel.json              headers and caching
```

## Run it locally

Any static file server works. The included one supports video seeking
(byte ranges), which the films need:

```sh
python dev-server.py
```

Then open <http://localhost:5173>. A different port can be passed as the first
argument.

## Updating media

The scripts in `scripts/` turn original files into the web versions. Originals
are only ever read, never changed, and they are kept out of the repository.

**Gallery photos** — put the photos in a folder (JPEG, PNG, WebP or iPhone HEIC)
and run:

```sh
pip install pillow pillow-heif
python scripts/build-gallery-pics.py "path/to/photos"
```

This writes the resized images to `pics/gallery/responsive/`, rewrites
`js/gallery-data.js`, and prints the photo list to paste into `PHOTOS` in
`js/gallery-wall.js` (whose order is the order on the page). Location and
camera metadata are not carried into the published images.

**Works and home films** — `scripts/build-works-media.py` and
`scripts/build-site-media.py` encode the films and stills from local masters.
They need [FFmpeg](https://ffmpeg.org):

```sh
python scripts/build-works-media.py --ffmpeg path/to/ffmpeg
python scripts/build-site-media.py --ffmpeg path/to/ffmpeg
```

After changing a script, stylesheet or data file, bump its `?v=` value where the
HTML links it, so browsers fetch the new copy instead of a cached one.

## Deployment

Every push to `main` is deployed to production by Vercel. Files listed in
`.vercelignore` (tooling, notes and this README) stay out of the deployed site.

## Rights

The code is shared for reference. The films, photographs, text and brand are
© LILVDVM, all rights reserved, and may not be reused. The typefaces are
licensed from their foundries and are included only to display this site; they
are not licensed for reuse.

