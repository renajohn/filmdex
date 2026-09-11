# Hand-held CD photos

Real photographs of CD sleeves, for checking `detectSleeveQuad`. The photos
come from Flickr, Unsplash and Wikimedia Commons: cases held in a hand, lying
on carpet, parquet, a sofa or a padded envelope, in shadow and under glare.

The images are other people's, so only their addresses and licences are
committed. The first run downloads them into `.cache/img`, which git ignores.
The two `user-*` photos have no source and are skipped unless you put them in
`.cache/img` yourself.

```bash
backend/node_modules/.bin/tsx evalsets/handheld-cd/run.ts               # as downloaded
backend/node_modules/.bin/tsx evalsets/handheld-cd/run.ts --long 4032   # at a phone's resolution
backend/node_modules/.bin/tsx evalsets/handheld-cd/run.ts --verbose winger-hand
```

Each run writes an overlay per photo to `.cache/out`: the annotation is dashed
green, the detection solid red.

## How a photo is judged

Corners are image fractions, annotated by eye. Where a jewel case has two
honest answers (the whole case, or only the booklet without the spine), both
are listed. A detection matches if its worst corner is within `tolerance`
(7%) of the sleeve's side from one of them.

- `expect: sleeve`: the detector must be confident (`CONFIDENT`) and match.
- `expect: optional`: declining is fine, but a confident answer must still
  match. With no quads listed, any confident answer is wrong. These are the
  traps: piles of sleeves, sleeves cut off by the frame, tiny ones, scans, and
  a shelf of spines.

A confident wrong answer is the worst outcome, because the crop is applied
without asking. A decline only means the user frames the photo by hand.

## Where it stands

68 photos, 42 of which must be found. 36 are found both as downloaded and at
4032 px. None of the 26 traps gets a confident answer. The last 16 photos
were added after the tuning stopped, as a check. 5 of their 6 sleeves were
found straight away. The sixth was a right answer that hadn't been annotated
(the insert rather than the case). Every trap among them was declined. What
still fails:

| photo | why |
| --- | --- |
| `jon-hopkins-sleeve-handheld` | dark sleeve on a dark background, a corner under the thumb: declined, which is right, since two of its sides barely show |
| `mika-sleeve-blue-leather` | declined at 4032 px: the right edge barely differs from the sofa |
| `billy-bragg-sleeve-white` | white sleeve on white; the tilted red print inside wins |
| `dark-was-the-night-wood-tilt` | thick box and its shadow on wood of the same colour |
| `iridescent-case-black-tilt` | empty clear case in steep perspective; its thickness shows |
| `telaphones-floor`, `starboy-case-handheld-cafe`, `adrienne-rich-case-mailer` | a mix of case rim and booklet, just outside tolerance at one resolution |

Run with `--crops` and look at `.cache/crops` before trusting the numbers:
most of the near misses above still make a usable cover.
