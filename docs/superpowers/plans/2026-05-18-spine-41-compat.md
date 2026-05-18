# Spine 4.1 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable Spine 4.1 / PixiJS 6.5.10 compatibility runtime while keeping Spine 4.2 / PixiJS 8 as the default.

**Architecture:** Extract version-specific Pixi and Spine operations behind runtime adapters. Keep the existing UI and interaction behavior in one app, but call adapter helpers for app creation, texture creation, graphics drawing, pointer coordinates, world transform updates, and PNG export.

**Tech Stack:** Vite, vanilla JavaScript modules, Node test runner, PixiJS 8, `@esotericsoftware/spine-pixi-v8`, PixiJS 6.5.10 via npm alias, `@pixi-spine/all-4.1@3.1.2`.

---

## File Structure

- Modify `package.json` and `package-lock.json` to add the PixiJS 6 alias and Spine 4.1 runtime package.
- Modify `index.html` to add a runtime selector.
- Create `src/runtime/runtimeRegistry.js` for runtime metadata and lazy adapter loading.
- Create `src/runtime/sharedSpineResourceUtils.js` for pure file parsing and atlas image matching helpers.
- Create `src/runtime/pixi8Spine42Runtime.js` for the current Pixi 8 / Spine 4.2 path.
- Create `src/runtime/pixi6Spine41Runtime.js` for the Pixi 6.5.10 / Spine 4.1 path.
- Modify `src/main.js` to use runtime adapters instead of importing Pixi and Spine directly.
- Add `src/runtime/runtimeRegistry.test.js` and `src/runtime/sharedSpineResourceUtils.test.js`.
- Update `README.md` to document the runtime selector.

## Tasks

### Task 1: Runtime Metadata Tests

**Files:**
- Create: `src/runtime/runtimeRegistry.test.js`
- Create: `src/runtime/runtimeRegistry.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RUNTIME_ID, getRuntimeOption, RUNTIME_OPTIONS } from './runtimeRegistry.js';

test('runtime registry keeps Spine 4.2 on Pixi 8 as the default', () => {
  assert.equal(DEFAULT_RUNTIME_ID, 'spine42-pixi8');
  assert.equal(getRuntimeOption(DEFAULT_RUNTIME_ID).spineVersion, '4.2');
});

test('runtime registry exposes the Spine 4.1 PixiJS 6 compatibility option', () => {
  const option = getRuntimeOption('spine41-pixi6');
  assert.equal(option.spineVersion, '4.1');
  assert.equal(option.pixiVersion, '6.5.10');
  assert.equal(RUNTIME_OPTIONS.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/runtime/runtimeRegistry.test.js`
Expected: FAIL because `src/runtime/runtimeRegistry.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `RUNTIME_OPTIONS`, `DEFAULT_RUNTIME_ID`, and `getRuntimeOption(id)` with exact IDs:

```js
export const DEFAULT_RUNTIME_ID = 'spine42-pixi8';

export const RUNTIME_OPTIONS = [
  {
    id: 'spine42-pixi8',
    label: 'Spine 4.2 / PixiJS 8',
    spineVersion: '4.2',
    pixiVersion: '8',
  },
  {
    id: 'spine41-pixi6',
    label: 'Spine 4.1 / PixiJS 6.5.10',
    spineVersion: '4.1',
    pixiVersion: '6.5.10',
  },
];

export function getRuntimeOption(id) {
  return RUNTIME_OPTIONS.find((option) => option.id === id) || RUNTIME_OPTIONS[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/runtime/runtimeRegistry.test.js`
Expected: PASS.

### Task 2: Shared Resource Helpers

**Files:**
- Create: `src/runtime/sharedSpineResourceUtils.test.js`
- Create: `src/runtime/sharedSpineResourceUtils.js`
- Modify: `src/main.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtlasImageFileMap, parseAtlasPageNames } from './sharedSpineResourceUtils.js';

test('parseAtlasPageNames reads each page header from atlas text', () => {
  const atlas = [
    'page-a.png',
    'size: 256,256',
    'format: RGBA8888',
    '',
    'page-b.png',
    'size: 512,512',
  ].join('\n');

  assert.deepEqual(parseAtlasPageNames(atlas), ['page-a.png', 'page-b.png']);
});

test('buildAtlasImageFileMap matches by exact file name and base name', () => {
  const files = [
    { name: 'page-a.png' },
    { name: 'folder\\page-b.png' },
  ];

  const result = buildAtlasImageFileMap(['page-a.png', 'page-b.png'], files);

  assert.equal(result.fileMap.get('page-a.png').name, 'page-a.png');
  assert.equal(result.fileMap.get('page-b.png').name, 'folder\\page-b.png');
  assert.deepEqual(result.warnings, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/runtime/sharedSpineResourceUtils.test.js`
Expected: FAIL because helper module does not exist yet.

- [ ] **Step 3: Implement helpers**

Move `parseAtlasPageNames` and `baseName` out of `src/main.js`. Add `buildAtlasImageFileMap(pageNames, imageFiles)` that returns `{ fileMap, warnings }` without creating textures.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/runtime/sharedSpineResourceUtils.test.js`
Expected: PASS.

### Task 3: Install Dual Runtime Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install pixi.js-v6@npm:pixi.js@6.5.10 @pixi-spine/all-4.1@3.1.2
```

Expected: `package.json` includes `pixi.js-v6` and `@pixi-spine/all-4.1`.

- [ ] **Step 2: Run existing tests**

Run: `npm test`
Expected: PASS.

### Task 4: Runtime Adapters

**Files:**
- Modify: `src/runtime/runtimeRegistry.js`
- Create: `src/runtime/pixi8Spine42Runtime.js`
- Create: `src/runtime/pixi6Spine41Runtime.js`
- Modify: `src/main.js`

- [ ] **Step 1: Extend registry**

Add `loadRuntime(id)` that dynamically imports the adapter module for the selected option.

- [ ] **Step 2: Create Pixi 8 adapter**

Move the current Pixi 8 and Spine 4.2 loading behavior from `src/main.js` into an adapter with methods:

```js
{
  createApplication,
  getCanvas,
  createRectangle,
  createGraphics,
  createTextureSource,
  loadSpine,
  createSkeletonBounds,
  createVector2,
  updateWorldTransform,
  getPointerGlobal,
  drawCircle,
  strokePolygon,
  downloadPng,
  destroySpineObject,
}
```

- [ ] **Step 3: Create Pixi 6 adapter**

Implement the same interface with `pixi.js-v6` and `@pixi-spine/all-4.1`. Use PixiJS 6 `Application` constructor, `app.view`, `Texture.from(...)`, `BaseTexture.from(...)`, `Loader` or runtime parser classes as needed by `@pixi-spine/all-4.1`.

- [ ] **Step 4: Update main app**

Replace direct Pixi and Spine imports with the selected adapter. Keep UI logic unchanged where possible.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0.

### Task 5: UI and Documentation

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`
- Modify: `README.md`

- [ ] **Step 1: Add runtime selector**

Add a select element near the resource inputs:

```html
<label class="field">
  <span>运行时版本</span>
  <select id="runtimeSelect"></select>
</label>
```

- [ ] **Step 2: Populate selector from registry**

In `src/main.js`, import `RUNTIME_OPTIONS` and set each option label/value at boot.

- [ ] **Step 3: Document usage**

Update README dependency notes to say the default path is Spine 4.2 / PixiJS 8 and the compatibility path is Spine 4.1 / PixiJS 6.5.10.

- [ ] **Step 4: Final verification**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0.
