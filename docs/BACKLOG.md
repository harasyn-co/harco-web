# Backlog

Ideas we've agreed on and parked, roughly in order. Newest decisions first
within each item.

## Engine: text and UI from particles

Particles stay as the UI's rendering; the real DOM sits invisibly on top for
interaction and accessibility (agreed 2026-09-25, replacing "hand off to the
DOM").

1. **Layers.** Several sources on screen at once, each with a share of the
   particles (e.g. a form behind, text or UI in front). Today the engine shows
   one source at a time.
2. **Reading real elements into strokes.** Lay out a real component
   invisibly, read its geometry (boxes, borders, text runs, Lucide icons as
   SVG strokes) and turn it into particle strokes in screen space. First
   target: the contact form (`mailto:ryan@harasyn.co`).
3. **Interaction.** Live typing into inputs (particles flow into the letters),
   focus and hover responses.
4. **Agent-generated UI.** An agent emits a validated UI description; the
   browser lays it out, the engine draws it.

Related open questions: Hershey's plotter look vs our own Harco single-stroke
glyphs; weight as the main control for emphasis (headings heavier, labels
lighter).

## Engine: other inputs

- Harmonics (Chladni, Lissajous, spherical harmonics; audio later driving
  their parameters), math plots beyond curves, images, audio.
- The v1 backdrop (coloured bands, film grain, pointer stirring) as an
  optional layer.

## Site

- Share image and description for v2 (still v1's `v1-og.jpg` and text).
- `www.harasyn.co` has no DNS record (the certificate covers the apex only).
- Via-reservoir looks: should text always be pulled straight from the form?
