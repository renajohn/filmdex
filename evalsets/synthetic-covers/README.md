# Made-up photos of sleeves and books

Photographs painted pixel by pixel, for measuring `detectSleeveQuad` where
the real photos in `handheld-cd` cannot: every corner is known exactly, and
there are books as well as sleeves. A cover is warped into perspective over
wood, tiles, a cloth, a carpet or a cluttered table, with a shadow, a block
of pages, a thumb over one edge, glare, uneven light, grain, a blur and a
JPEG round trip. The painter is `frontend/src/test/syntheticPhoto.ts`, which
the unit tests use too.

```bash
mkdir -p evalsets/synthetic-covers/.cache/covers      # a JPEG per cover, named cd-* or book-*
backend/node_modules/.bin/tsx evalsets/synthetic-covers/gen.ts --count 120 --phone 6
backend/node_modules/.bin/tsx evalsets/synthetic-covers/run.ts
backend/node_modules/.bin/tsx evalsets/synthetic-covers/run.ts --no-hint     # not told sleeve or book
DETECTOR=/elsewhere/detectSleeveQuad.ts backend/node_modules/.bin/tsx evalsets/synthetic-covers/run.ts --quiet
```

The covers in `.cache/covers` are not committed (they are photographs, some
of them other people's); a run without any uses only the covers `gen.ts`
draws. `--phone` adds scenes at a phone's full 3024x4032, for timing. The
scenes and their corners go to `.cache`, and each run writes an overlay per
photo to `.cache/out`: the truth dashed green, the detection solid red.

## How a photo is judged

The error is the worst corner of each outline against the other outline, as
a fraction of the photo's diagonal, with the truth first cut to the frame
(a cover that runs off the photo has corners nobody can place). Under 2% the
user has only to nudge a corner; under 4% to adjust one; beyond that they
might as well have dragged from scratch. A confident answer (`CONFIDENT`) is
applied without asking when a sleeve is photographed, so a confident wrong
one is the worst outcome.

## Where it stands

126 scenes (seed 1), 83 sleeves and 43 books, 14 of the covers real. Before
the step-contrast measure, the book proportions and the carpet baseline, the
detector had the worst corner within 2% on 54% of them and within 4% on 64%,
with 106 confident answers of which 29 were wrong. Now: within 2% on 82%,
within 4% on 91%, 107 confident answers of which 3 are wrong (two of them
5% off, one the artwork of a jewel case without its spine). Median 128 ms
at 1024 px, under 210 ms at a phone's full resolution, on a laptop.

What still fails: a thumb whose straight edge is taken for a side (two
scenes, both unsure); a plank seam running close and parallel to a sleeve's
edge, so that one side lands on the seam (5-7% off); a cover that runs off a
corner of the frame, where the answer is cut by the frame; and a small sleeve
over a dark cluttered table (unsure).
