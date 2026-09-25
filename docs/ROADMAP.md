# Roadmap

Where the particle engine goes next, agreed 2026-09-25. Parked ideas live in
[BACKLOG.md](BACKLOG.md). Each phase lists what it unlocks and what's still
open.

Guiding decisions:

- Particles stay as the UI's rendering; real DOM sits invisibly on top for
  interaction and accessibility. Long-form reading is the exception: article
  bodies are real, selectable text that develops out of particles.
- Two UI customers: the site (articles now) and a new app, an AI assistant on
  a wall-mounted touch panel that builds small apps on the fly, driven by
  voice and shortcuts. The site's articles are the first test of the UI
  vocabulary the assistant will need.
- Image-to-shape is a studio tool that produces 3D models for the site.
- Harmonics are driven by frequency numbers (e.g. brainwave bands), not audio.

## Phase 1: Foundation, layers and particle models

**Done.** Layers and models are in the engine (`scene.layers`,
`particles.model`) and the studio (Scene tab: Model, Layers). Still to tune:
Relief and Wave are first guesses until Phases 3 and 4 give them real work,
and Lite's budget waits on the panel's hardware.

Everything later needs these.

- **Layers.** A scene holds several sources at once, each with a share of the
  particles and its own placement (3D space or screen space). E.g. a form
  behind, a headline in front.
- **Particle models.** Named behaviour and rendering profiles, chosen per
  layer, each tuned for one job:
  - *Sculpt*: today's, for 3D forms.
  - *Type*: text and UI; crisp, settles fast, no wander, pixel-aligned.
  - *Relief*: image shapes; dense, coloured from the source.
  - *Wave*: harmonics; springy, follows fast-changing targets.
  - *Lite*: a low-power profile for modest hardware (the wall panel).
- The studio picks a model per layer and can compare them, including frame
  rate on the device.
- Scene schema, validation and tests extend to layers and models; existing
  single-source scenes keep working.

Unlocks: every phase below.

## Phase 2: Articles on the site

- **Content layer.** Articles come from Markdown files in the repo through a
  small adapter (list, get by slug, metadata), so a CMS can replace the files
  later without touching the pages.
- **Reading view.** Title, metadata, dividers and navigation drawn in particles
  (Type model); the body is real HTML that develops out of particles as it
  enters the view, then stays still and selectable.
- **Transitions.** The home scene gives way to the article and back, reusing
  the form's particles.
- Accessible and indexable: real headings and text in the page, not only in
  particles.

Open: the article list design, and when the insights link goes live.

## Phase 3: Harmonics as a frequency visualiser

- A **harmonic source** driven by frequencies and amplitudes: spherical
  harmonics, Chladni plates and Lissajous figures.
- **Presets** for brainwave bands (delta, theta, alpha, beta, gamma) and custom
  frequency lists; motion is slowed to a watchable rate.
- **Equaliser mode.** Frequency amplitudes displace any form along its surface
  (low bands at the base, high at the top), so a shape can be shown and
  "played" at once.
- Studio controls for frequencies, amplitudes and presets.

## Phase 4: Image to 3D shape (studio)

- Upload an image; the subject is cut out and turned into depth, both in the
  browser with local models (licences checked; photos never leave the
  device).
- The result is a **point-cloud shape**: particles form a 3D relief of the
  subject that can rotate.
- **Palette from the image**: the subject's colours map onto the palette, with
  a complementary accent and background.
- **Animation**: breathing, turning, depth waves; a few presets.
- **Save to the site**: shapes become asset files the site loads (committed
  like looks), and can join a look's rotation.

Open: which segmentation and depth models (size vs quality vs licence).

## Phase 5: UI for the assistant

- **Component vocabulary**: a small, validated set (text, heading, card, list,
  field, button, toggle, progress, chart, message) that an AI can emit as
  JSON and the engine can draw.
- **Layout to strokes**: the browser lays components out invisibly; their
  geometry becomes particle strokes in screen space; the real elements stay on
  top for touch and screen readers.
- **Assistant states as particles**: idle, listening, thinking, speaking and
  done as distinct particle behaviours, readable from across a room.
- **Touch and shortcuts**: large targets, press feedback in particles.
- A new app in this repo (`apps/assistant`) to develop against, starting with
  a mocked assistant that assembles UIs from the vocabulary.

Open: the panel's hardware (sets the Lite model's budget), the assistant's
model and voice stack, and the first integrations to design for.

## Order

1 → 2 → 3 → 4 → 5, with 3 and 4 swappable. Phase 5's vocabulary starts small
in Phase 2 (articles use text, heading, divider, link) and grows from there.
