# DESIGN.md

Visual rules for BenchHub. Values here are the source of truth for *why* the UI
looks the way it does; `src/app/globals.css` is the source of truth for the
numbers. If you change one, change the other.

## 1. Tone

Dark grey scale. **No hue anywhere.** Hierarchy is carried by contrast, weight
and border shape — never by colour. If you reach for a red to signal an error,
you have made a mistake; invert the element or dash its border instead.

## 2. Type

Everything is Geist Mono. `--font-sans` and `--font-mono` both resolve to it, so
the distinction between "UI text" and "code text" no longer exists — that is
intentional, this is a metrics tool.

Loaded once via `next/font/google` as `Geist_Mono`, exposed as
`--font-geist-mono` on `<html>`. `next/font` self-hosts the subset, so there is
no runtime request to Google.

Weights in use: `normal` (body), `medium` (labels), `semibold` (controls),
`bold` (headings), `black` (hero numbers). Do not add a weight that is not in
this list.

## 3. Grey ramp

Eleven steps, aliased onto Tailwind's `slate-*` so the existing call sites did
not need rewriting:

| step | hex | role |
|---|---|---|
| 50  | `#fafafa` | brightest, accent highlight |
| 100 | `#f5f5f5` | primary text, bars |
| 200 | `#e5e5e5` | primary button fill |
| 300 | `#d4d4d4` | body text |
| 400 | `#a3a3a3` | muted text, chart ticks |
| 500 | `#737373` | faint text |
| 600 | `#525252` | dashed borders |
| 700 | `#404040` | chart axis, control borders |
| 800 | `#262626` | card borders, chart grid |
| 900 | `#171717` | card surface |
| 950 | `#0a0a0a` | page background |

## 4. Role mapping

The class names still say `slate` and `sky`. That is a historical artifact of
the remap, not a colour. What matters is the **role**:

- **`slate-*` → surface ramp.** Shade numbers track lightness exactly, so
  `bg-slate-950` is the page and `text-slate-100` is a heading.
- **`sky-*` → accent, collapsed onto the bright end.** Accent is the only thing
  meant to pop, so it sits near-white. `text-sky-400` renders `#f5f5f5`, not
  blue. `bg-sky-500` (primary button) is `#e5e5e5` with `text-slate-950` text.
- **`rose` / `emerald` / `amber` / `red` → same neutral ramp.** These were
  status colours and status colour is gone. Their slots exist only so old call
  sites compile; prefer `slate-*` or the status vocabulary in new code.

## 5. Surfaces

| layer | class | hex |
|---|---|---|
| page | `bg-slate-950` | `#0a0a0a` |
| card | `bg-slate-900 border border-slate-800 rounded-xl` | `#171717` |
| input | `bg-slate-950 border border-slate-700 rounded-lg` | `#0a0a0a` |
| hover | `bg-slate-800/30` | `#262626` |
| chip | `bg-slate-800` | `#262626` |
| selected | `bg-sky-950 ring-1 ring-sky-500` | `#262626` + `#e5e5e5` ring |

Radius scale in use: `rounded` (badges), `rounded-lg` (controls), `rounded-xl`
(cards), `rounded-full` (bars, pills).

## 6. Status matrix

Defined once in `src/lib/status.ts` (`statusTone`). Five states, no hue:

| status | fill | text | border | motion | means |
|---|---|---|---|---|---|
| `COMPLETED` | `bg-white` | `text-black` | `border-white` | — | terminal, success (inverted) |
| `FAILED` | `bg-black` | `text-white` | `border-white` solid | — | terminal, broke (outlined) |
| `STOPPED` | transparent | `text-slate-400` | `border-slate-600` solid | — | terminal, cancelled |
| `RUNNING` | `bg-white/15` | `text-white` | `border-white` solid | `animate-pulse` | active now |
| `PENDING` | transparent | `text-slate-500` | `border-slate-700` **dashed** | — | queued, not started |

The rule: **inversion means success, solid outline means terminal-but-not-good,
dashed outline means not-started, pulse means live.** Never reintroduce colour
to differentiate these.

## 7. Destructive actions

Delete / Stop / Clear All use **`border-dashed border-slate-600`** with neutral
text that goes white on hover. Dashed is the "this removes things" signal.

Every destructive action goes through `confirm()` first. That is the actual
safety net now that the red is gone — do not remove it to save a click.

## 8. Chart palette

recharts takes raw hex and is not covered by the Tailwind remap, so the colours
are hand-set in `src/app/summary/page.tsx`:

| element | hex |
|---|---|
| bar fill | `#f5f5f5` |
| axis stroke | `#404040` |
| tick text | `#a3a3a3` |
| grid | `#262626` |
| tooltip bg | `#171717` |
| tooltip border | `#404040` |

Bars are white because they are the data — the only thing on the page that
should read as "hot".

## 9. Layout

Full-bleed. There is no `max-w-*` container anywhere: `<main>`, the navbar and
the setup page all run edge to edge. Padding keeps content off the viewport
edge: `px-4 sm:px-6 lg:px-8`, `py-8`. Navbar is `h-16`.

Do not reintroduce a max-width to "fix" a wide page — widen the component's own
internal grid instead.

## 10. Do / Don't

**Do**
- Reach for inversion, weight, or border style before anything else.
- Add new grey steps by extending the ramp in `globals.css` and table 3 here.
- Put status styling in `src/lib/status.ts`, not inline.

**Don't**
- Add a hue, any hue, even for warnings or destructive states.
- Introduce a second typeface or a weight outside the list in §2.
- Add hex to a component that could use a Tailwind class (recharts is the only
  exception, see §8).
- Add a `max-w-*` container.

---

### Deliberate simplifications

- `ponytail: sky-*` is aliased onto the bright end as a block rather than
  remapped per call site. A few `sky-*` uses are surfaces (`bg-sky-950`) and a
  few are accent text (`text-sky-400`), and both want the same bright-grey
  treatment by accident. If accent ever needs to differ from "white", remap
  `sky-*` to a dedicated `--color-accent-*` scale and update §4.
- `ponytail: rose/emerald/amber/red` slots are kept in `globals.css` purely so
  historical class names still resolve. Once no call site uses them, delete
  those blocks and this note.
