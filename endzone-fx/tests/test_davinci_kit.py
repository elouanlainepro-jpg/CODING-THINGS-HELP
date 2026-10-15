"""Tests du kit DaVinci (sans rendu) : node scripts/py.mjs -m unittest discover -s tests"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import davinci_kit as kit  # noqa: E402


PLAN = {
    "beats": [i * 0.5 for i in range(30)],
    "beatLen": 0.5,
    "drop": 2.0,
    "outro": {"start": 13.0},
    "shots": [
        {"index": 0, "clip": "a.mp4", "start": 0, "end": 2.0, "accent": 2.0, "continuing": False, "freeze": None},
        {"index": 1, "clip": "a.mp4", "start": 2.0, "end": 4.0, "accent": 2.0, "continuing": True, "freeze": None},
        {"index": 2, "clip": "b.mp4", "start": 4.0, "end": 13.0, "accent": 4.5, "continuing": False, "freeze": {"start": 4.5}},
    ],
}


class TimecodeTest(unittest.TestCase):
    def test_timecode_starts_at_one_hour(self):
        self.assertEqual(kit.tc(0, 60), "01:00:00:00")
        self.assertEqual(kit.tc(59, 60), "01:00:00:59")
        self.assertEqual(kit.tc(60 * 61 + 7, 60), "01:01:01:07")

    def test_cumulative_rounding_has_no_gap(self):
        cuts = [0, 0.4286, 0.8571, 1.7143, 2.5714]
        total = sum(kit.frames_between(a, b, 60) for a, b in zip(cuts, cuts[1:]))
        self.assertEqual(total, round(cuts[-1] * 60))


class MarkerTest(unittest.TestCase):
    def test_priorities_and_merge(self):
        markers = kit.build_markers(PLAN, 60)
        by_frame = {m["frame"]: m for m in markers}
        drop = by_frame[120]
        self.assertEqual(drop["kind"], "drop")
        self.assertIn("IMPACT 1", drop["name"])
        self.assertEqual(by_frame[270]["color"], "Yellow")  # impact + freeze : l'impact gagne
        self.assertEqual(by_frame[780]["kind"], "outro")
        frames = [m["frame"] for m in markers]
        self.assertEqual(frames, sorted(set(frames)))

    def test_edl_format(self):
        markers = kit.build_markers(PLAN, 60)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.edl"
            kit.write_marker_edl(markers, 60, p, "test")
            text = p.read_text()
        self.assertTrue(text.startswith("TITLE: test"))
        self.assertIn("|C:ResolveRed |M:DROP", text)
        self.assertEqual(text.count("|C:Resolve"), len(markers))


if __name__ == "__main__":
    unittest.main()
