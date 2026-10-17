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
| A list in a form | `Select` |
| ‹ › to the item before or after, in a detail dialog | `DetailSteps` |
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
- Closed it is a field like the others (`form-select`); `bare` keeps a class of
  its own instead, for a word to change inside a sentence.
- An empty value (`""`) is the field's "Choose…": quiet in the list, never gold.
- On an iPhone or an iPad it is the system's own select, its wheel.

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

- [ ] No `react-bootstrap` `Button` or `Dropdown`, no `btn` class, no `<select>`, no hand-made tabs or chips.
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
| Dialogs | 14 files with react-bootstrap `Modal`, 19 with an overlay of their own (`*-overlay`, `*-modal`), `window.confirm` in 3 | `Dialog`, `ConfirmDialog` |
| Text fields | 123 `Form.Control`, 28 raw `<input>`, each with its own look | `TextField` |
| Notices | 19 react-bootstrap `Alert`, the page's own alert (`onShowAlert`) | `Notice`, a toast |
| Loading | `spinner-border`, `Spinner` and spinners of their own in 33 files | `Spinner` |
