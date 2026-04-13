# Resolution Log: Duplicate Chunk Loading During Client-Side Navigation

This document tracks attempted fixes, measured results, and verification steps for the duplicate chunk loading bug in the Next.js App Router with Turbopack.

---

## Option A: Add `async` Attribute to Turbopack's Script Tags

**Status**: Applied — pending measurement after Rust binary rebuild

**Date**: 2026-04-13

---

### The Problem Being Solved

During client-side navigation, every route-specific JavaScript chunk is fetched **twice** over the network. Two independent code paths both create `<script>` tags for the same chunk URL, and their deduplication mechanisms fail to detect each other's scripts in the DOM.

**Path A** (Turbopack chunk loader): The RSC stream's `"I"` instruction triggers `preloadModule` → `loadChunkByUrl` → `doLoadChunk`, which creates:
```html
<script src="/_next/chunks/abc123.js"></script>
```

**Path B** (React DOM Float system): The RSC stream's component output contains `<script async>` elements rendered by `createComponentStylesAndScripts`. React DOM's Float system intercepts these and calls `preinitScript`, which checks the DOM with:
```javascript
document.querySelector('script[async][src="/_next/chunks/abc123.js"]')
```

This selector **requires the `[async]` attribute**. Path A's script does not have it. The selector returns `null`. React DOM concludes no such script exists and creates a second one:
```html
<script async="" src="/_next/chunks/abc123.js"></script>
```

**Result**: Two network requests for the same chunk. Every navigation. For every route-specific chunk.

---

### The Code Change

**File**: `turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime/dom/runtime-backend-dom.ts`

**Location**: Inside `doLoadChunk()`, the script element creation block (line ~211)

**Before** (original code):
```typescript
} else {
  const script = document.createElement('script')
  script.src = chunkUrl
  // We'll only mark the chunk as loaded once the script has been executed,
  // which happens in `registerChunk`. Hence the absence of `resolve()` in
  // this branch.
  script.onerror = () => {
    resolver.reject()
  }
  // Append to the `head` for webpack compatibility.
  document.head.appendChild(script)
}
```

**After** (patched code):
```typescript
} else {
  const script = document.createElement('script')
  script.src = chunkUrl
  // Setting async explicitly ensures React DOM's Float system can
  // find this script via its `script[async][src="..."]` selector,
  // preventing duplicate chunk loads during client-side navigation.
  // Dynamically-inserted scripts are async by default per the HTML
  // spec, so this only makes the attribute explicit.
  script.async = true
  // We'll only mark the chunk as loaded once the script has been executed,
  // which happens in `registerChunk`. Hence the absence of `resolve()` in
  // this branch.
  script.onerror = () => {
    resolver.reject()
  }
  // Append to the `head` for webpack compatibility.
  document.head.appendChild(script)
}
```

**Diff** (single line addition):
```diff
  const script = document.createElement('script')
  script.src = chunkUrl
+ // Setting async explicitly ensures React DOM's Float system can
+ // find this script via its `script[async][src="..."]` selector,
+ // preventing duplicate chunk loads during client-side navigation.
+ // Dynamically-inserted scripts are async by default per the HTML
+ // spec, so this only makes the attribute explicit.
+ script.async = true
  // We'll only mark the chunk as loaded once the script has been executed,
```

---

### Why `script.async = true` Fixes the Duplication

The fix works by bridging the deduplication gap between Turbopack's chunk loader and React DOM's Float system. Here is the detailed breakdown:

#### 1. HTML Spec: Dynamically-Inserted Scripts Are Already Async

Per the HTML specification (section 4.12.1, "The script element"), when a `<script>` element is created via `document.createElement('script')` and inserted into the DOM via `appendChild`, it **already executes asynchronously** — it does not block the parser or other scripts. This is true regardless of whether the `async` attribute is present in the DOM.

However, there is a critical distinction between **behavioral async** (how the browser executes the script) and **attribute async** (whether `async` appears as a DOM attribute). Setting `script.async = true` makes the attribute visible in the DOM as `<script async="" src="...">`. Without it, the script behaves identically but the attribute is absent from the DOM.

This means the fix changes **zero execution behavior** — scripts load and execute in exactly the same order as before. The only change is DOM observability.

#### 2. React DOM Float's Selector Requires `[async]`

React DOM's Float system uses `preinitScript` to manage script resources. When it encounters a `<script async>` element in the React component tree, it checks whether the script already exists in the DOM before creating a new one. The internal dispatcher does:

```javascript
// Simplified from React DOM compiled output
function preinitScript(src, options) {
  var scripts = getHostContext().hoistableScripts;
  var key = '[src="' + escapeSelectorValue(src) + '"]';
  var existing = scripts.get(key);
  if (!existing) {
    // DOM check — note the "script[async]" prefix
    existing = document.querySelector('script[async]' + key);
    //                                 ^^^^^^^^^^^^^^
    //                        This REQUIRES the async attribute!
    if (!existing) {
      // Create new <script async> — THIS IS THE DUPLICATE
      var script = document.createElement('script');
      script.async = true;
      script.src = src;
      document.head.appendChild(script);
    }
  }
}
```

The selector `script[async][src="URL"]` is a CSS attribute selector. `[async]` matches elements that **have the `async` attribute present in the DOM**, regardless of its value. Without `script.async = true` in Turbopack's code, the attribute is absent, and the selector returns `null`.

#### 3. Turbopack's Own Selector Is Broader

Turbopack's `doLoadChunk` checks for existing scripts with:
```javascript
document.querySelectorAll(`script[src="${chunkUrl}"]`)
```

This selector does **not** require `[async]`. It would find React DOM's scripts. But because `"I"` instructions are flushed before component content in the RSC stream, Turbopack always creates its script first. React DOM comes second and can't find Turbopack's script.

#### 4. After the Fix

With `script.async = true`, Turbopack creates:
```html
<script async="" src="/_next/chunks/abc123.js"></script>
```

Now when React DOM's Float system runs:
```javascript
document.querySelector('script[async][src="/_next/chunks/abc123.js"]')
```

It **finds** Turbopack's script. It skips creating a duplicate. One network request instead of two.

---

### Build and Verification Steps

Because `runtime-backend-dom.ts` is embedded into the Turbopack Rust binary at compile time (via the `embed_directory!` macro in `turbopack/crates/turbopack-ecmascript-runtime/src/embed_js.rs`), the fix requires rebuilding the native binary. A simple `pnpm --filter=next build` is **not sufficient**.

Additionally, when using `"next": "file:..."` in `package.json` with pnpm, the `@next/swc` native binary is **not resolvable** from the pnpm store copy. The `NEXT_TEST_NATIVE_DIR` environment variable must be used to force-load the local binary.

#### Step 1 — Rebuild the native binary

```bash
cd /Users/markusgritsch/Development/Topics/Millipede/Project/OSS-Projects/contributions/next.js
pnpm build-all
```

This recompiles the Rust crates including `turbopack-ecmascript-runtime`, which embeds the patched `runtime-backend-dom.ts` into the new `next-swc.darwin-arm64.node` binary.

#### Step 2 — Verify the binary was rebuilt

```bash
ls -la /Users/markusgritsch/Development/Topics/Millipede/Project/OSS-Projects/contributions/next.js/packages/next-swc/native/next-swc.darwin-arm64.node
```

Confirm the timestamp is **after** the patch was applied. The binary should be ~365 MB.

#### Step 3 — Run the repro app with the patched binary

For production build:
```bash
cd /Users/markusgritsch/Development/Topics/Millipede/Project/OSS-Projects/contributions/next-app-router-duplicate-chunk-nav-repro
NEXT_TEST_NATIVE_DIR=/Users/markusgritsch/Development/Topics/Millipede/Project/OSS-Projects/contributions/next.js/packages/next-swc/native pnpm next build
```

For dev mode:
```bash
cd /Users/markusgritsch/Development/Topics/Millipede/Project/OSS-Projects/contributions/next-app-router-duplicate-chunk-nav-repro
NEXT_TEST_NATIVE_DIR=/Users/markusgritsch/Development/Topics/Millipede/Project/OSS-Projects/contributions/next.js/packages/next-swc/native pnpm next dev
```

#### Step 4 — Verify in the browser

1. Open the app in Chrome with DevTools → Network tab open
2. Filter by JS requests
3. Navigate between routes (e.g., click from `/` to `/heavy-dashboard`)
4. Check that each route-specific chunk appears **once** in the Network tab, not twice
5. Inspect the DOM: `document.querySelectorAll('script[async]')` should show Turbopack's scripts now have the `async` attribute

#### Binding Resolution Note

The repro project uses pnpm with a `file:` dependency:
```json
"next": "file:/Users/markusgritsch/Development/Topics/Millipede/Project/OSS-Projects/contributions/next.js/packages/next"
```

pnpm copies the package into its `.pnpm/` store rather than symlinking. From that store location, `@next/swc` (the monorepo workspace package containing the native binary) is not resolvable via `require()`. Without `NEXT_TEST_NATIVE_DIR`, Next.js falls through to downloading a published binary from npm — which does **not** contain the patch.

The `NEXT_TEST_NATIVE_DIR` environment variable (handled at line 1520-1536 of `packages/next/src/build/swc/index.ts`) bypasses all resolution logic and loads the `.node` file directly by absolute path.

To verify which binary is loaded, use:
```bash
node scripts/verify-binding.mjs
```

---

### Measured Results

> TODO: Fill in after rebuilding and testing

| Metric | Before Fix | After Fix |
|--------|-----------|-----------|
| Network requests per navigation (route chunks) | 2x per chunk | |
| Total JS transferred per navigation | | |
| Time to interactive after navigation | | |
| Duplicate `<script>` tags in DOM | Yes | |

---

### Risk Assessment

**Behavioral risk**: None. Dynamically-inserted scripts are async by default per the HTML spec. The attribute changes DOM observability only, not execution semantics.

**Compatibility risk**: Minimal. If any code uses `script:not([async])` to select Turbopack-loaded scripts, it would stop matching. No such selector exists in the Next.js or Turbopack codebase.

**Scope**: Applies to both `next dev` and `next build` with Turbopack. The same `runtime-backend-dom.ts` is used for `RuntimeType::Development` and `RuntimeType::Production` (confirmed in `browser_runtime.rs`, lines 70-76). Does not affect webpack builds.
