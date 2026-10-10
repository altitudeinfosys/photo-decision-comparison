#!/usr/bin/env python3
"""Generate only synthetic red/blue footage; no user media or network."""
import argparse
from pathlib import Path
import shutil
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('output', type=Path)
a = p.parse_args()
if not shutil.which('ffmpeg'):
    p.error('FFmpeg is required; no software will be installed automatically')
if a.output.exists():
    p.error('Output exists; choose a new fixture path')
a.output.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-n',
                '-f','lavfi','-i','color=red:s=320x180:r=10:d=2',
                '-f','lavfi','-i','color=blue:s=320x180:r=10:d=2',
                '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0',
                '-c:v','libx264',str(a.output.absolute())],check=True,timeout=60)
print('Created synthetic four-second red/blue video.')
