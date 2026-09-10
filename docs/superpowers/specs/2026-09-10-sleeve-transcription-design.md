# Filling the album form from photos of the sleeve

2026-09-10 · revised after review

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

## Evidence

Measured against `Qwen3.6-35B-A3B` on `llm-next.lab.crog.org`, using rendered
CD back covers whose ground truth is exact, at the proportions of a 120 mm
jewel case (track text 2 mm tall, 1.7% of the width). The fixtures live in
`evalsets/sleeve transcription/`.

| Image sent | Track titles | Durations | Time |
|---|---|---|---|
| Flat render, 1024 px | 12/12 | 12/12 | 8.5 s |
| Flat render, 2048 px | 12/12 | 12/12 | 17.2 s |
| Degraded: rotated 6°, diagonal glare, contrast reduced, sleeve fills 55% of frame, 1024 px | 12/12 | 12/12 | 6.5 s |
| Same, cropped tight to the sleeve | 12/12 | 0/12 | 7.3 s |
| Two-disc set, "CD 1" / "CD 2" columns, 1024 px | 10/10, split 6+4 correctly | 10/10 | 8.1 s |

**These are single measurements on synthetic images, not a benchmark.** They
are enough to choose between options and not enough to promise field accuracy.
The evalset exists so the claims can be upgraded by measurement rather than by
assertion. Read every conclusion below as provisional at n=1.

1. **The existing 1024 px ceiling is enough.** `LLM_IMAGE_MAX_PX` stays at
   1024 and `prepareImage` is reused unchanged. Doubling the resolution
   doubled the latency and changed nothing else.
2. **Nothing is cropped before transcription.** The tight crop lost the
   duration column and the catalogue number, scoring 0/12 on durations. That
   crop was crude, so this shows the risk is real rather than that cropping is
   inherently harmful — but the uncropped frame already scores perfectly, so
   the risk is not worth taking.
3. **`Qwen3.6-35B-A3B` is the right model and is already the default.**
   Against `Qwen2.5-VL-7B` (the `vl-ocr` container), smaller and
   vision-specialised: 12/12 titles but **1/12 durations** in 16.9 s, against
   12/12 and 12/12 in 6.5 s. On a rotated photo the duration column no longer
   lines up with its rows, and associating them takes spatial reasoning the 7B
   model does not do.
4. **Multi-disc works.** The two-disc fixture splits 6 + 4 on the printed
   headings rather than merging restarted numbering.

## Cover geometry: deferred, with reasons

The original design proposed detecting the sleeve's quadrilateral and warping
it square. Three routes were probed and all three were rejected:

- **Ask the model for the corners.** Asked loosely once, it returned the four
  edges within 1% of ground truth — promising. Repeated three times with the
  identical prompt, it returned four boxes once and **three the other twice**,
  losing an edge outright, with coordinate order inverting between runs
  (`[799, 300, 747, 801]`). Not reproducible enough to drive a homography.
- **Extreme points on a background-difference mask** (largest region, corners
  as the extremes along the four diagonals). Prototyped against the degraded
  fixture: **32% error**. The glare gradient shifts the background estimate,
  and the mask bleeds to the frame edge.
- **Sobel + Hough + homography by hand.** Sound, and roughly 400–600 lines of
  numerical code with an unbounded tuning loop, whose only honest test is a
  corpus of real photographs with hand-marked corners that does not exist.

Two further facts settle it. `uploadCustomCover` already resizes to 1000×1000
(`musicController.ts:566`), which partly negates a 1200 px warp; and the
endpoint is shared with `MusicForm`'s drag-and-drop upload, so changing its
behaviour would change existing manual uploads too.

**Tonight the front photo is uploaded as-is.** Today it is discarded entirely,
so keeping it is the bulk of the value; the framing is imperfect. If skew
matters later, the right next step is a draggable four-corner overlay in the
browser: the user supplies the corners, detection disappears, the warp becomes
a pure deterministic function, and that overlay is the necessary manual
override for any future auto-detection anyway.

## Shape of the change

```
back photo ──→ POST /api/music/transcribe-sleeve ──→ transcribeSleeveBack ──┐
front photo ─→ (same request, only when no scan preceded) → …Front ─────────┤
                                                                     merge ─┴─→ draft
                                                                               │
                                                        toMusicFormDraft ──────┤
                                                                               ▼
                                                              MusicForm, pre-filled
                                                                               │
                                            on save, with the new album id ────┴─→ upload-cover
```

Nothing reaches the database until the user submits the form.

### 1. Transcription service

Two functions in `coverScanService`, beside the untouched `analyzeAlbumImage`,
which serves identification and has different goals.

`transcribeSleeveBack(base64, mimeType)` returns everything the back carries:
title, artist(s), label(s), catalogue number, barcode, year, country, format,
genres, and tracks as `{ disc, n, title, duration }`. `max_tokens` 1600 —
twelve tracks consume about 700 and a double album has to fit.

`transcribeSleeveFront(base64, mimeType)` returns only title, artist(s) and
format. `max_tokens` 300.

Both reuse `prepareImage` and `parseResponse`, which already strips ```json
fences and `<think>` blocks and falls back to regex extraction. Both prompts
state the transcription rule and forbid drawing on knowledge of real albums.

**The front call is skipped whenever a scan preceded.** `analyzeAlbumImage`
has already returned artist, title, year and format for that same photo and
`AddMusicDialog` holds it in `scanSummary`; re-sending the image would cost a
second seven-second round trip for data already in hand.

### 2. Merge

In `musicService`. The calls run through `Promise.allSettled`, so one failing
does not lose the other.

| Field | Winner | Why |
|---|---|---|
| title, artist | front, else back | The front is the canonical rendering; the back repeats it in small type. |
| tracks, label, catalogueNumber, barcode, year, country, genres | back, else front | Only the back carries them. |
| format | back, else front | The back states "Compact Disc" and similar. |

A field neither call returns stays empty. The result carries
`sources: { front: 'ok' | 'failed' | 'absent', back: … }`.

The merge also **strips anything outside the transcription schema** — an
identifier such as `musicbrainzReleaseId` must never survive into the draft,
or a hand-entered album could be mistaken downstream for a matched release.

Durations arrive as `"m:ss"` or `"h:mm:ss"` and become seconds beside the
merge. Malformed values are dropped, not coerced to zero.

### 3. Draft adapter

`toMusicFormDraft(merged)`, a pure function, translating the transcription
shape into what `MusicForm` actually consumes. This is where the feature is
most likely to break silently, so it is written and tested before the endpoint
that feeds it.

`MusicForm` expects `discs: [{ number, tracks: [{ trackNumber, title,
durationSec, isrc, … }] }]` (`MusicForm.tsx:198-210`) and normalises that on
mount when `cd` is set. The transcription emits `{ disc, n, title, duration }`.
Tracks are grouped by `disc`, ordered by `n`, and renumbered sequentially per
disc if the printed numbers collide.

### 4. Endpoint

`POST /api/music/transcribe-sleeve`, body `{ front?: { image, mimeType },
back?: { image, mimeType } }`. `express.json` is already at 50 MB
(`index.ts:73`), which fits two base64 images comfortably.

| Condition | Status |
|---|---|
| Neither image supplied | 400 |
| Every call failed, model unreachable | 503 |
| Every call failed, model reachable but read nothing | 422 |
| At least one succeeded | 200, draft plus `sources` |

`requestFailure`'s `Network error` / `HTTP 5xx` wording decides 503 against
422, exactly as `scanCover` does.

A response truncated by `max_tokens` mid-track-list must yield the rows that
did parse, reported honestly in `sources` — never an exception, never an empty
list labelled `ok`.

### 5. Interface

**The draft needs its own channel.** `onReviewMetadata(null)` is a sentinel
meaning "manual entry", and it has two consumers that both mishandle a
payload: `MusicSearch.tsx:469` falls through to the old workflow and calls
`getMusicBrainzReleaseDetails(undefined)`, overwriting the draft;
`WishListPage.tsx:377` falls through to `addAlbumFromMusicBrainz(undefined,
…)`, **an immediate POST of an album the user never confirmed**. A new
`onDraftEntry(draft)` prop is added instead and wired in both parents.

`WishListPage.tsx:1576` renders `<MusicForm>` with no `cd` prop, so its
pre-fill effect never runs. It gains one.

`SleeveCapture` presents two slots, front and back, either skippable. Its file
inputs stay **always mounted**, following the discipline documented at
`AddMusicDialog.tsx:468` — `openCamera()` clicks the input from inside the
user's tap, which iOS refuses if the input appears after a state change.

Two entry points:

- **Manual entry.** `handleManualEntry` offers the capture step before opening
  the form; skippable straight to an empty form.
- **After a fruitless scan.** The empty state at `AddMusicDialog.tsx:677`
  gains the offer. Its gate is widened: today it requires `hasSearched`, which
  a scan *failure* never sets (`:296` sets `error` and returns), so the case
  the feature exists for renders nothing. `AddMusicDialog` retains the front
  photo — today both the `File` and the base64 are locals discarded at `:302`
  — so only the back is asked for, and `scanSummary` supplies the front fields.

**Cover upload.** The photo, the album id and the form live in three different
components and none of them meet today. `MusicForm.handleSubmit` discards
`onSave`'s return value (`:523`); the id exists only in the parent's closure.
So: `onSave` returns the created album, `MusicForm` passes the retained photo
to the parent, and the upload completes **before** `handleFormSave` unmounts
the form and fetches the album — otherwise the grid renders a coverless album.

The photo is re-encoded client-side through `downscaleImage`, parameterised to
take a max edge and called at 1600 px for the cover. That yields JPEG whatever
the camera produced, which sidesteps multer's filter
(`musicController.ts:49-57`) rejecting the `image/heic` that iPhones shoot —
the primary case for this feature.

## Failure handling

| Failure | Behaviour |
|---|---|
| Model unreachable | 503, distinguished from a bad photo; the form still opens empty on request |
| One of two calls fails | The other fills the form; `sources` says so |
| Unparseable response | `parseResponse` regex fallback; failing that the call counts as failed |
| Response truncated mid-list | Rows that parsed are kept; `sources` reports partial |
| Cover upload fails | The album is saved; the cover is absent and can be added later |

## Testing

Deterministic, `axios` mocked, in the style of `backend/tests/music`:

- `toMusicFormDraft`: grouping by disc, ordering, colliding numbers
  renumbered, empty track list, shape matching `MusicForm`'s contract.
- Duration parsing: `"m:ss"`, `"h:mm:ss"`, malformed dropped not zeroed.
- Merge precedence in both directions of fallback; and that fields outside the
  schema are stripped.
- Truncated JSON yields the parsed rows and a partial `sources`.
- Endpoint: 400, 503, 422, 200.
- Front call skipped when the caller supplies the scan's summary.

Frontend, `vitest`: `SleeveCapture` renders both slots and posts what it
captured; a partial result still opens the form; the draft reaches `MusicForm`
pre-filled; the cover upload runs before the form unmounts.

Accuracy lives apart, in `evalsets/sleeve transcription/`, under
`RUN_LLM_TESTS=1` like the other evalsets, so a misread cover never reddens
the default suite.

## Order of work

Each step is a stopping point that leaves something coherent.

1. `transcribeSleeveBack`, prompt, duration helper — the back is most of the value.
2. `toMusicFormDraft` — pure, and it decides whether step 1 is usable at all.
3. The endpoint, back image only. **Ship: a back photo fills the form.**
4. `transcribeSleeveFront`, merge, `sources`. **Ship.**
5. `SleeveCapture` from manual entry, including `onDraftEntry` in both parents
   and the `cd` prop on the wishlist form. **Ship.**
6. The fruitless-scan entry point: retained photo, widened empty state,
   `scanSummary` reused for the front. **Ship.**
7. Cover upload: `downscaleImage` parameterised, id plumbed back through
   `onSave`. **Ship: the photo is no longer thrown away.**
8. Geometry. Not tonight; corner-drag overlay first if ever.

## Deliberately excluded

- Identifying the release, or completing it from the model's knowledge.
- The booklet: credits, personnel, recording locations — far smaller type,
  a different capture.
- Searching the web for cover art. The record is by premise absent from the
  reference databases, and fetching arbitrary hosts would mean widening
  `TRUSTED_COVER_HOSTS`, which exists to stop the server being aimed at
  arbitrary URLs.
- Raising `LLM_IMAGE_MAX_PX`. Measured as unnecessary.
