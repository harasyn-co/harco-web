# @harasyn/engine

Particles that gather into things: 3D forms, self-drawing curves, and (coming)
harmonics, images and UI. Framework-free TypeScript on WebGL2.

```ts
import { createField } from "@harasyn/engine"

const field = createField(canvas, { style: { palette: "ember" } })
field.set({ camera: { projection: "isometric" } })
field.morph({ type: "shape", form: "knot" }, { via: "reservoir" })
```

## The scene

Everything the field shows is one JSON object, the **scene**, described by
[`src/scene.schema.json`](src/scene.schema.json) (also exported as
`SCENE_SCHEMA`). Every field there has a description; read it before writing
scenes. The parts:

| Part        | What it controls                                                     |
| ----------- | -------------------------------------------------------------------- |
| `source`    | What the particles gather into: a built-in `shape`, a custom `sdf`, or a self-drawing `curve` |
| `style`     | How particles are drawn (`dots`, `squares`, `streaks`, `ascii`), size, opacity, `palette` |
| `camera`    | `perspective` or `isometric`, yaw, pitch, spin, zoom, drag to rotate |
| `particles` | Particle `count`, or `"auto"` to pick by device and adapt to frame rate |
| `reservoir` | Where idle particles wait: a soft `band`, `field` dust, or `none`    |
| `motion`    | Gather and scatter timing, reserve share, `via`, and `autoplay`      |

`field.set(patch)` takes any part of a scene; what you leave out stays as it
is. `source` is replaced whole. `palette` takes a name (`v1`, `mono`, `ember`,
`ocean`, `phosphor`, `paper`) or colours to change. Invalid patches throw a
`SceneError` whose `problems` name each bad setting, and change nothing:

```
style.size: must be at most 20 (got 99)
style.palette.rim: must be a hex colour, like #d9d6ce (got "teal")
```

`validateScene(patch)` returns the same list without applying anything.

## Commands

| Call                         | Does                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `set(patch)`                 | Apply part of a scene                                     |
| `morph(source, { via })`     | Gather into a new source, sliding over or via the reservoir |
| `scatter()` / `gather()`     | Let the form fall away / build it again                   |
| `getScene()`                 | A copy of the current scene                               |
| `getView()`                  | Live yaw and pitch, including spin and dragging           |
| `stats()`                    | Frame rate, particle count, quality level, reduced motion |
| `on(event, fn)`              | `source`, `quality`, `contextlost`, `contextrestored`     |
| `dispose()`                  | Stop and free everything                                  |

`createField(canvas, scene?, { reducedMotion? })` throws `UnsupportedError`
without WebGL2 and float render targets; check `isSupported()` first to show a
fallback. Reduced motion follows the system setting unless given.

## Custom shapes and curves

```json
{ "type": "sdf", "glsl": "return length(p) - 0.8 + 0.1 * sin(8.0 * p.x + uTime);" }
{ "type": "curve", "glsl": "return vec3(sin(3.0 * t), sin(2.0 * t), 0.0) * 0.8;", "length": 6.2832, "duration": 8 }
```

GLSL that fails to compile throws from `morph`/`set` and leaves the current
source in place.

## Playground

`npm run dev -w @harasyn/playground` opens every setting as a control, plus
the scene as editable JSON. "Copy link" puts the scene in the URL.
