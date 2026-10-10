import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

SCRIPT = Path(__file__).resolve().parents[1] / 'video_frames.py'


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', *map(str,args)], check=True)


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.video = cls.root / 'synthetic fixture.mp4'
        ffmpeg('-f','lavfi','-i','color=red:s=320x180:r=10:d=2',
               '-f','lavfi','-i','color=blue:s=320x180:r=10:d=2',
               '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0', '-c:v','libx264',cls.video)
        cls.digest = hashlib.sha256(cls.video.read_bytes()).hexdigest()
        cls.rotated = cls.root / 'rotated.mp4'
        ffmpeg('-display_rotation','90','-i',cls.video,'-c','copy',cls.rotated)
        cls.static = cls.root / 'static.mp4'
        ffmpeg('-f','lavfi','-i','color=red:s=320x180:r=10:d=1','-c:v','libx264',cls.static)

    @classmethod
    def tearDownClass(cls):
        assert hashlib.sha256(cls.video.read_bytes()).hexdigest() == cls.digest
        cls.temp.cleanup()

    def cli(self,source=None,*args,success=True):
        out = self.root / self._testMethodName
        result = subprocess.run([sys.executable,str(SCRIPT),str(source or self.video),
                                 '--output',str(out),*args], capture_output=True,text=True)
        self.assertEqual(result.returncode,0 if success else 2,result.stderr)
        return out,result

    def test_even_actual_timestamps_and_privacy(self):
        out,_ = self.cli(None,'--count','4')
        m = json.loads((out/'manifest.json').read_text())
        self.assertEqual(m['frame_count'],4)
        self.assertEqual([f['timestamp_seconds'] for f in m['frames']],[.5,1.5,2.5,3.5])
        self.assertEqual(m['source']['sha256'],self.digest)
        text = (out/'manifest.json').read_text()
        self.assertNotIn(str(self.root),text)
        self.assertNotIn(self.video.name,text)
        with Image.open(out/'contact-sheet.jpg') as sheet:
            self.assertEqual(sheet.size,(1056,468))
        for f in m['frames']:
            self.assertEqual(hashlib.sha256((out/f['path']).read_bytes()).hexdigest(),f['sha256'])
        self.assertGreater(Image.open(out/m['frames'][0]['path']).getpixel((5,5))[0],200)
        self.assertGreater(Image.open(out/m['frames'][2]['path']).getpixel((5,5))[2],200)

    def test_scene_boundary_and_fallback(self):
        out,_ = self.cli(None,'--count','3','--selection','scene')
        m = json.loads((out/'manifest.json').read_text())
        scene = [f for f in m['frames'] if f['selection_reason']=='scene_change']
        self.assertEqual(len(scene),1)
        self.assertAlmostEqual(scene[0]['timestamp_seconds'],2,places=2)
        self.assertEqual(m['frame_count'],3)

    def test_duplicate_filter_keeps_distinct_colors(self):
        out,_ = self.cli(None,'--count','4','--deduplicate')
        m = json.loads((out/'manifest.json').read_text())
        self.assertEqual(m['frame_count'],2)
        self.assertEqual(len(m['dropped_duplicates']),2)

    def test_static_scene_fallback_and_dedup(self):
        out,_ = self.cli(self.static,'--count','3','--selection','scene','--deduplicate')
        m = json.loads((out/'manifest.json').read_text())
        self.assertEqual(m['frame_count'],1)
        self.assertEqual(m['frames'][0]['selection_reason'],'even_fallback')

    def test_rotation_and_bounded_resize(self):
        out,_ = self.cli(self.rotated,'--count','1','--max-side','160')
        m = json.loads((out/'manifest.json').read_text())
        self.assertEqual(abs(m['source']['rotation_degrees']),90)
        self.assertEqual((m['frames'][0]['width'],m['frames'][0]['height']),(90,160))

    def test_dry_run_no_files(self):
        out,r = self.cli(None,'--dry-run','--selection','scene')
        self.assertFalse(out.exists())
        self.assertTrue(json.loads(r.stdout)['dry_run'])

    def test_overwrite_protection(self):
        out = self.root / self._testMethodName
        out.mkdir()
        (out/'keep.txt').write_text('untouched')
        self.cli(None,success=False)
        self.assertEqual((out/'keep.txt').read_text(),'untouched')

    def test_invalid_missing_limits(self):
        for source,args in [(self.video,['--count','0']), (self.video,['--max-duration','1']),
                            (self.video,['--max-mib','0.001']), (self.root/'missing.mp4',[]),
                            (self.video,['--scene-threshold','nan'])]:
            out,r = self.cli(source,*args,success=False)
            self.assertFalse(out.exists())
            self.assertIn('error:',r.stderr)

    def test_corrupt_and_audio_only(self):
        corrupt = self.root/'bad.mp4'
        corrupt.write_bytes(b'not a video')
        self.cli(corrupt,success=False)
        audio = self.root/'audio.wav'
        ffmpeg('-f','lavfi','-i','sine=duration=1',audio)
        self.cli(audio,success=False)

    def test_variable_frame_rate_nonzero_start(self):
        vfr = self.root/'vfr.mkv'
        ffmpeg('-f','lavfi','-i','testsrc2=s=160x90:r=10:d=4',
               '-vf',"select='if(lt(t,2),not(mod(n,2)),1)',setpts=PTS+5/TB",
               '-fps_mode','vfr','-c:v','libx264',vfr)
        out,_ = self.cli(vfr,'--count','2')
        m = json.loads((out/'manifest.json').read_text())
        for f in m['frames']:
            self.assertGreaterEqual(f['timestamp_seconds'],f['requested_seconds']-0.00001)
            self.assertLess(f['timestamp_seconds']-f['requested_seconds'],0.21)


if __name__ == '__main__':
    unittest.main(verbosity=2)
