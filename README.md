# App Router Duplicate Chunk Navigation Repro

Minimal Next.js App Router reproduction for a production-navigation issue where
the same route-specific client chunk appears to be **requested twice during one
client navigation** from the landing page.

Immediate signal:

- client navigation from `/` to an imported-client route can request the same
  route-specific chunk twice
- a full document reload of that target route **does not show the same
  duplicate route-chunk pattern**

## Two load emitters

In this repro, the duplicate does not look like two different chunks being
needed. It looks like two different emitters are both trying to load the same
route-specific chunk during one navigation.

The two emitters appear to be:

- the Turbopack chunk loader runtime, which can create and append `<script>`
  tags for route chunks when a navigation needs them
- the App Router bootstrap and hydration runtime, which consumes the streamed
  `self.__next_f` payload, builds the initial router state, and also knows
  about route chunks through the client reference manifest

Those descriptions come from the built client chunks themselves:

- the Turbopack runtime chunk contains chunk-loading code such as
  `loadChunkCached(...)` and dynamic script insertion
- the App Router runtime chunk contains `appBootstrap(...)`,
  `createInitialRouterState(...)`, `hydrate(...)`, and `self.__next_f`
  handling

In the built output, the light route has route-specific chunk entries for the
imported `Chart` component, and the heavy route follows the same imported-client
pattern with a much larger payload. The streamed route payload and the client
reference manifest both describe those route chunks. In one measured production
run, the duplicated requests were emitted by:

- the Turbopack chunk loader runtime (`turbopack-0r.s-qbmjroh8.js`)
- the App Router bootstrap and hydration runtime (`0w4kgcy02gd2f.js`)

That is why the Network panel is worth watching with the `Initiator` column
enabled: the duplicate is visible as the same route-specific chunk URL
appearing twice, but with **two different initiators**.

The exact filenames change from build to build, so the important thing to
verify is the pattern:

- one navigation from `/` to either `/light-dashboard` or `/heavy-dashboard`
- one route-specific chunk URL tied to the imported client component
- two network rows for that same URL
- two different initiators behind those rows

## What this app contains

- One landing page at `/`
- One no-import comparison page at `/inline-dashboard`
- One page at `/light-dashboard` that imports the small shared `Chart`
- One page at `/heavy-dashboard` that renders a ballast-backed client component
- One shared `Chart` client component
- One `ChartWithBallast` wrapper that adds synthetic payload weight

## Run

```bash
pnpm install
pnpm build
pnpm start
```

Open `http://localhost:3000/`, then inspect the Network panel while navigating
from the landing page. For the clearest comparison:

- disable the browser cache in DevTools
- clear the Network panel between runs
- start each comparison from `/`
- after checking the client navigation case, reload the target route directly
  to compare it against a full document load

The three route roles are:

- `/inline-dashboard` is the no-import baseline
- `/light-dashboard` imports the shared `Chart` component without ballast
- `/heavy-dashboard` uses the ballast-backed variant

This makes it easier to compare:

- inline no-import navigation behavior
- imported shared-client-component navigation behavior
- the same imported-component pattern once the payload becomes much larger

## Expected component graph

- `/inline-dashboard` does not import `Chart` at all
- `/light-dashboard` imports `Chart` directly
- `/heavy-dashboard` imports `ChartWithBallast`
- `ChartWithBallast` renders `Chart` internally and adds ballast around it

That means the heavy route is expected to include everything the light route
includes, plus the extra ballast payload. Seeing `Chart` as part of the heavy
route is normal in this repro and is not itself the bug.

## What we observed

These points come from a real production run of this repro captured through
headless Chrome with DevTools Protocol network events enabled.

1. Build and start the app in production mode with `pnpm build` and
   `pnpm start`.
2. Open `/`. The landing page load only brings in the base app resources.
3. Navigate from `/` to `/inline-dashboard`.
   This no-import baseline triggered `0` route-specific chunk requests.
4. Navigate from `/` to `/light-dashboard`.
   The imported `Chart` route already reproduces the issue:
   `/_next/static/chunks/0zngjt7e~0dhg.js` is requested `2` times during one
   navigation.
5. In that light-route case, the two initiators are:
   - the Turbopack chunk loader runtime (`turbopack-0r.s-qbmjroh8.js`)
   - the App Router bootstrap and hydration runtime (`0w4kgcy02gd2f.js`)
6. Navigate from `/` to `/heavy-dashboard`. The heavier route reproduces the
   same pattern more strongly:
   - `/_next/static/chunks/0zngjt7e~0dhg.js` is requested `2` times
   - `/_next/static/chunks/18b~vlnee9x.n.js` is requested `2` times
7. In the heavy-route case, both duplicated chunk URLs have the same two
   initiators as the light route:
   - the Turbopack chunk loader runtime (`turbopack-0r.s-qbmjroh8.js`)
   - the App Router bootstrap and hydration runtime (`0w4kgcy02gd2f.js`)
8. Load `/heavy-dashboard` directly with a full document navigation.
   In that case there are no duplicate route-chunk requests. One measured run
   produced `9` chunk requests and `9` unique chunk URLs.
9. Remove the ballast and repeat the heavy-route check. The duplicate still
   reproduces, which means the ballast is not the cause of the issue.
10. Restore the ballast and repeat the same navigation. The duplicate remains,
    but the cost becomes much easier to see because the payload is much larger.
11. The practical conclusion from these runs is:
    - the issue is not limited to the heavy route
    - the **light imported-client route already reproduces it**
    - the heavy route is mainly the stronger, easier-to-see version
    - the ballast amplifies the cost but is **not the trigger**

## Where to look in DevTools

1. Open DevTools and switch to the `Network` tab.
2. Enable the `Initiator` column if it is hidden.
3. Turn on `Disable cache` while DevTools is open.
4. Clear the Network panel before each run.
5. Start at `/`.
6. Click `Open Light Dashboard`, then repeat the same check with `Open Heavy
Dashboard`.
7. Filter the table to `JS` requests or search for `chunk`.
8. For the light route, find the route-specific chunk tied to the imported
   `Chart` component.
9. For the heavy route, find the corresponding route-specific chunk pattern
   again. The heavy route is useful because the payload is much larger, so the
   duplicate is easier to see.
10. Exact filenames vary by build, so the important signal is not the chunk
    name itself.
11. Look for the same chunk URL appearing twice during one client navigation.
12. Compare the `Initiator` values for those two rows. The suspicious pattern
    is that the same route-specific chunk is requested twice with different
    initiators.

The base runtime chunks that are shared by the whole app are not the main
signal here. The interesting rows are the route-specific chunks that only show
up once the imported client-component routes are entered.

In one measured run, the duplicate initiators were:

- the Turbopack chunk loader runtime (`turbopack-0r.s-qbmjroh8.js`)
- the App Router bootstrap and hydration runtime (`0w4kgcy02gd2f.js`)
