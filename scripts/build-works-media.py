"""Build deployable WORKS assets without changing the ignored camera masters.

Usage: python scripts/build-works-media.py --ffmpeg /path/to/ffmpeg
Requires Pillow. Outputs are incremental; use --force after editing sources.
"""
import argparse
import concurrent.futures
import json
import random
import re
from pathlib import Path
import subprocess
import urllib.request

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ('avision-lab', 'AVISION LAB', '3D', 'avision lab lab lab lab @.mp4', 15.04),
    ('akidour', 'AKIDOUR', 'akidour @', 'x1.mp4', 58.76),
    ('monologue', 'MONOLOGUE', 'anass @', 'teaser.mp4', 44.36),
    ('hbiba', 'HBIBA', 'aya manfalouti @', 'Aya_Habibi_Final_Youtube.mp4', 75.24),
    ('ayrica', 'AYRICA', 'ayrica @', 'mv.mp4', 24.08),
    ('style-rare', 'STYLE RARE', 'hensi @', 'HENSEI_YOUTUBE.mov.mp4', 44.92),
    ('ilbade', 'ILBADE', 'ilbade @', '22222222.mp4', 9.32),
    ('jordan', 'JORDAN', 'JORDAN @', 'i know.mp4', 60.80),
    ('ryukk', 'RYUKK', 'REEL RYUUK @', 'final 01.mp4', 10.36),
    ('tourjos', 'TOURJOS', 'TOURJOS', 'X1.mp4', 3.68),
]
RECTANGLE_IMAGE_ROOT = ROOT / 'portfolio/works/images'
# What a project is called on the page, where that differs from the name of the
# folder it is built out of. The folder name stays as it is: it is how the
# footage and the rectangle image are found on disk, and renaming a project
# should not mean renaming the shoot it came from.
TITLES = {
    'avision-lab': 'DIGITAL STREETS',
    'ayrica': 'PINK KITCH',
    'ilbade': 'THE LAND OF DRAA',
    'jordan': 'iKNOW',
    'ryukk': 'TICHKA',
    'tourjos': 'SUNDAY',
}
# The lines either side of each title: the client and year above it, the role
# beneath. Anything a project does not name here it keeps from the words the
# overlay itself ships with.
CREDITS = {
    'avision-lab': {'client': 'AVISION LAB', 'role': '3D'},
    'monologue': {'client': 'FERTACHA', 'role': 'DIRECTION, DOP AND EDIT'},
    'akidour': {'client': 'AKIDOUR'},
    'hbiba': {'role': 'DIRECTION, DOP AND EDIT'},
    'ilbade': {'client': 'ILBADE'},
    'ayrica': {'client': 'AYRICA', 'role': 'EDIT AND VFX'},
    'style-rare': {'client': 'HENSI', 'role': 'DIRECTION, DOP AND EDIT'},
    'jordan': {'client': 'JORDAN ANDREW', 'year': '2025'},
    'ryukk': {'client': 'RYUKK', 'role': 'SHOOT AND EDIT'},
    'tourjos': {'client': 'TROJAN', 'role': 'EDIT AND VFX'},
}
# Projects whose full film is published on YouTube, and plays from there
# rather than from a copy of it served beside the rest of the media.
YOUTUBE = {'hbiba': 'nR5tNHMMPgI', 'jordan': 'NK3F4HZHXKc',
           'style-rare': 'UbogM8DCEqc', 'tourjos': 'v5ij04A_iQo'}
# Projects whose detail media is a folder of stills and short silent clips,
# laid out as alternating pairs down two balanced columns.
PICS_PAIRS = {'akidour', 'avision-lab', 'ayrica', 'hbiba', 'ilbade',
              'monologue', 'ryukk', 'style-rare', 'tourjos'}
# Tiles put somewhere particular by hand, after the balancer above has had
# its say. Each one reads: this file, in this column, directly under that
# one. Everything else keeps the place it was dealt.
PLACED = {
    # A placement with no 'under' simply goes first, directly below the
    # film at the top of the page.
    'hbiba': [{'file': 'pics-4.mp4', 'column': 'left'}],
    'style-rare': [
    {'file': 'Still0111.webp', 'column': 'left', 'under': 'pics-1.mp4'},
    # Its other crop follows it. The two are the same frame of film, and
    # they also have to share a column for the grid to come out even: the
    # eleven four-by-three tiles cannot be split around a wide one in each
    # column without leaving five hundred pixels of slack somewhere.
    {'file': 'Still011.webp', 'column': 'left', 'under': 'Still0111.webp'},
    ],
}
# Frames pulled out of the detail clips to stand in as their posters. Cached
# outside the deployed tree: they are an input to the build, not an asset.
POSTER_FRAMES = ROOT / '.tools/poster-frames'
# Covers fetched from YouTube, cached the same way and for the same reason.
YOUTUBE_COVERS = ROOT / '.tools/youtube'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--refresh-images', action='store_true', help='Rebuild images while keeping encoded videos')
    args = parser.parse_args()
    jobs = []
    projects = []
    recipe = 'responsive-v4-quality'
    stamp = ROOT / '.tools/works-media-recipe.txt'
    rebuild = args.force or not stamp.exists() or stamp.read_text() != recipe

    def image(source, dest, size, quality, image_format='WEBP'):
        target = ROOT / dest
        target.parent.mkdir(parents=True, exist_ok=True)
        distorted = False
        if target.exists():
            with Image.open(source) as original, Image.open(target) as existing:
                distorted = abs(original.width / original.height - existing.width / existing.height) > 0.01
        if not target.exists() or rebuild or args.refresh_images or distorted:
            with Image.open(source) as im:
                im = ImageOps.exif_transpose(im).convert('RGB')
                im.thumbnail(size, Image.Resampling.LANCZOS)
                if image_format == 'AVIF':
                    im.save(target, 'AVIF', quality=quality, speed=6)
                else:
                    im.save(target, 'WEBP', quality=quality, method=6)
        with Image.open(target) as im:
            return {'type': 'image', 'src': dest, 'width': im.width, 'height': im.height}

    def image_set(source, stem, widths, quality=82):
        with Image.open(source) as original:
            source_width = ImageOps.exif_transpose(original).width
        candidates = []
        for width in sorted(set(min(width, source_width) for width in widths)):
            candidates.append(image(source, stem + '-' + str(width) + '.webp', (width, 10000), quality))
        return candidates

    def avif_image_set(source, stem, widths, quality=55):
        with Image.open(source) as original:
            source_width = ImageOps.exif_transpose(original).width
        candidates = []
        for width in sorted(set(min(width, source_width) for width in widths)):
            candidates.append(image(source, stem + '-' + str(width) + '.avif',
                                    (width, 10000), quality, 'AVIF'))
        return candidates

    def video(source, dest, start=None, hd=False):
        target = ROOT / dest
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or (rebuild and not args.refresh_images):
            jobs.append((source, target, start, hd))

    def video_size(source):
        """The shape the film is shown at, so a tile can be cut to it.

        Taken from the display aspect where the file states one, because a
        master with non-square pixels does not show at the shape its pixel
        count suggests - and the encoder squares them up on the way out.
        """
        probe = subprocess.run([args.ffmpeg, '-hide_banner', '-i', str(source)],
                               capture_output=True, text=True, errors='replace')
        display = re.search(r'DAR (\d+):(\d+)', probe.stderr)
        if display:
            return {'width': int(display[1]), 'height': int(display[2])}
        pixels = re.search(r'Video:.*?(\d{2,5})x(\d{2,5})', probe.stderr)
        return {'width': int(pixels[1]), 'height': int(pixels[2])} if pixels else {}

    def video_poster(source, stem, widths=(480, 800, 960, 1200, 1600)):
        """A still lifted out of the clip itself, for the tile to hold.

        Every detail video is built with preload="none" and only takes a source
        once the reader has scrolled it into view. Until that happens the
        element has nothing to paint, and an empty <video> paints its CSS
        background - a flat #151515 rectangle where the work should be. A
        poster is what the tile shows in the meantime, so the frame is the
        film's own rather than a hole in the page.

        The frame is pulled a fraction of a second in: the first frame of a cut
        is often still the black it faded up from.
        """
        POSTER_FRAMES.mkdir(parents=True, exist_ok=True)
        frame = POSTER_FRAMES / (stem.replace('/', '__') + '.jpg')
        if not frame.exists() or rebuild:
            for seek in ('0.25', None):
                command = [args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
                           '-threads', '1']
                if seek:
                    command += ['-ss', seek]
                # Scaled down as it is decoded, and never upscaled. Several of
                # these masters are 4K, and holding a frame of one at full size
                # is more memory than this machine reliably has to give - the
                # 2160x2700 one fails outright above this width. 1600 is also
                # the largest the poster is ever written at below, so nothing
                # is lost by drawing the line here.
                command += ['-i', str(source), '-frames:v', '1', '-an',
                            '-vf', "scale=w='min(1600,iw)':h=-2,format=yuvj420p",
                            '-q:v', '2', str(frame)]
                subprocess.run(command, check=False)
                if frame.exists():
                    break
            if not frame.exists():
                raise RuntimeError('No poster frame could be read from ' + str(source))
        return {'poster': image(frame, stem + '-poster.webp', (1600, 1200), 82)['src'],
                'posterAvif': image(frame, stem + '-poster.avif', (1600, 1200), 72, 'AVIF')['src'],
                'posterSources': image_set(frame, stem + '-poster', widths),
                'posterAvifSources': avif_image_set(frame, stem + '-poster', widths, 72)}

    def youtube_cover(video_id, stem, widths=(480, 800, 960, 1280)):
        """The film's own cover, as YouTube publishes it.

        The tile shows this until somebody presses play, so it is fetched once
        at build time and written out beside the rest of the media rather than
        hotlinked from i.ytimg.com. Nothing reaches YouTube until the reader
        actually asks for the film, and the cover is served at the same sizes,
        in the same format, over the same connection as every other picture on
        the page.

        maxresdefault is the full-size cover the channel uploaded - the one a
        viewer sees on YouTube itself, title and all.
        """
        YOUTUBE_COVERS.mkdir(parents=True, exist_ok=True)
        cover = YOUTUBE_COVERS / (video_id + '.jpg')
        if not cover.exists():
            request = urllib.request.Request(
                'https://i.ytimg.com/vi/' + video_id + '/maxresdefault.jpg',
                headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=30) as response:
                cover.write_bytes(response.read())
        return {'poster': image(cover, stem + '.webp', (1280, 720), 82)['src'],
                'posterSources': image_set(cover, stem, widths)}

    def youtube_item(slug, title, base):
        """The published film, as a tile: its own cover and a play button."""
        video_id = YOUTUBE[slug]
        return {'type': 'youtube', 'videoId': video_id, 'layout': 'full',
                'label': title + ' — full film',
                **youtube_cover(video_id, base + '/youtube-' + video_id)}

    for slug, name, folder, filename, start in SOURCES:
        # name is how things are found on disk; title is what the page says.
        title = TITLES.get(slug, name)
        directory = ROOT / 'portfolio/works' / folder
        source = directory / filename
        # The frame the project's poster is cut from. Normally it sits beside
        # the film; look deeper only when it does not, so that the projects
        # with several of them keep picking the same one as before.
        still = next(directory.glob('*.bmp'), None) or next(directory.rglob('*.bmp'), None)
        if still is None:
            raise RuntimeError('No still to cut a poster from in ' + str(directory))
        rectangle_directory = RECTANGLE_IMAGE_ROOT / name
        rectangle_sources = sorted(rectangle_directory.glob('*.bmp'))
        if len(rectangle_sources) != 1:
            raise RuntimeError('Expected exactly one rectangle image for ' + name)
        rectangle_source = rectangle_sources[0]
        base = 'media/works/' + slug
        asset_stem = 'pics/works/thumbs/' + slug + ('-v2' if slug == 'tourjos' else '')
        thumb_path = asset_stem + '.webp'
        thumb = thumb_path
        rectangle_dimensions = image(rectangle_source, thumb_path, (480, 480), 80)
        thumbnail_sources = image_set(rectangle_source, asset_stem, (480, 720, 960, 1440), 80)
        thumbnail_avif_path = asset_stem + '.avif'
        thumbnail_avif = thumbnail_avif_path
        image(rectangle_source, thumbnail_avif_path, (480, 480), 55, 'AVIF')
        thumbnail_avif_sources = avif_image_set(rectangle_source, asset_stem, (480, 720, 960, 1440), 66)
        poster = base + '/poster.webp'
        dimensions = image(still, poster, (1280, 960), 82)
        poster_sources = image_set(still, base + '/poster', (640, 960, 1280, 1920))
        poster_avif = base + '/poster.avif'
        image(still, poster_avif, (1280, 960), 72, 'AVIF')
        poster_avif_sources = avif_image_set(still, base + '/poster', (640, 960, 1280, 1920), 72)
        preview = base + '/preview.mp4'
        video(source, preview, start)
        preview_hd = base + '/preview-hd.mp4'
        video(source, preview_hd, start, hd=True)
        full = base + '/film.mp4'
        video(source, full)
        full_hd = base + '/film-hd.mp4'
        video(source, full_hd, hd=True)
        # The full film leads the page. Where it is published on YouTube it
        # plays from there, so the local encode is not served as well.
        items = [youtube_item(slug, title, base)] if slug in YOUTUBE else [
            {'type': 'video', 'src': full, 'hd': full_hd, 'poster': poster,
             'posterSources': poster_sources, 'label': title + ' — full film',
             # Across the page and centred, the way the published films are.
             # Without this it is an ordinary tile, and in a two-column grid an
             # ordinary tile drops into the first cell - so the film opening
             # the project sat in the left half of the page.
             'layout': 'full', **video_size(source)}]
        # Only real media from this project's folder; sidecars and text are not media.
        extras = sorted(p for p in directory.rglob('*') if p.is_file() and
                        p != source and p.suffix.lower() in ('.mp4', '.jpg', '.jpeg', '.png'))
        if slug in PICS_PAIRS:
            extras = sorted(p for p in (directory / 'pics').iterdir() if p.is_file() and
                            p.suffix.lower() in ('.mp4', '.bmp', '.jpg', '.jpeg', '.png'))
        if slug == 'jordan':
            intro = base + '/detail-01'
            video(directory / '1 intro.mp4', intro + '.mp4')
            video(directory / '1 intro.mp4', intro + '-hd.mp4', hd=True)
            items = [{'type': 'video', 'src': intro + '.mp4', 'hd': intro + '-hd.mp4',
                      'label': title + ' — intro', 'loop': True, 'layout': 'intro',
                      **video_poster(directory / '1 intro.mp4', intro)}]
            extras = sorted(p for p in (directory / 'okda').iterdir() if p.is_file() and
                            p.suffix.lower() in ('.mp4', '.bmp', '.jpg', '.jpeg', '.png') and
                            # 9.mp4 is held out so that the arrangement below is
                            # dealt from the same number of tiles as before. It
                            # reaches the page through RECAST instead, which puts
                            # it in a chosen slot rather than a shuffled one.
                            p.name not in ('x1.00_00_01_19.Still0281.jpg', '9.mp4'))
            extras.sort(key=lambda p: p.suffix.lower() != '.mp4')
        # Where a still has been exported twice - the raw .bmp lifted off the
        # timeline and a .jpg saved beside it - the two share a name once the
        # suffix is dropped, so both would be written to the same file and
        # counted as two tiles of a single frame. The .jpg is the later export
        # and the one that was meant, so the .bmp beside it is set aside.
        same_frame = {}
        for still in extras:
            if still.suffix.lower() != '.mp4':
                same_frame.setdefault(still.stem, []).append(still)
        superseded = {still for exports in same_frame.values() if len(exports) > 1
                      for still in exports if still.suffix.lower() == '.bmp'}
        extras = [extra for extra in extras if extra not in superseded]
        for index, extra in enumerate(extras, 1):
            stem = base + ('/okda-' if slug == 'jordan' else '/detail-') + str(index).zfill(2)
            # Asset names stay tied to their source when new media is inserted.
            if slug == 'jordan':
                stem = base + '/okda-' + (extra.stem.zfill(2) if extra.suffix.lower() == '.mp4' else extra.stem)
            if slug in PICS_PAIRS:
                stem = base + '/pics-' + extra.stem
            if extra.suffix.lower() == '.mp4':
                video(extra, stem + '.mp4')
                video(extra, stem + '-hd.mp4', hd=True)
                items.append({'type': 'video', 'src': stem + '.mp4', 'hd': stem + '-hd.mp4',
                              'label': extra.stem, **video_poster(extra, stem)})
                if slug in PICS_PAIRS or slug == 'jordan':
                    items[-1]['loop'] = True
                if slug in PICS_PAIRS:
                    poster_size = items[-1]['posterSources'][-1]
                    items[-1].update({key: poster_size[key] for key in ('width', 'height')})
            else:
                entry = image(extra, stem + '.webp', (1600, 1200), 82)
                entry['sources'] = image_set(extra, stem, (480, 800, 960, 1200, 1600, 2400))
                entry['avif'] = image(extra, stem + '.avif', (1600, 1200), 72, 'AVIF')['src']
                entry['avifSources'] = avif_image_set(extra, stem, (480, 800, 960, 1200, 1600, 2400), 72)
                entry['label'] = title + ' — still ' + str(index)
                items.append(entry)
        if slug in PICS_PAIRS:
            # Alternate two stills and a silent clip, balancing the same two
            # independent columns used by JORDAN with the real media ratios.
            placements = PLACED.get(slug, [])

            def placed_as(item):
                for placement in placements:
                    if placement['file'] in item.get('src', ''):
                        return placement
                return None

            def weight(item):
                return item['height'] / item['width'] + 0.04

            # A hand-placed tile is dealt out of the shuffle but still counted
            # against the column it was asked for, before anything else is
            # dealt. Left until afterwards, as this was, the balancer shares
            # the rest out evenly and then one column silently gains a tile -
            # which is a column ending short by exactly that tile, and slack
            # spread down its gaps until they are several times its
            # neighbour's.
            # Paired with their placement and kept in the order those were
            # written, so a tile may be placed under one that is itself placed.
            pinned = [(placement, next(item for item in items[1:]
                                       if placement['file'] in item.get('src', '')))
                      for placement in placements]
            loose = [item for item in items[1:] if not placed_as(item)]
            stills = [item for item in loose if item['type'] == 'image']
            clips = [item for item in loose if item['type'] == 'video']
            mixed = []
            while stills or clips:
                mixed.extend(stills[:2])
                del stills[:2]
                if clips:
                    mixed.append(clips.pop(0))
            column_heights = {'left': 0, 'right': 0}
            fixed = set()  # tiles whose column was chosen rather than dealt
            for placement, item in pinned:
                item['column'] = placement['column']
                column_heights[item['column']] += weight(item)
            for item in mixed:
                # The tile a placed one sits under has to be in the same column
                # as it, or "directly under" cannot be honoured at all. So the
                # anchor is held to that column too, and only its position in
                # the run is left to the alternation above.
                held = next((placement for placement in placements
                             if placement.get('under')
                             and placement['under'] in item.get('src', '')), None)
                column = held['column'] if held else min(column_heights, key=column_heights.get)
                item['column'] = column
                column_heights[column] += weight(item)
                if held:
                    fixed.add(id(item))

            # Dealing each tile to whichever column is shorter at the time
            # leaves the two within one tile of each other, and no closer: it
            # cannot revisit a choice once a taller picture turns up later. One
            # tile, on a page of these, is several hundred pixels - and that
            # difference is handed to the gaps, so one column ends up spaced
            # three or four times as far apart as the other.
            #
            # So the deal is then improved on: whichever single tile would most
            # even the two columns is handed across, and again, until no move
            # helps. Tiles put somewhere by hand are left where they were put.
            def imbalance(heights):
                return abs(heights['left'] - heights['right'])

            moving = True
            while moving:
                moving = False
                best = None
                for item in mixed:
                    if id(item) in fixed:
                        continue
                    other = 'right' if item['column'] == 'left' else 'left'
                    trial = dict(column_heights)
                    trial[item['column']] -= weight(item)
                    trial[other] += weight(item)
                    if imbalance(trial) < imbalance(column_heights) - 1e-9 and (
                            best is None or imbalance(trial) < imbalance(best[1])):
                        best = (item, trial, other)
                if best:
                    item, column_heights, other = best
                    item['column'] = other
                    moving = True
            items = items[:1] + mixed
            for placement, item in pinned:
                if not placement.get('under'):
                    items.insert(1, item)  # straight after the opening film
                    continue
                anchor = next(other for other in items[1:]
                              if placement['under'] in other.get('src', ''))
                # Order within a column follows the order of this list, so
                # sitting next to the anchor here is sitting under it there.
                items.insert(items.index(anchor) + 1, item)
        if slug == 'jordan':
            banner = next(item for item in items if item['type'] == 'video' and item['label'] == '6')
            banner['width'] = 704
            banner['height'] = 248
            outro = next(item for item in items if item['type'] == 'video' and item['label'] == '7')
            outro.update({'layout': 'full', 'width': 640, 'height': 198})
            # Keep the intro centered, then use a stable shuffle for mixed media.
            added_stills = []
            for filename, column in [('i know.00_02_01_13.Still001.webp', 'right'),
                                     ('i know.00_00_05_06.Still002.webp', 'left'),
                                     ('i know.00_01_53_29.Still001.webp', 'left')]:
                still = next(item for item in items if item['src'].endswith(filename))
                if column:
                    still['column'] = column
                added_stills.append(still)
            # The clip that had never been placed. Held out of the shuffle
            # below, because shuffling depends on how many things are being
            # shuffled - letting it join would deal the whole grid again, and
            # the arrangement either side of it is one somebody chose.
            tail_clip = next(item for item in items if item['type'] == 'video' and item['label'] == '2')
            # Add new stills without reshuffling the already arranged media.
            mixed = [item for item in items[1:]
                     if item not in added_stills and item is not outro and item is not tail_clip]
            random.Random(2).shuffle(mixed)
            column_heights = {'left': 0, 'right': 0}
            for item in mixed:
                column = min(column_heights, key=column_heights.get)
                item['column'] = column
                column_heights[column] += item.get('height', 3) / item.get('width', 4) + 0.04
            ego = next(item for item in mixed if item['src'].endswith('Still029.webp'))
            numbered_collage = next(item for item in mixed if item['src'].endswith('Still023.webp'))
            mixed.remove(ego)
            # It was counted against whichever column the balancer gave it, and
            # is about to be moved by hand. Without taking it off that column's
            # running total, every height below here is measured against a
            # column that no longer holds it.
            ego_height = ego.get('height', 3) / ego.get('width', 4) + 0.04
            column_heights[ego['column']] -= ego_height
            column_heights['left'] += ego_height
            ego['column'] = 'left'
            mixed.insert(mixed.index(numbered_collage), ego)
            mixed.append(added_stills[1])
            # Each final still follows its own column without an empty shared row.
            mixed.extend([added_stills[2], added_stills[0]])
            # The two columns are stacked from the top and end wherever their
            # contents run out, so the shorter one finishes early and leaves
            # bare page below its last tile - a black rectangle the width of a
            # column, sitting above the closing film. The held-back clip goes
            # into whichever column that is, which is what the space was.
            for still in added_stills:
                column_heights[still['column']] += still.get('height', 3) / still.get('width', 4) + 0.04
            tail_clip['column'] = min(column_heights, key=column_heights.get)
            mixed.append(tail_clip)
            # Even so the two columns hold different amounts of picture, and
            # with one even gap between every pair of tiles the shorter of them
            # finishes early - 392px early here, which is the black tail this
            # page used to end on. Trading the banner for the thin strip moves
            # 156px of height the other way and brings the two within 80px of
            # each other, which is close enough to read as level.
            banner['column'], ego['column'] = ego['column'], banner['column']
            items = [items[0]] + mixed + [outro]
            # Two tiles re-cast by hand: the one that held clip 2 now runs 22,
            # and 9 takes the place 22 left. Only the footage in them changes -
            # each keeps the position the arrangement above gave it, so no
            # other tile on the page moves. Both slots are looked up before
            # either is rewritten, or the second lookup would find the tile the
            # first one had just renamed.
            RECAST = (('2', '22'), ('22', '9'))
            slots = [(next(item for item in items
                           if item['type'] == 'video' and item['label'] == was), now)
                     for was, now in RECAST]
            for slot, clip in slots:
                clip_stem = base + '/okda-' + clip.zfill(2)
                clip_source = directory / 'okda' / (clip + '.mp4')
                video(clip_source, clip_stem + '.mp4')
                video(clip_source, clip_stem + '-hd.mp4', hd=True)
                slot.update({'src': clip_stem + '.mp4', 'hd': clip_stem + '-hd.mp4',
                             'label': clip, **video_poster(clip_source, clip_stem)})
            # The film itself, as published, leading the page the way the other
            # projects' full films do. Added last: the arrangement above counts
            # on items[0] being the intro, so nothing may go in front of it
            # until that work is done.
            items.insert(0, youtube_item(slug, title, base))
        projects.append({'id': slug, 'name': title, 'thumbnail': thumb, 'poster': poster,
                 'avif': thumbnail_avif, 'posterAvif': poster_avif,
                 'thumbnailSources': thumbnail_sources, 'thumbnailAvifSources': thumbnail_avif_sources,
                 'posterSources': poster_sources, 'posterAvifSources': poster_avif_sources,
                         'preview': preview, 'previewHD': preview_hd, 'width': rectangle_dimensions['width'],
                         'height': rectangle_dimensions['height'], 'media': items})
        projects[-1].update(CREDITS.get(slug, {}))
        if slug in PICS_PAIRS or slug == 'jordan':
            projects[-1]['detailLayout'] = 'pairs'

    def encode(job):
        source, target, start, hd = job
        temporary = target.with_suffix('.tmp.mp4')
        command = [args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-threads', '2']
        if start is not None:
            command += ['-ss', str(start)]
        command += ['-i', str(source), '-map', '0:v:0']
        if start is not None:
            command += ['-t', '10', '-an']
        else:
            command += ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', '96k', '-ac', '2']
        width, height = (1920, 1080) if hd else (960, 720)
        # Square-pixel output preserving display aspect ratio, including masters
        # with non-square pixels. min(1, ...) also prevents source upscaling.
        scale = f'min(1,min({width}/(iw*sar),{height}/ih))'
        vf = f"scale=w='trunc({scale}*iw*sar/2)*2':h='trunc({scale}*ih/2)*2',setsar=1"
        rate = (4000 if start is not None else 5000) if hd else (1200 if start is not None else 2000)
        command += ['-vf', vf,
                '-r', '25', '-c:v', 'libx264', '-threads', '2', '-preset', 'medium',
                '-crf', '19' if hd else '20', '-maxrate', str(rate) + 'k',
                    '-bufsize', str(rate * 2) + 'k',
                    '-profile:v', 'main', '-level:v', '4.0' if hd else '3.1', '-pix_fmt', 'yuv420p',
                    '-g', '50', '-movflags', '+faststart', '-map_metadata', '-1', str(temporary)]
        subprocess.run(command, check=True)
        temporary.replace(target)
        print(str(target.relative_to(ROOT)) + ' ' + str(target.stat().st_size), flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(encode, jobs))
    manifest = '// Generated by scripts/build-works-media.py. No media is fetched by this manifest.\n'
    manifest += 'window.worksProjects = ' + json.dumps(projects, indent=2, ensure_ascii=False) + ';\n'
    (ROOT / 'js/works-data.js').write_text(manifest, encoding='utf-8')
    stamp.parent.mkdir(parents=True, exist_ok=True)
    stamp.write_text(recipe)
    print('Built ' + str(len(projects)) + ' projects.', flush=True)


if __name__ == '__main__':
    main()
