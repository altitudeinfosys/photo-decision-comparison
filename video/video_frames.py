#!/usr/bin/env python3
"""Local video -> timestamped JPEGs, contact sheet, portable JSON. No API calls."""
import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

VERSION = '1.0.0'
LIMITATION = ('Still frames can miss motion, audio, brief or intermittent problems, and details '
              'lost through resizing. Scene changes and duplicate filtering are visual heuristics, '
              'not evidence that a maintenance issue is absent. Review the original video when needed.')


class FrameError(Exception):
    pass


def run(cmd, timeout):
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        raise FrameError(f'{Path(cmd[0]).name} exceeded the {timeout:g}s command timeout') from None
    except OSError as exc:
        raise FrameError(f'Cannot execute {Path(cmd[0]).name}: {exc.strerror}') from None
    if result.returncode:
        # Do not copy source paths or metadata into public-facing error reports.
        raise FrameError(f'{Path(cmd[0]).name} failed (exit {result.returncode}); '
                         'check that the local file is valid and its codec is supported')
    return result


def finite(value, label):
    try:
        number = float(value)
        if math.isfinite(number):
            return number
    except (ValueError, TypeError):
        pass
    raise FrameError(f'Invalid or missing {label}')


def probe(source, args):
    data = json.loads(run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                           '-show_format', '-show_streams', '-of', 'json', str(source)],
                          args.timeout).stdout)
    streams = [s for s in data.get('streams', []) if s.get('codec_type') == 'video'
               and not s.get('disposition', {}).get('attached_pic')]
    if not streams:
        raise FrameError('Input has no ordinary video stream')
    stream = streams[0]
    if stream.get('duration') is not None:
        duration = finite(stream['duration'], 'duration')
    else:
        fmt = data.get('format', {})
        duration = finite(fmt.get('duration'), 'duration') - finite(fmt.get('start_time', 0), 'start time')
    if not 0 < duration <= args.max_duration:
        raise FrameError(f'Duration must be above zero and at most {args.max_duration:g}s')
    width, height = int(stream.get('width', 0)), int(stream.get('height', 0))
    if min(width, height) <= 0 or max(width, height) > 8192 or width * height > 33554432:
        raise FrameError('Input resolution exceeds 8192 per side / 32 megapixels, or is invalid')
    rotation = stream.get('tags', {}).get('rotate', 0)
    for side in stream.get('side_data_list', []):
        if 'rotation' in side:
            rotation = side['rotation']
    return {'duration_seconds': duration, 'encoded_width': width, 'encoded_height': height,
            'rotation_degrees': finite(rotation, 'rotation'), 'stream_index': stream['index'],
            'codec': stream.get('codec_name'), 'pixel_format': stream.get('pix_fmt'),
            'color_transfer': stream.get('color_transfer'), 'sample_aspect_ratio': stream.get('sample_aspect_ratio')}


def even_times(duration, count):
    return [duration * (i + 0.5) / count for i in range(count)]


def ffmpeg_input(source, info):
    # A protocol allowlist prevents network retrieval even for an input with references.
    return ['ffmpeg', '-hide_banner', '-nostdin', '-loglevel', 'info', '-xerror',
            '-protocol_whitelist', 'file,pipe', '-threads', '2', '-i', str(source),
            '-map', f"0:{info['stream_index']}", '-an', '-sn', '-dn']


def choose_times(source, info, args):
    defaults = even_times(info['duration_seconds'], args.count)
    if args.selection == 'even':
        return [(t, 'even') for t in defaults]
    # Scan at source cadence; retain scene candidates spaced at least 0.5 seconds apart.
    filt = (f"setpts=PTS-STARTPTS,scale=160:-2,select='gt(scene,{args.scene_threshold})"
            "*if(isnan(prev_selected_t),1,gte(t-prev_selected_t,0.5))',showinfo")
    result = run(ffmpeg_input(source, info) + ['-vf', filt, '-fps_mode', 'vfr',
                 '-t', str(args.max_duration), '-f', 'null', '-'], args.timeout)
    hits = sorted(set(float(t) for t in re.findall(r'pts_time:([\d.eE+-]+)',
                         result.stderr.decode('utf-8', 'replace'))
                      if 0 <= float(t) < info['duration_seconds']))
    # Spread over scene boundaries when too many exist; fill sparse scans from the even grid.
    selected = hits if len(hits) <= args.count else [hits[min(len(hits)-1, int((i+.5)*len(hits)/args.count))]
                                                     for i in range(args.count)]
    times = [(t, 'scene_change') for t in selected]
    for t in defaults:
        if len(times) >= args.count:
            break
        if all(abs(t - existing) > 0.05 for existing, _ in times):
            times.append((t, 'even_fallback'))
    return sorted(times)


def extract(source, info, target, args):
    from PIL import Image
    # Decode from the beginning for accurate PTS, including VFR and nonzero stream starts.
    # Autorotation is FFmpeg's default. Normalize to elapsed time from first decoded frame.
    factor = f'min(1,min({args.max_side}/(iw*sar),{args.max_side}/ih))'
    scale = f"scale=w='max(1,round(({factor})*iw*sar))':h='max(1,round(({factor})*ih))',setsar=1"
    filt = (f"setpts=PTS-STARTPTS,select='gte(t,{target:.9f})',showinfo,"
            # Convert anamorphic pixels to square pixels before bounding the image.
            f"{scale}")
    result = run(ffmpeg_input(source, info) + ['-vf', filt, '-frames:v', '1',
                 '-fps_mode', 'vfr', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'], args.timeout)
    pts = re.findall(r'pts_time:([\d.eE+-]+)', result.stderr.decode('utf-8', 'replace'))
    if not result.stdout or not pts:
        raise FrameError(f'No decodable frame at or after {target:.3f}s; try fewer frames')
    with Image.open(io.BytesIO(result.stdout)) as image:
        return image.convert('RGB'), float(pts[0])


def signature(image):
    from PIL import Image
    return list(image.resize((32, 32), Image.Resampling.BILINEAR).tobytes())


def distance(a, b):
    return sum(abs(x-y) for x, y in zip(a, b)) / (len(a) * 255)


def timestamp(seconds):
    millis = round(seconds * 1000)
    return f'{millis//3600000:02d}:{millis//60000%60:02d}:{millis//1000%60:02d}.{millis%1000:03d}'


def contact_sheet(images, frames, destination):
    from PIL import Image, ImageDraw, ImageOps
    cols = min(3, len(images))
    sheet = Image.new('RGB', (cols*352, math.ceil(len(images)/cols)*234), '#20242b')
    draw = ImageDraw.Draw(sheet)
    for i, (image, frame) in enumerate(zip(images, frames)):
        x, y = i % cols * 352, i // cols * 234
        thumb = ImageOps.contain(image, (336, 190))
        sheet.paste(thumb, (x+8+(336-thumb.width)//2, y+8+(190-thumb.height)//2))
        draw.text((x+10, y+204), f"Frame {i+1} | {frame['timestamp']}", fill='white')
    sheet.save(destination, format='JPEG', quality=90)


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path, help='Local video file; original is never modified')
    p.add_argument('--output', type=Path, required=True, help='New output directory; must not exist')
    p.add_argument('--count', type=int, default=4, help='Maximum frames, 1..24 (default 4)')
    p.add_argument('--selection', choices=['even', 'scene'], default='even')
    p.add_argument('--scene-threshold', type=float, default=0.3, help='Scene score 0..1')
    p.add_argument('--deduplicate', action='store_true', help='Drop visually similar selected frames')
    p.add_argument('--duplicate-threshold', type=float, default=0.01, help='Normalized RGB mean difference 0..0.1')
    p.add_argument('--max-side', type=int, default=1280, help='JPEG longest side 64..4096')
    p.add_argument('--max-duration', type=float, default=120, help='Seconds, maximum 300 (default 120)')
    p.add_argument('--max-mib', type=float, default=100, help='Input MiB, maximum 500 (default 100)')
    p.add_argument('--timeout', type=float, default=120, help='Per-command seconds, maximum 300')
    p.add_argument('--dry-run', action='store_true', help='Probe and print plan; no decoding or file writes')
    return p


def process(args):
    for value, low, high, label in [(args.count,1,24,'count'), (args.max_side,64,4096,'max-side'),
            (args.max_duration,0.001,300,'max-duration'), (args.max_mib,0.001,500,'max-mib'),
            (args.timeout,1,300,'timeout'), (args.scene_threshold,0,1,'scene-threshold'),
            (args.duplicate_threshold,0,0.1,'duplicate-threshold')]:
        if not math.isfinite(value) or not low <= value <= high:
            raise FrameError(f'{label} must be between {low} and {high}')
    source = args.input.expanduser().resolve()
    if not source.is_file():
        raise FrameError('Input must be an existing local regular file')
    if source.stat().st_size > args.max_mib*1024*1024:
        raise FrameError(f'Input exceeds {args.max_mib:g} MiB limit')
    output = args.output.expanduser().absolute()
    if output.exists() or output.is_symlink():
        raise FrameError('Output already exists; choose a new directory to preserve existing files')
    for tool in ['ffmpeg', 'ffprobe']:
        if not shutil.which(tool):
            raise FrameError(f'Missing dependency: {tool}; install FFmpeg separately')
    info = probe(source, args)
    plan = {'schema_version':1, 'tool_version':VERSION, 'dry_run':args.dry_run,
            'source':info, 'settings':{k:v for k,v in vars(args).items() if k not in ['input','output','dry_run']},
            'even_candidate_seconds':even_times(info['duration_seconds'],args.count),
            'timestamp_basis':'Elapsed presentation time from first decoded video frame',
            'limitations':[LIMITATION], 'network_used':False}
    if args.dry_run:
        plan['note'] = 'Scene scan, duplicate filtering and actual PTS are deferred until a real run.'
        return plan
    try:
        import PIL
    except ImportError:
        raise FrameError('Missing dependency: Pillow; see requirements.txt') from None
    times = choose_times(source, info, args)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.video-frames-', dir=output.parent) as temp:
        stage = Path(temp)
        images, frames, signatures, dropped = [], [], [], []
        for target, reason in times:
            image, actual = extract(source, info, target, args)
            sig = signature(image)
            duplicate = next((i for i, other in enumerate(signatures)
                              if distance(sig,other) <= args.duplicate_threshold), None) if args.deduplicate else None
            if duplicate is not None:
                dropped.append({'requested_seconds':round(target,6), 'timestamp_seconds':actual,
                                'duplicate_of':frames[duplicate]['id']})
                continue
            name = f'frame_{len(frames)+1:03d}_{round(actual*1000):09d}ms.jpg'
            image.save(stage/name, format='JPEG', quality=90)
            if (stage/name).stat().st_size > 4*1024*1024:
                raise FrameError('JPEG exceeds 4 MiB image-workflow limit; reduce --max-side')
            frames.append({'id':f'frame_{len(frames)+1:03d}', 'path':name, 'mime_type':'image/jpeg',
                           'requested_seconds':round(target,6), 'timestamp_seconds':actual,
                           'timestamp':timestamp(actual), 'selection_reason':reason,
                           'width':image.width, 'height':image.height,
                           'sha256':hashlib.sha256((stage/name).read_bytes()).hexdigest()})
            images.append(image)
            signatures.append(sig)
        contact_sheet(images,frames,stage/'contact-sheet.jpg')
        digest = hashlib.sha256()
        with source.open('rb') as handle:
            for chunk in iter(lambda:handle.read(1024*1024), b''):
                digest.update(chunk)
        plan['source']['sha256'] = digest.hexdigest()
        plan['source']['size_bytes'] = source.stat().st_size
        plan.update(frames=frames, dropped_duplicates=dropped, frame_count=len(frames),
                    contact_sheet='contact-sheet.jpg', pillow_version=PIL.__version__)
        if info['color_transfer'] in ['smpte2084','arib-std-b67']:
            plan['limitations'].append('HDR source: this tool does not perform calibrated HDR tone mapping; colors may differ.')
        (stage/'manifest.json').write_text(json.dumps(plan,indent=2)+'\n',encoding='utf-8')
        output.mkdir(mode=0o700)  # Exclusive claim; no overwrite if another run created it.
        try:
            for file in stage.iterdir():
                shutil.move(str(file), output/file.name)
        except BaseException:
            shutil.rmtree(output)
            raise
    return {'frame_count':len(frames), 'dropped_duplicates':len(dropped),
            'manifest':str(output/'manifest.json'), 'contact_sheet':str(output/'contact-sheet.jpg')}


def main():
    try:
        result = process(parser().parse_args())
        print(json.dumps(result,indent=2))
        return 0
    except (FrameError, OSError, ValueError, KeyError) as exc:
        print(f'error: {exc}',file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
