# DexVault design guidelines

How DexVault looks, and the components that make it look that way. Read this
before writing any UI. Every component named here lives in
`frontend/src/components/shared/`; its look lives in one stylesheet beside it,
and nowhere else.

The prototypes the choices were made on are kept in `docs/superpowers/specs/`:
`2026-10-17-menus/menus-prototype.html`, `2026-10-17-boutons/boutons-prototype.html`,
`2026-10-17-listen-next-lecture/listen-next-leaving.html`.

## Principles

1. **One material.** Everything that floats or can be pressed is the same dark
   glass with a light edge: tags and round buttons on covers, menus, secondary
   buttons. Do not invent another surface.
2. **Gold means "on" or "to do", never "pointed at".** In Listen or Watch Next,
   wished, playing, the choice made, the one action a window is for. Hovering
   shows a light veil, not gold.
3. **One gold action per window.** The action the window is for (Play, Save,
   Rename, Add). Everything else is secondary or quiet.
4. **Red is danger, and danger never takes the gold.** In a confirmation, the
   destructive action stands where the gold one would, in red.
5. **Mark only what differs.** A CD in FLAC is bare; a tag says what is unusual
   (lossy, not ripped, spiders). Do not decorate the normal case.
6. **A component's own stylesheet only places things.** Margins, position,
   flex and grid, z-index. Never the colours, borders, padding or size of a
   button, a menu or a tag: those belong to the shared component.
7. **Words are English in the UI**, sentence case ("Add to wish list"), with
   the ellipsis for an action that asks more ("Write a listening note…").

## Colour and shape: `tokens.css`

Every colour, glass, height and radius is a token in
`frontend/src/tokens.css`, loaded first. Use the token, never the value it
stands for: `color: var(--dv-gold)`, not `#fbbf24`. The shared components name
their own variables after the tokens (`--button-gold: var(--dv-gold)`); a new
colour goes into `tokens.css` first.

| Role | Token |
|---|---|
| Gold: on, to do, the main action | `--dv-gold`, `--dv-gold-hover`, `--dv-gold-light`; ink on it `--dv-gold-ink`; a tint and its edge `--dv-gold-tint`, `--dv-gold-tint-edge` |
| Danger, alert | `--dv-danger`, `--dv-danger-tint`, `--dv-danger-tint-edge` |
| To check or do again (a copy to rip again, a backup too old) | `--dv-orange` |
| Words | `--dv-text`, `--dv-text-muted`, `--dv-text-faint` |
| The page | `--dv-page` |
| Glass on the page (buttons, pills, chips) | `--dv-glass`, `--dv-glass-hover`, `--dv-edge`, `--dv-edge-hover`; under the pointer `--dv-veil` |
| Glass on a picture (covers, posters) | `--dv-glass-image`, `--dv-glass-image-hover`, `--dv-edge-image`, `--dv-lift-image`, `--dv-ring-image` |
| A floating panel (menus) | `--dv-surface`, `--dv-surface-edge`, `--dv-surface-shadow` |
| Focus by the keys | `--dv-ring` |
| Heights | `--dv-height-sm` 28 px (a bar's controls), `--dv-height-md` 36 px (a dialog's buttons), `--dv-height-cover` 34 px |
| Radii | `--dv-radius-sm` 7 px, `--dv-radius-md` 9 px, `--dv-radius-lg` 12 px; round on covers |

## Components

### I need… → use

| I need | Component |
|---|---|
| A button with words | `Button` |
| A link that looks like a button (Ricardo, Navidrome) | `LinkButton` |
| One of a few, side by side: the app's sections, a search's kind, tabs | `Segmented` |
| A filter to turn on, a shelf to jump to, a filter in place with its ✕ | `Chip` |
| An icon alone: ✕, pencil, bin, ✓ beside a field | `IconButton` |
| A round button on a cover, a poster, a book | `CoverButton` |
| A tag on a cover | `CoverTag`, several in a `CoverTagStack` |
| A menu that opens from a button (actions or a choice) | `Menu` |
| A field: words, a number, a date, a search | `TextField`, several lines `TextArea` |
| Why a field will not do, a word on what to put in it | `FieldError`, `FieldHint` |
| Suggestions under a field | `menu-surface` and `menu-item` (as `AutocompleteInput`) |
| A list in a form | `Select` |
| A dialog: a form, a search, a record's card | `Dialog` (`Dialog.Body`, `Dialog.Footer`) |
| A question before doing something (delete, restore) | `confirm()`, or `ConfirmDialog` |
| ‹ › to the item before or after, in a detail dialog | `DetailSteps` (in a `Dialog`, its `steps`) |
| A word in a window or on a page: to know, done, to check, failed | `Notice` |
| A word that passes (exported, added, failed, with Undo) | `toast()` |
| An empty page | `EmptyState` |
| ▶ / ❚❚ on an album's cover | `AlbumPlayButton` |

### Button, LinkButton, IconButton (`Button.tsx`, `button.css`)

```tsx
<Button variant="primary" icon={<BsPlayFill />} onClick={play}>Play</Button>
<Button onClick={edit} icon={<BsPencil />}>Edit</Button>            {/* secondary by default */}
<Button variant="quiet" onClick={onCancel}>Cancel</Button>
<Button variant="danger" active={confirming} loading={deleting} onClick={remove}>Delete</Button>
<Button size="sm" active={inListenNext} onClick={toggle}>Listen Next</Button>
<LinkButton size="sm" icon={<BsSearch />} href={url} external>Ricardo</LinkButton>
<IconButton label="Close" onClick={onClose}><BsX /></IconButton>
<IconButton label="Save" tone="confirm" size="sm" onClick={save}><BsCheck /></IconButton>
```

- `variant`: `primary` (one per window), `secondary` (default), `quiet` (words
  alone), `danger`.
- `size`: `sm` (28 px, in bars and rows) or `md` (36 px, dialogs).
- `icon` goes before the words: pass it there, not inside the children.
- `loading` shows a spinner and blocks a second click. Keep the words saying
  what happens ("Saving…").
- `active` is a toggle that is on: gold words on a gold-tinted glass. On
  `danger`, plain red: a deletion to confirm.
- `IconButton` always has a `label` (its tooltip and its name for screen
  readers). `tone="confirm"` is gold, `tone="danger"` reddens under the
  pointer, `boxed` puts it on its own glass when it stands alone or over a
  picture.
- Side by side as one shape (Play and its ▾): wrap them in an element with the
  class `ui-button-group`.

### Dialog, confirm() (`Dialog.tsx`, `ConfirmDialog.tsx`, `dialog.css`)

```tsx
<Dialog onClose={close} icon={<BsDisc />} title="I bought the CD">
  <Dialog.Body>…</Dialog.Body>
  <Dialog.Footer>
    <span style={{ flex: 1 }} />
    <Button variant="quiet" onClick={close}>Cancel</Button>
    <Button variant="primary" onClick={save}>Into my collection</Button>
  </Dialog.Footer>
</Dialog>

<Dialog variant="panel" onClose={close} icon={<BsDisc />} title={album.title}
  aside={<ShelfCode … />} steps={{ onPrevious, onNext, noun: 'album' }}>…</Dialog>

if (await confirm({ title: 'Delete this backup?', message: '“x.zip” goes for good.', confirmLabel: 'Delete', danger: true })) { … }
```

- **One head everywhere**, the one an album's card first had: `icon`, `title` (a
  long one ends in "…"), `aside` (what tells it apart: a shelf, marks, a
  murmur), `steps` (‹ ›), ✕; `onBack` puts ← before the icon. Under it a line,
  and a line over the foot.
- `variant="center"` (a form, a search, a question) or `variant="panel"` (a
  record's card along the right edge). `size` sm/md/lg; a panel and a large
  dialog take the whole screen on a phone.
- `modal` for a question to answer: no ✕, a click beside it does nothing.
- It leaves before it tells: ✕, Esc or a click beside it slide or fade it
  out, then `onClose` runs. A button inside that closes it should call
  `useDialogClose()` rather than unmount it.
- In the foot, what the dialog is for goes right and in gold, Cancel before it, quiet.
- **Never `window.confirm`**: `await confirm({ title, message, confirmLabel, danger })`
  asks in DexVault's own dialog (`ConfirmHost` is mounted once in `App`). A
  question that cannot be undone is `danger`: red, a bin, never gold.
- A movie's card keeps its own card and backdrop, under the same `DialogHeader`,
  a glass the backdrop runs under.

### Segmented (`Segmented.tsx`, `segmented.css`)

```tsx
<Segmented label="Search by" value={searchBy} onChange={setSearchBy} options={[
  { value: 'title', label: 'Album Title' },
  { value: 'barcode', icon: <BsUpcScan />, label: 'Barcode' },
]} />
<Segmented label="Shelves" kind="tabs" value={tab} onChange={setTab}
  options={sections.map(s => ({ value: s.key, label: s.label, count: s.items.length }))} />
<Segmented label="Collections" size="lg" tone="gold" reselect value={section} onChange={go}
  options={[{ value: 'filmdex', icon: <BsFilm />, tooltip: 'FilmDex - My precious movies' }]} />
```

- A dark groove, the options in it; the one chosen wears a light veil, or
  plain gold with `tone="gold"` (the app's sections, a filter).
- `kind="choice"` (default, a radio group) or `kind="tabs"` (one panel among
  several). `size` sm/md/lg, `block` to fill its place, `count` after the
  words, `tooltip` for an option with an icon alone (it names it, too).
  `reselect` calls `onChange` on the one chosen as well.
- Options may be `false` or `null`, to leave one out conditionally.

### Chip (`Chip.tsx`, `chip.css`)

```tsx
<Chip active={filter === 'buy'} icon={<BsCartFill />} count={12} onClick={() => setFilter('buy')}>Buy</Chip>
<Chip tone="gold" muted={empty} count={n} onClick={jump}>A-3</Chip>
<Chip onRemove={() => remove(f)} removeLabel={`Remove the filter ${f.label}`}>{f.label}</Chip>
```

- Small and rounded, the glass of the page; `active` is gold words on a gold
  tint. `tone` colours its words by meaning (gold a shelf, alert what has no
  room), `muted` is half seen (nothing there), `count` follows the words.
- With `onRemove` it is a filter in place: the chip does nothing, its ✕ takes it away.
- An action that is not a filter ("Today", "Yesterday") is a `Button size="sm"`, not a chip.

### Menu (`Menu.tsx`, `menu.css`)

```tsx
<Menu label="Sort" trigger={(props, open) => (
  <button type="button" {...props} className="menu-pill">
    <span className="menu-pill__lead"><BsSortDown /></span>
    <span className="menu-pill__muted">Sort:</span> {label}
    <MenuChevron open={open} />
  </button>
)}>
  {options.map(o => <Menu.Choice key={o.value} selected={o.value === value} onSelect={() => set(o.value)}>{o.label}</Menu.Choice>)}
</Menu>

<Menu align="end" trigger={props => <CoverButton {...props} label="More" reveal="always"><BsThreeDots /></CoverButton>}>
  <Menu.Item icon={<BsPencil />} onSelect={edit}>Edit</Menu.Item>
  <Menu.Separator />
  <Menu.Item icon={<BsTrash />} danger onSelect={remove}>Delete</Menu.Item>
</Menu>
```

- The trigger is any button: spread `props` on it, ref included (`Button`,
  `IconButton` and `CoverButton` all take it). `menu-pill` is the dark pill of
  a bar's choices (Sort, Grouping).
- Entries: `Menu.Item` (an action: `icon`, `hint`, `danger`, `disabled`),
  `Menu.Choice` (one of several: `selected` wears the gold ✓), `Menu.Section`
  (a small-capitals title), `Menu.Separator`.
- `align` start/end, `drop` down/up (it flips by itself when there is no room),
  `matchWidth` to be as wide as its trigger.
- Keys: ↑ ↓ Home End, a letter to jump, Enter, Esc, Tab. In a modal it lies in
  the modal, which keeps the focus.

### TextField, TextArea (`TextField.tsx`, `field.css`)

```tsx
<Form.Group controlId="artist">
  <Form.Label>Artist *</Form.Label>
  <TextField value={artist} onChange={e => setArtist(e.target.value)} isInvalid={!artist} />
  <FieldError>{!artist && 'An album needs its artist.'}</FieldError>
</Form.Group>
<TextField size="sm" type="search" icon={<BsSearch />} placeholder="Find on the shelves…" />
<TextField inputMode="decimal" suffix="CHF" />
<TextArea rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
```

- A hollow a little darker than its dialog (`#1f1f1f`), a grey edge, lighter
  under the pointer; **gold** edge and ring with the focus; **red** edge with
  `isInvalid`. The same look closed for a `Select`.
- `size` **md** (36 px) in a form, **sm** (28 px) in a bar or an edit in place.
  `icon` before the words, `suffix` (a unit) after them, both inside.
- The props of an `<input>` (or a `<textarea>`), its `ref`; in a `Form.Group`
  its `controlId` names it.
- A date's calendar and a number's arrows are drawn for a dark page
  (`color-scheme: dark`): never paint them by hand.
- Fields side by side under their labels: a grid `ui-fields` (`--ui-fields: 3`
  for three), so a hint under one does not push the others.
- An edit in place with ✓ ✕ inside the field: a parent of its own
  (`edit-in-place` in a movie's card), never Bootstrap's `input-group`, which
  squares the field's right corners.
- A stylesheet only places a field (width, flex, margins, `text-align`), never
  its background, edge, padding, height or font size.

### Select (`Select.tsx`)

```tsx
<Form.Group controlId="condition">
  <Form.Label>Condition</Form.Label>
  <Select value={condition} onChange={e => setCondition(e.target.value)}>
    <option value="">Choose…</option>
    <optgroup label="Graded">
      <option value="M">Mint</option>
    </optgroup>
  </Select>
</Form.Group>
```

- The same `<option>`s and `<optgroup>`s as a `<select>`, the same
  `onChange(event)` (`event.target.value`, `event.target.name`), `size`,
  `disabled`, `id`, `name`; in a `Form.Group` its `controlId` names it.
- Closed it is a field like the others (`ui-input`); `bare` keeps a class of
  its own instead, for a word to change inside a sentence.
- An empty value (`""`) is the field's "Choose…": quiet in the list, never gold.
- On an iPhone or an iPad it is the system's own select, its wheel.

### Notice, toast() (`Notice.tsx`, `Toast.tsx`, `notice.css`)

```tsx
<Notice tone="warning" title="No backup in the last 48 hours"
  action={<Button size="sm" onClick={backUp}>Back up now</Button>}>
  The last copy to Dropbox was made on 14.10.2026.
</Notice>
<Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>

toast('CSV exported: 217 movies.', { tone: 'success' });
toast('“Heat” left your Watch Next.', { action: { label: 'Undo', onClick: putBack } });
```

- Four tones, and no blue or green: **info** grey (a thing to know, the
  default), **success** a gold ✓ (it is done), **warning** orange (to check or
  do again), **danger** red (it did not work).
- A **Notice** stands in its window or on its page: dark glass, a stripe of its
  tone on the left, its icon in that tone, the words in the text's colour.
  `title` a first line in bold, `action` a small button at its end, `onClose`
  a ✕. Danger is said at once (`role="alert"`), the rest politely
  (`role="status"`).
- A **toast** passes: at the bottom, above the player, in the menus' glass, a
  thread of its tone running out; gone after 6 s (`duration`), held while
  pointed at, three at most. Its `action` is in gold words. `toneOf(type)`
  takes the old alerts' types (`'success'`, `'danger'`, `'error'`…).
  `ToastHost` is mounted once in the app; in a test, render it beside the
  component and `resetToasts()` after.
- What a window did (saved, uploaded) is a toast; why a form cannot go on is a
  Notice in the form; why one field will not do is a `FieldError` under it.

### CoverTag, CoverButton (`CoverTag.tsx`, `CoverButton.tsx`, `cover.css`)

Everything laid over an album cover, a poster or a book cover.

- `CoverTag` `variant`: `plain`, `gold` (a format, a shelf), `orange` (a copy to
  do again), `muted` (not known, not ripped), `alert` (spiders, snakes, a book
  lent), `on` (to do: wished, to buy). Square corners, small capitals.
- `CoverButton` (`label`, `active`, `size` small/normal/large, `reveal`
  hover/dim/always): round, white, a white ring under the pointer, plain gold
  when `active`. `reveal="hover"` shows while the card holding it, with the
  class `cover-host`, is hovered.

## In tests

- Find a button by its role and name: `getByRole('button', { name: 'Delete' })`,
  never by a class or by its words alone (the words sit in a `<span>` of the
  button).
- A `Select`: `frontend/src/test/select.ts` gives `selectedValue(field)`,
  `selectValues(field)` and `chooseValue(field, value)`.
- A `Menu`: click its trigger, then `getByRole('menuitem' | 'menuitemradio', { name })`.

## Before you open a pull request

- [ ] No `react-bootstrap` `Button`, `Dropdown` or `Modal`, no `btn` class, no `<select>`, no hand-made tabs, chips or overlays, no `window.confirm`.
- [ ] At most one `primary` button per window; nothing destructive in gold.
- [ ] Every `IconButton` has a `label` that says what it does.
- [ ] Your stylesheet only places the shared components, and its colours are tokens.
- [ ] Checked in the browser, light on an image and on the page, with the
      keyboard too.

## Not yet unified

These still have their own styles, file by file, and are the next components
to make. Counts are of October 2026.

| Family | Today | To make |
|---|---|---|
| Loading | `spinner-border`, `Spinner` and spinners of their own in 33 files | `Spinner` |
