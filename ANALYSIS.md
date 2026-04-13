# Next.js App Router: Duplicate Chunk Loading During Client-Side Navigation

## Root Cause Analysis

**Bug**: During client-side navigation in the App Router with Turbopack, the same route-specific JavaScript chunk is requested **twice** over the network, each time with a different initiator — the Turbopack chunk loader runtime and the App Router bootstrap/hydration runtime (React DOM Float).

---

## 1. Tracing Turbopack Chunk Loading — Path A

### Call Chain

When the browser receives an RSC (React Server Components) stream during client-side navigation, React's Flight client encounters `"I"` instructions — these are serialized client component references. Each `"I"` instruction contains metadata with an array of chunk URLs that must be loaded before the component module can be resolved.

The full call chain from RSC stream to network request:

```
RSC stream "I" instruction
  → resolveModule()                           [react-server-dom-webpack-client.browser.production.js:1364]
    → preloadModule(clientReference)           [react-server-dom-webpack-client.browser.production.js:74]
      → __webpack_chunk_load__(chunkUrl)       [compiled by Turbopack into e.L(chunkUrl)]
        → loadChunkByUrl()                     [runtime-base.ts:193, context method .L]
          → loadChunkByUrlInternal()           [runtime-base.ts:202]
            → BACKEND.loadChunkCached()        [runtime-backend-dom.ts:74]
              → doLoadChunk()                  [runtime-backend-dom.ts:135]
                → document.createElement('script')
                → script.src = chunkUrl
                → document.head.appendChild(script)   ← NETWORK REQUEST #1
```

### Key Files

| File | Role |
|------|------|
| `packages/next/src/compiled/react-server-dom-webpack-experimental/cjs/react-server-dom-webpack-client.browser.production.js` | React Flight client — `preloadModule` (line 74) iterates chunk URLs and calls `__webpack_chunk_load__` for each |
| `turbopack/crates/turbopack-ecmascript/src/runtime_functions.rs` | Rust compilation mapping — `__turbopack_load_by_url__` → `.L` shortcut (line 79-80), which is what `__webpack_chunk_load__` compiles to |
| `turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime/base/runtime-base.ts` | `loadChunkByUrl` (line 193) — context method `.L`, called by the compiled Flight client; delegates to `loadChunkByUrlInternal` (line 202) which calls `BACKEND.loadChunkCached` |
| `turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime/dom/runtime-backend-dom.ts` | `doLoadChunk` (line 135) — the DOM backend that creates `<script>` elements and appends them to `document.head` |

### Compiled Output

In the built Turbopack output, the Flight client's `preloadModule` compiles down to:

```javascript
// Module 79464 in the Turbopack bundle
function s(t) {
  for (var r = t[1], n = [], a = 0; a < r.length; a++) {
    var l = e.L(r[a]);           // e.L = loadChunkByUrl (context method .L)
    if (o.has(l) || n.push(l),
    !i.has(l)) {
      var s = o.add.bind(o, l);
      l.then(s, c), i.add(l)
    }
  }
}
```

Note: Turbopack iterates chunks one-by-one (not in pairs like webpack), calling `e.L()` for each URL directly.

### Deduplication Mechanism

Turbopack's `doLoadChunk` has two layers of deduplication:

1. **In-memory**: `chunkResolvers` Map (line 33) — keyed by `ChunkUrl`. If a resolver already exists with `loadingStarted = true`, the function returns early with the existing promise (line 137-139).

2. **DOM check**: `document.querySelectorAll('script[src="${chunkUrl}"]')` (line 199-201) — checks for any existing `<script>` tag with a matching `src`, regardless of other attributes.

### Critical Detail: No `async` Attribute

When `doLoadChunk` creates a new script element (line 211-220), it sets only `script.src` and `script.onerror`. It does **not** set `script.async = true`. Per the HTML specification, dynamically inserted scripts are async by default in terms of execution behavior, but the `async` **attribute** is not present in the DOM.

```typescript
// runtime-backend-dom.ts, line 211-220 (BEFORE fix)
const script = document.createElement('script')
script.src = chunkUrl
// No script.async = true here!
script.onerror = () => {
  resolver.reject()
}
document.head.appendChild(script)
```

This missing attribute is the root cause of the duplication, as explained in Section 3.

---

## 2. Tracing React DOM Float / preinitScript — Path B

### Call Chain

Independently from Path A, the Next.js server renders `<script async>` elements directly into the React component tree for each route's entry JavaScript files. These elements travel through the RSC stream as part of the component output (not as `"I"` instructions). When the client processes them during navigation, React DOM's Float system intercepts them and creates real DOM script elements.

```
Server: createComponentTree()
  → createComponentStylesAndScripts()         [create-component-styles-and-scripts.tsx:8]
    → getLinkAndScriptTags()                   [get-css-inlined-link-tags.tsx:7]
      → reads entryJSFiles from client manifest
    → createElement('script', { async: true, src: url })   [line 36-41]
      → serialized into RSC payload as component output

Client: RSC stream component rendering
  → React DOM encounters <script async src="url">
    → Float system intercepts
      → preinitScript(url)                     [React DOM dispatcher, X:function]
        → querySelector('script[async][src="url"]')
        → NOT FOUND (Turbopack's script lacks [async])
        → document.createElement('script')
        → script.async = true
        → document.head.appendChild(script)    ← NETWORK REQUEST #2 (DUPLICATE)
```

### Key Files

| File | Role |
|------|------|
| `packages/next/src/server/app-render/create-component-styles-and-scripts.tsx` | **The origin point** — lines 34-43 create `<script async>` React elements for each entry JS file and include them in the component tree |
| `packages/next/src/server/app-render/get-css-inlined-link-tags.tsx` | `getLinkAndScriptTags` — reads `entryJSFiles` from the client reference manifest for a given file path |
| `packages/next/src/server/app-render/create-component-tree.tsx` | Calls `createComponentStylesAndScripts` multiple times (lines 183, 193, 203, 237, 257, 268) for layout, page, loading, not-found, and error components |
| `packages/next/src/client/components/router-reducer/fetch-server-response.ts` | `createFromNextReadableStream` / `createFromNextFetch` (lines 650-672) — creates the Flight client for navigation **without** a `moduleLoading` option |
| React DOM internals (compiled in Turbopack output) | `preinitScript` dispatcher (`X:function`) — creates `<script async>` tags and checks for existing ones |

### The Server-Side Origin

In `create-component-styles-and-scripts.tsx`, the server iterates over `jsHrefs` (entry JS files from the client reference manifest) and creates React elements:

```typescript
// create-component-styles-and-scripts.tsx, lines 34-43
for (const href of jsHrefs) {
  scripts.push(
    createElement('script', {
      src: `${ctx.assetPrefix}/_next/${encodeURIPath(href)}${getAssetQueryString(ctx, true)}`,
      async: true,
      key: `script-${scriptIndex}`,
    })
  )
  scriptIndex++
}
```

These `<script async>` elements are returned as part of the component tuple and rendered into the RSC stream alongside the actual component content.

### The Client-Side Float Interception

When React DOM renders a `<script async>` element during client-side navigation, it doesn't insert it directly into the DOM. Instead, its Float system intercepts the element and calls the internal `preinitScript` dispatcher. In the compiled Turbopack output, this dispatcher is:

```javascript
// React DOM dispatcher (compiled)
X: function(e, t) {
  if (c3.X(e, t), c4 && e) {
    var n = e4(c4).hoistableScripts,
        r = fe(e),                    // fe(e) = '[src="' + escape(e) + '"]'
        l = n.get(r);
    l || (
      (l = c4.querySelector(ft(r)))   // ft(r) = 'script[async]' + r
                                       // Full: 'script[async][src="URL"]'
      || (
        e = _({src: e, async: !0}, t),
        // ... creates new <script async> element
        c4.head.appendChild(l)
      ),
      l = {type: "script", instance: l, count: 1, state: null},
      n.set(r, l)
    )
  }
}
```

### Float's Deduplication Mechanism

React DOM Float has two deduplication layers:

1. **In-memory**: `hoistableScripts` Map — keyed by a selector string `'[src="URL"]'`. If an entry exists, the script is skipped.

2. **DOM check**: `document.querySelector('script[async][src="URL"]')` — specifically requires **both** the `[async]` attribute **and** a matching `[src]`.

### Why `"H"` Hints Are Not the Cause

An early hypothesis was that the server emits `"H"` (hint) instructions alongside `"I"` instructions. Investigation of `serializeClientReference` in the server-side Flight code (`react-server-dom-webpack-server.edge.production.js`, lines 1420-1482) confirmed that it emits **only** `"I"` instructions for client component references. The `emitHint` function (lines 1117-1121) is only called by explicit dispatcher methods like `preinitScript`, not by the client reference serialization path. This means the duplication does not come from `"I"` + `"H"` for the same chunk — it comes from `"I"` instructions + `<script async>` component elements.

---

## 3. The Deduplication Gap

The core issue is that these two loading paths have **asymmetric deduplication** — their DOM selectors don't see each other's scripts:

| Property | Path A (Turbopack `doLoadChunk`) | Path B (React DOM `preinitScript`) |
|----------|----------------------------------|-------------------------------------|
| Creates | `<script src="URL">` | `<script async src="URL">` |
| In-memory dedup | `chunkResolvers` Map (by URL) | `hoistableScripts` Map (by selector) |
| DOM selector | `script[src="URL"]` | `script[async][src="URL"]` |
| Would find Path A's script? | N/A | **NO** — requires `[async]` |
| Would find Path B's script? | **YES** — no `[async]` requirement | N/A |

### The Race Condition

The order of execution determines whether duplication occurs:

1. **`"I"` instructions are flushed first** in the RSC stream (React Flight server flushes imports before component content).
2. The Flight client processes `"I"` instructions immediately as they arrive, triggering Path A's `loadChunkByUrl` → `doLoadChunk` → creates `<script src="URL">` (no `async` attribute).
3. Component content arrives later in the stream. React DOM renders the `<script async>` elements, triggering Path B's `preinitScript`.
4. `preinitScript` checks `querySelector('script[async][src="URL"]')` — **does not find** Path A's script because it lacks the `async` attribute.
5. `preinitScript` creates a **second** `<script async src="URL">` → **duplicate network request**.

If the order were reversed (Path B first, Path A second), Turbopack's `doLoadChunk` would find Path B's script via `querySelector('script[src="URL"]')` (which doesn't require `[async]`), and would skip creating a duplicate. But because `"I"` instructions are always flushed before component content, Path A always wins the race.

### Why Full-Page Loads Don't Duplicate

On initial page load (SSR/full document), the server renders `<script async>` tags directly into the HTML document. The browser loads them as part of the initial document parse. By the time Turbopack's chunk loader runs, the scripts are already present in the DOM with the `async` attribute, so both deduplication mechanisms find them. There is no race.

---

## 4. Root Cause — Precise Location

The root cause sits at the intersection of two design decisions:

### Primary: Missing `async` attribute in Turbopack's `doLoadChunk`

**File**: `turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime/dom/runtime-backend-dom.ts`
**Lines**: 211-220

```typescript
const script = document.createElement('script')
script.src = chunkUrl
// async attribute NOT set — React DOM Float can't find this script
script.onerror = () => {
  resolver.reject()
}
document.head.appendChild(script)
```

### Secondary: `create-component-styles-and-scripts.tsx` emits redundant `<script async>` elements

**File**: `packages/next/src/server/app-render/create-component-styles-and-scripts.tsx`
**Lines**: 34-43

These `<script async>` elements are necessary for full-page loads where Float is the primary loading mechanism. However, during client-side navigation, they are redundant because the same chunks are already being loaded via the `"I"` instruction → `preloadModule` → `loadChunkByUrl` path. The server has no way to distinguish between these two contexts when generating the RSC payload.

### Tertiary: React DOM Float's strict `[async]` selector

React DOM's `preinitScript` uses `querySelector('script[async][src="URL"]')` — the `[async]` requirement is intentional (it only wants to deduplicate against scripts it considers "async resources"), but it creates a blind spot for scripts inserted by other loaders that behave asynchronously without the attribute.

---

## 5. Potential Fixes

### Option A: Add `async` to Turbopack's Script Tags (Recommended for Quick Fix)

**File**: `turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime/dom/runtime-backend-dom.ts`
**Change**: Add `script.async = true` after `script.src = chunkUrl`

```typescript
const script = document.createElement('script')
script.src = chunkUrl
script.async = true  // ← one-line fix
```

**Rationale**: Per the HTML specification (section 4.12.1), scripts inserted via `document.createElement` and `appendChild` are already async in execution behavior. Setting `script.async = true` merely makes the attribute explicit in the DOM, allowing React DOM's `querySelector('script[async][src="URL"]')` to find them.

**Risk**: Minimal. The execution behavior doesn't change — dynamically-inserted scripts are already non-blocking. The attribute just becomes visible in the DOM. One edge case to validate: if any code elsewhere relies on the absence of `[async]` to distinguish Turbopack-loaded scripts from other scripts, it would need updating.

**Scope**: Applies to both `next dev` (Turbopack development) and `next build` (Turbopack production). The same `runtime-backend-dom.ts` file is used for both `RuntimeType::Development` and `RuntimeType::Production` in `browser_runtime.rs` (lines 70-76).

**Build requirement**: Requires Rust binary recompilation (`pnpm build-all` or `cargo build --release -p next-swc-napi`) because the runtime TypeScript source is embedded into the Turbopack binary via `embed_directory!` macro at cargo compile time (see `embed_js.rs`, line 14).

### Option B: Stop Emitting `<script async>` During Navigation

**File**: `packages/next/src/server/app-render/create-component-styles-and-scripts.tsx`
**Change**: Skip emitting `<script async>` elements for entry JS files when the RSC payload is being generated for a client-side navigation (not a full-page load).

**Rationale**: During navigation, the Flight client's `"I"` instruction processing already triggers chunk loading through Turbopack. The `<script async>` elements in the component tree are redundant. Removing them eliminates Path B entirely.

**Challenge**: The server needs to know whether the RSC payload is for a full-page load (where Float scripts are the primary loading mechanism) or a navigation (where they're redundant). This context may already be available in `AppRenderContext` via request headers (`RSC: 1` header indicates a navigation fetch), but threading it through to `createComponentStylesAndScripts` requires plumbing work.

**Risk**: Medium. Must ensure full-page loads (including streaming SSR, static generation, and `next export`) continue to emit these scripts. Also need to verify that no other code path depends on these `<script async>` elements being present in the component tree during navigation.

### Option C: Client-Side Navigation Deduplication

**File**: `packages/next/src/client/components/router-reducer/fetch-server-response.ts`
**Change**: Track chunk URLs being loaded by the Flight client and suppress Float-driven loads for the same URLs.

**Rationale**: Intercepts the duplication at the client level without changing either Turbopack or the server rendering.

**Challenge**: Requires coordinating between the Flight client's `preloadModule` (which calls `__webpack_chunk_load__`) and React DOM's Float system. This is architecturally complex because these are two separate React subsystems with no shared state.

**Risk**: High complexity, potential for subtle timing bugs.

### Option D: Broaden React DOM's Selector (Upstream)

**File**: React DOM source (not in Next.js repo)
**Change**: Change `preinitScript`'s DOM check from `querySelector('script[async][src="URL"]')` to `querySelector('script[src="URL"]')`.

**Rationale**: Most correct fix conceptually — deduplication should find any script with the same `src` regardless of attributes.

**Challenge**: Requires an upstream change to React. The `[async]` requirement may be intentional to avoid deduplicating against synchronous blocking scripts that have different execution semantics.

**Risk**: Could change Float behavior for non-Next.js consumers of React DOM.

### Recommendation

**Option A** is the right first move — it's a one-line change, zero behavioral risk (per HTML spec), and fixes the issue for both dev and production Turbopack builds. It can ship as a standalone PR.

**Option B** is the architecturally superior long-term fix and should be pursued as a follow-up. It eliminates the redundant loading path entirely rather than just making the deduplication work across paths.

---

## 6. Build and Linking Verification

### Reproduction Project Setup

The reproduction project at `next-app-router-duplicate-chunk-nav-repro/` links to the local Next.js build via:

```json
{
  "dependencies": {
    "next": "file:/Users/markusgritsch/Development/Topics/Millipede/Project/OSS-Projects/contributions/next.js/packages/next"
  }
}
```

This means `node_modules/next` is a symlink to `packages/next` in the Next.js repo. Any changes to `packages/next/dist/` are immediately available without reinstalling.

### Why `pnpm --filter=next build` Is Not Sufficient

The patched file (`runtime-backend-dom.ts`) is **not** part of the Next.js JavaScript build pipeline. It lives in a Turbopack Rust crate:

```
turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime/dom/runtime-backend-dom.ts
```

This file is embedded into the Rust binary at **cargo compile time** through the `embed_directory!` macro:

```rust
// embed_js.rs, line 13-15
pub fn embed_fs() -> Vc<Box<dyn FileSystem>> {
    embed_directory!("turbopack", "$CARGO_MANIFEST_DIR/js/src")
}
```

The `embed_directory!` macro reads the file contents from `$CARGO_MANIFEST_DIR/js/src` (which is `turbopack/crates/turbopack-ecmascript-runtime/js/src/`) and bakes them into the compiled Rust binary. At runtime, when Turbopack compiles your application, it reads these embedded files via `embed_fs()` → `embed_file_path()` → `embed_static_code()`, processes them through the asset context (TypeScript → JavaScript transpilation), and emits the result as the chunk loading runtime in the browser bundle.

### Required Build Steps

To test the fix:

1. **Rebuild the Rust native binary** from the Next.js repo root:
   ```bash
   pnpm build-all
   # or specifically:
   cargo build --release -p next-swc-napi
   ```

2. **Verify the patch is in the binary** by running the reproduction app and inspecting the Turbopack runtime in the browser's DevTools Sources panel — search for `doLoadChunk` or `script.async` in the served JavaScript.

3. **Test**: Navigate between routes in the reproduction app with DevTools Network tab open. Each route-specific chunk should now appear **once** instead of twice.

### Applies to Both Dev and Production

The `browser_runtime.rs` file (lines 70-76) confirms the same `runtime-backend-dom.ts` is used for both modes:

```rust
(ChunkLoading::Dom, RuntimeType::Development) => {
    runtime_backend_code.push("browser/runtime/dom/runtime-backend-dom.ts");  // ← same file
    runtime_backend_code.push("browser/runtime/dom/dev-backend-dom.ts");
}
(ChunkLoading::Dom, RuntimeType::Production) => {
    runtime_backend_code.push("browser/runtime/dom/runtime-backend-dom.ts");  // ← same file
}
```

So the fix covers `next dev` and `next build` + `next start` equally when using Turbopack. Webpack production builds use an entirely separate chunk loading runtime and would require separate investigation.
