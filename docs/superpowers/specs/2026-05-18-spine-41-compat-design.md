# Spine 4.1 Compatibility Design

## Goal

Add an optional Spine 4.1 compatibility path that uses PixiJS 6.5.10 while keeping the current PixiJS 8 / Spine 4.2 path as the default.

## Current State

The app currently imports PixiJS 8 APIs directly from `pixi.js` and imports `@esotericsoftware/spine-pixi-v8`. The main UI, stage interactions, slot list, hit testing, bone editing, and PNG export all live in `src/main.js`.

PixiJS 8 APIs used today include:

- `new Application()` plus `await app.init(...)`
- `app.canvas`
- `Assets` and `Cache`
- `TextureSource.from(...)`
- fluent `Graphics` calls such as `circle(...).fill(...)`
- PixiJS 8 pointer event shape with `event.global`

Spine 4.1 with PixiJS 6 should use the `@pixi-spine/all-4.1@3.1.2` package. Its package description is "Spine 4.1 implementation for PixiJS v6", and PixiJS 6.5.10 satisfies its Pixi 6 peer dependency range.

## Approach

Keep one UI and add runtime adapters. The user chooses a runtime before loading resources:

- `Spine 4.2 / PixiJS 8` remains the default and uses the existing `@esotericsoftware/spine-pixi-v8` path.
- `Spine 4.1 / PixiJS 6.5.10` uses a package alias for PixiJS 6 and `@pixi-spine/all-4.1`.

The app code should stop relying on version-specific Pixi and Spine details directly. Instead, a selected runtime object supplies:

- Pixi constructors and helpers for app, graphics, rectangles, points, textures, and extraction.
- Spine constructors and helpers for loading skeleton data, loading atlas data, creating a Spine display object, and updating world transforms.
- Compatibility helpers for pointer coordinates and graphics drawing.

## Package Layout

Use npm package aliases so both Pixi majors can coexist:

```json
"pixi.js": "^8.16.0",
"pixi.js-v6": "npm:pixi.js@6.5.10",
"@pixi-spine/all-4.1": "3.1.2"
```

## Runtime Files

- `src/runtime/runtimeRegistry.js`: exposes runtime IDs, labels, defaults, and lazy runtime loading.
- `src/runtime/sharedSpineResourceUtils.js`: contains pure helpers that are independent of Pixi and Spine versions.
- `src/runtime/pixi8Spine42Runtime.js`: wraps the current Pixi 8 / Spine 4.2 implementation.
- `src/runtime/pixi6Spine41Runtime.js`: wraps Pixi 6.5.10 / Spine 4.1 loading and rendering.

## Main UI Changes

Add a runtime selector near the resource inputs. Changing the selector only affects the next load. When loading:

1. Clean up the current app and object URLs.
2. Load the selected runtime adapter.
3. Create a Pixi application with that adapter.
4. Read uploaded skeleton, atlas, and images with shared helpers.
5. Ask the adapter to create the Spine object.
6. Reuse existing animation, skin, slot, hit test, transform, and export flows through adapter helpers.

## Error Handling

Version mismatch errors should mention the selected runtime. If a Spine 4.1 asset fails under the default 4.2 path, the message should suggest trying the Spine 4.1 / PixiJS 6.5.10 option.

## Testing

Add pure unit tests for:

- runtime registry metadata and default runtime
- skeleton file parsing behavior
- atlas page parsing and image matching

Then run:

```bash
npm test
npm run build
```

Manual browser verification should confirm the page initializes with both runtime options. Real asset rendering still depends on the user supplying matching Spine exports.
