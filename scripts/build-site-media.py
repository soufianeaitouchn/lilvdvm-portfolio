"""Build the homepage H.264 delivery files from local masters.

python scripts/build-site-media.py --ffmpeg /path/to/ffmpeg [--force]
Existing masters are never modified. Outputs are incremental by source mtime.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    # Gallery stills are built by scripts/build-gallery-pics.py.
    jobs = []
    for stem in ('x3_1', 'reel 011', 'sos'):
        jobs.append((ROOT / f'video/{stem}.mp4', ROOT / f'video/{stem}.web.mp4', False))

    def encode(job):
        source, high, audio = job
        for hd in (False, True):
            dest = high if hd else high.with_name(high.name.replace('.web.mp4', '.small.mp4'))
            # Stamp distinguishes these exports from the older high-bitrate files.
            stamp = ROOT / '.tools/site-media' / (dest.relative_to(ROOT).as_posix().replace('/', '_') + '.stamp')
            compact = source == ROOT / 'video/sos.mp4'
            recipe = f'v2-compact:{source.stat().st_mtime_ns}:{source.stat().st_size}' if compact else f'v1:{source.stat().st_mtime_ns}:{source.stat().st_size}'
            if not args.force and dest.exists() and stamp.exists() and stamp.read_text() == recipe:
                continue
            temporary = dest.with_suffix('.tmp.mp4')
            # Fit both portrait and landscape into a long-edge budget, without upscaling.
            edge = 1920 if hd and not compact else 960
            scale = f'min(1,{edge}/max(iw*sar,ih))'
            vf = f"scale=w='trunc({scale}*iw*sar/2)*2':h='trunc({scale}*ih/2)*2',setsar=1"
            command = [args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-threads', '2',
                       '-i', str(source), '-map', '0:v:0', '-vf', vf, '-c:v', 'libx264',
                       '-threads', '2', '-preset', 'medium', '-crf', '20' if hd else '21',
                       '-maxrate', ('2000k' if compact else '4000k') if hd else '1000k',
                       '-bufsize', ('4000k' if compact else '8000k') if hd else '2000k',
                       '-pix_fmt', 'yuv420p', '-g', '60', '-movflags', '+faststart', '-map_metadata', '-1']
            command += ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', '128k', '-ac', '2'] if audio else ['-an']
            subprocess.run(command + [str(temporary)], check=True)
            temporary.replace(dest)
            stamp.parent.mkdir(parents=True, exist_ok=True)
            stamp.write_text(recipe)
            print(f'{dest.relative_to(ROOT)}: {dest.stat().st_size} bytes', flush=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(encode, jobs))
    print(f'Built {len(pictures)} responsive pictures and {len(jobs) * 2} videos.', flush=True)


if __name__ == '__main__':
    main()
