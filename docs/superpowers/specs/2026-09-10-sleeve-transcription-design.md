# Filling the album form from photos of the sleeve

2026-09-10

## The problem

A CD that neither Discogs nor MusicBrainz knows about has to be entered by
hand. `MusicForm` has roughly twenty-five fields plus a track list, and a
twelve-track album means typing twelve titles and twelve durations that are
already printed on the back of the case.

The scan path already exists for the easy case: photograph the front,
`scanAlbumCover` identifies the release, the user picks a match. When that
finds nothing, the photo is thrown away and the user starts from an empty
form. This design reuses those photos to fill the form instead.

## What it is not

It does not identify the record. The whole premise is that the record is
absent from the reference databases, so the model does not know it either and
anything it "completes" from memory would be invention. Plausible-but-wrong
track lists are worse than empty fields because they survive proofreading.
Every prompt here transcribes what is printed and omits what it cannot read.

## Evidence gathered before designing

Measured against `Qwen3.6-35B-A3B` on `llm-next.lab.crog.org`, using a
synthetic CD back cover whose ground truth is known: twelve tracks with
durations, label, catalogue number, barcode, at proportions taken from a real
120 mm jewel case (track text 2 mm tall, i.e. 1.7% of the width).

| Image sent | Track titles | Durations | Time |
|---|---|---|---|
| Flat render, 1024 px | 12/12 | 12/12 | 8.5 s |
| Flat render, 2048 px | 12/12 | 12/12 | 17.2 s |
| Degraded: rotated 6°, diagonal glare, contrast reduced, sleeve fills 55% of frame, 1024 px | 12/12 | 12/12 | 6.5 s |
| Same, cropped tight to the sleeve | 12/12 | 0/12 | 7.3 s |

Three conclusions follow, and they shape the design:

1. **The existing 1024 px ceiling is enough.** `LLM_IMAGE_MAX_PX` stays at
   1024 and `prepareImage` is reused unchanged. Doubling the resolution
   doubled the latency and changed nothing else.
2. **Nothing is cropped before transcription.** The tight crop lost the
   duration column and the catalogue number, scoring 0/12 on durations. That
   crop was crude — a fixed rectangle — so this is not proof that cropping is
   inherently harmful; it is proof that the risk is real and unnecessary,
   because the uncropped frame already scores perfectly. Geometry work serves
   the cover image only.
3. **`Qwen3.6-35B-A3B` is the right model and is already the default.**
   Compared against `Qwen2.5-VL-7B` (the `vl-ocr` container), which is smaller
   and vision-specialised:

   | Model | Track titles | Durations | Time |
   |---|---|---|---|
   | Qwen2.5-VL-7B | 12/12 | **1/12** | 16.9 s |
   | Qwen3.6-35B-A3B | 12/12 | **12/12** | 6.5 s |

   The durations are the hard part: on a rotated photo the right-hand column
   no longer lines up with its rows, so associating them takes spatial
   reasoning the 7B model does not do. One synthetic sample is not a
   benchmark, but 1/12 against 12/12 on the property that matters decides it.

A fourth probe was run and its result rejected. The model was asked for the
four corners of the sleeve so that the perspective correction could be driven
by the model rather than by a computer-vision dependency. It perceives the
quadrilateral well — asked loosely, it returned the four edges as thin boxes
whose extremes fall within 1% of ground truth — but asked for corners
directly it collapses them onto the axis-aligned bounding box (195/800 in
both axes against a true 255/198 … 745/802), a 5-6% error, and it emitted
malformed JSON (`{"x":195,195}`, the `y` key dropped). That is too sloppy to
drive a homography, so corner detection is done in code. See "Cover geometry".

## Shape of the change

```
front photo ─┐                    ┌─ transcribeSleeveFront ─┐
             ├─ POST /api/music/  ┤                          ├─ merge ─→ draft
back photo  ─┘   transcribe-sleeve └─ transcribeSleeveBack  ─┘             │
                                                                           ▼
front photo (full resolution, kept in the browser) ──────────→ MusicForm, pre-filled
             │                                                             │
             └─ on save: POST /albums/:id/upload-cover ──→ detect quad → warp → cover
```

Nothing is written to the database until the user submits the form. The draft
is a proposal on screen, not a record.

### 1. Transcription service

Two functions in `coverScanService`, alongside the existing
`analyzeAlbumImage`, which is left untouched — it serves the identification
path and has different goals.

`transcribeSleeveFront(base64, mimeType)` returns the identity as printed:
title, artist(s), and the format if the sleeve states it. `max_tokens` 300.

`transcribeSleeveBack(base64, mimeType)` returns everything the back carries:
title, artist(s), label(s), catalogue number, barcode, year, country, format,
genres, and the track list as `{ disc, n, title, duration }`. `max_tokens`
1600 — twelve tracks already consume around 700, and a double album has to
fit.

Both reuse `prepareImage` and `parseResponse`; the latter already strips
```json fences and `<think>` blocks. Both prompts state the transcription rule
explicitly and forbid drawing on knowledge of real albums.

Multi-disc sets are read from whatever the sleeve prints — "CD1 / CD2",
"Disc 1", or a restart of the numbering. The prompt asks for a `disc` number
per track, defaulting to 1.

### 2. Merge

In `musicService`, because it is domain logic rather than transport. The two
calls run in parallel through `Promise.allSettled`, so one failing does not
lose the other.

Precedence, fixed and explicit because nothing may be invented:

| Field | Winner | Why |
|---|---|---|
| title, artist | front, else back | The front is the canonical rendering; the back repeats it in small type. |
| tracks, label, catalogueNumber, barcode, year, country, genres | back, else front | Only the back carries them. |
| format | back, else front | The back states "Compact Disc" and similar. |

A field neither call returns stays empty. The result carries
`sources: { front: 'ok' | 'failed' | 'absent', back: ... }` so the UI can say
what happened.

Durations arrive as `"m:ss"` and are converted to seconds server-side, next to
the merge. `discogsService` has a private `durationToSeconds`; rather than
export it from a module about a different upstream, an equivalent local helper
lives with the merge and is tested there.

### 3. Endpoint

`POST /api/music/transcribe-sleeve`, body `{ front?: { image, mimeType },
back?: { image, mimeType } }`.

| Condition | Status |
|---|---|
| Neither image supplied | 400 |
| Both calls fail, model unreachable | 503, matching `scanCover`'s taxonomy |
| Both calls fail, model reachable but read nothing | 422 |
| At least one call succeeds | 200 with the draft and `sources` |

The existing `Network error` / `HTTP 5xx` classification from `requestFailure`
decides 503 against 422, exactly as `scanCover` does today.

### 4. Cover geometry

Server-side, in a new `sleeveGeometry` module, invoked from the existing
`uploadCustomCover` path when the upload is flagged as coming from a sleeve
photo. Pure TypeScript over raw pixel buffers from `sharp`; no new dependency.

`detectSleeveQuad(buffer)` → four corners or `null`:

1. Downscale to 400 px on the long edge and convert to greyscale.
2. Sobel gradient magnitude, then threshold at a percentile of the magnitude
   histogram so it adapts to contrast rather than using a fixed cut.
3. Hough transform over the edge map; keep the dominant lines, split into a
   near-horizontal and a near-vertical family by angle.
4. Take the two outermost lines of each family and intersect them pairwise for
   four corners.
5. Reject and return `null` unless the quadrilateral is convex, covers at
   least 15% of the frame, and has opposite sides within a factor of three —
   the confidence gate.

`warpToSquare(buffer, quad, size)` computes the homography mapping the
quadrilateral to a square and samples the source bilinearly, walking the
destination pixels and inverting the transform per pixel. At 1200×1200 that is
1.4M samples, a few hundred milliseconds in Node.

When `detectSleeveQuad` returns `null`, the full photo is centre-cropped to a
square and stored as it is. That is still better than today, where the photo is
discarded entirely. **The auto-crop is an improvement on a working path, never
a precondition for one** — a wrong crop must never be preferred to an
untouched photo.

### 5. Interface

`SleeveCapture`, a new component: two capture slots, front and back, each
accepting a photo, a progress state while the request is in flight, and a
result summary ("12 tracks read"). Either slot may be left empty.

Two entry points, as requested:

- **After a fruitless scan.** The empty state of the scan results gains
  "Fill from your photos". The front photo has just been taken, so it is
  reused and only the back is asked for.
- **From manual entry.** `handleManualEntry` currently calls
  `onReviewMetadata(null)` and opens an empty `MusicForm`. It gains a step
  offering the capture first, skippable.

On success `MusicForm` opens pre-filled. Fields the transcription did not fill
are simply empty; there is no per-field marking, because with strict
transcription everything present was read off the sleeve and everything absent
was not.

The full-resolution front photo is held in component state — not the
downscaled copy sent to the model — and uploaded through the existing
`/api/music/albums/:id/upload-cover` once the album has an id.

## Failure handling

| Failure | Behaviour |
|---|---|
| Model unreachable | 503, message distinguishes it from a bad photo; the form still opens empty on the user's command |
| One of the two calls fails | The other fills the form; `sources` reports it |
| Model returns unparseable text | `parseResponse` already falls back to regex extraction; if that fails too the call counts as failed |
| Track list partially read | Whatever was read is kept; missing rows are left for the user |
| Quadrilateral not found | Centre-cropped full photo |
| Upload of the cover fails | The album is already saved; the cover is simply absent and can be added later |

## Testing

Deterministic, with `axios` mocked, in the style of `tests/music`:

- Prompts forbid outside knowledge and request the documented JSON shape.
- Merge precedence per the table above, including both directions of fallback.
- `"m:ss"` and `"h:mm:ss"` to seconds; malformed durations dropped, not zeroed.
- Multi-disc grouping from `disc` numbers.
- Partial failure: front fails, back fills; and the reverse.
- Endpoint statuses: 400, 503, 422, 200.
- `detectSleeveQuad` against synthetic images with a known applied warp, corners
  asserted within tolerance; and against images with no rectangle, asserting
  `null` rather than a bad guess.
- `warpToSquare` against a known homography, sampled pixels compared.

Frontend, with `vitest`: `SleeveCapture` renders both slots, posts what it
captured, opens the form pre-filled, and still opens it on a partial result.

Accuracy is measured separately. The synthetic back cover and its expected
JSON go into `evalsets/cd import/`, exercised only under `RUN_LLM_TESTS=1`
like the other evalsets, so a misread cover never reddens the default suite.

## Deliberately excluded

- Identifying the release, or completing it from the model's knowledge.
- Reading the booklet: credits, personnel, recording locations. Those are set
  in far smaller type and would need a different capture entirely.
- Searching the web for cover art. The premise is a record absent from the
  reference databases; the user's own photo is the reliable source, and
  fetching arbitrary hosts would mean widening `TRUSTED_COVER_HOSTS`, which
  exists to stop the server being pointed at arbitrary URLs.
- Raising `LLM_IMAGE_MAX_PX`. Measured as unnecessary.
