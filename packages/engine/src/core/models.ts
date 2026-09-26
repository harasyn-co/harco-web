// Particle models: how a layer's particles move and draw, tuned per job.
// The same shaders run every model; a model is the numbers they're given.
//   flight:  base speed, extra speed per unit of distance, how much they
//            swirl on the way, and how quickly they steer (per second)
//   capture: how close (world units) a particle must come before it latches
//            onto its point; fast-moving points need a wider reach
//   size:    multiplier on the style's particle size
//   snap:    align particles to the pixel grid (crisp text and UI)
//   instant: no flight: particles are on their points (or at rest) at once
//   form:    with instant, seconds to gather out of dust spread across the
//            view instead of appearing at once
//   dissolve: seconds a removed layer takes to scatter back out into the view
//   pointSize: size relative to the layer's own units, drawn as square
//            pixels whatever the style: 1 = one source pixel of a raster
//            (pre-rendered text: one particle per pixel, at any scale)
//   budget:  share of the auto particle count to use (Lite only)
//   dprCap:  highest pixel ratio to render at (Lite only)
export type ModelName = "sculpt" | "type" | "relief" | "wave" | "lite" | "print"

export interface ParticleModel {
  label: string
  description: string
  flight: [speed: number, gain: number, swirl: number, steer: number]
  capture: number
  size: number
  snap: boolean
  instant?: boolean
  form?: number
  dissolve?: number
  pointSize?: number
  budget?: number
  dprCap?: number
}

export const MODELS: Record<ModelName, ParticleModel> = {
  sculpt: {
    label: "Sculpt",
    description: "3D forms: particles drift in on a current and ride the surface.",
    flight: [0.6, 1.8, 0.9, 3],
    capture: 0.02,
    size: 1,
    snap: false,
  },
  type: {
    label: "Type",
    description: "Text and UI: fast, direct, settles crisply on the pixel grid.",
    flight: [1.4, 4, 0.15, 7],
    capture: 0.12,
    size: 1,
    snap: true,
  },
  relief: {
    label: "Relief",
    description: "Image shapes: dense and steady, a little larger.",
    flight: [0.8, 2.2, 0.4, 4],
    capture: 0.04,
    size: 1.15,
    snap: false,
  },
  wave: {
    label: "Wave",
    description: "Harmonics: springy, keeps up with fast-changing shapes.",
    flight: [1.2, 3.5, 0.25, 6],
    capture: 0.25,
    size: 1,
    snap: false,
  },
  lite: {
    label: "Lite",
    description: "Modest hardware: half the particles, no swirl, 1x pixels, larger dots.",
    flight: [0.8, 2, 0, 3.5],
    capture: 0.03,
    size: 1.3,
    snap: false,
    budget: 0.5,
    dprCap: 1,
  },
  print: {
    label: "Print",
    description: "Pre-rendered text and UI: one particle per pixel, gathering out of dust across the view into exact type.",
    flight: [3, 8, 0, 12],
    capture: 1,
    size: 1,
    snap: true,
    instant: true,
    form: 1.2,
    dissolve: 0.7,
    pointSize: 1,
  },
}

export const MODEL_NAMES = Object.keys(MODELS) as ModelName[]
