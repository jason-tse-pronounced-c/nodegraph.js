# nodegraph.lib

A zero-dependency visual node-graph editor in a single ES module. No build step,
no framework, no runtime dependencies — drop `nodegraph.js` next to your page and
import it. The stylesheet is embedded and injected automatically on first import.

Everything is plain SVG + DOM: orthogonal auto-routed edges, draggable nodes with
input/output param rows, geometric groups with boundary ports, undo/redo history,
copy/paste, JSON persistence, and one-click vector PDF export. Themes are CSS
custom properties.

## Quick start

```html
<div id="app" style="position:absolute; inset:0"></div>
<script type="module">
  import { createGraph } from './nodegraph.js';
  const graph = createGraph(document.getElementById('app'));

  const a = graph.addNode({ x: 80, y: 120, label: 'Source', params: [{ name: 'value' }] });
  const b = graph.addNode({ x: 380, y: 120, label: 'Sink', params: [{ name: 'input' }] });
  graph.connect({ node: a.id, param: a.params[0].id }, { node: b.id, param: b.params[0].id });
</script>
```

Try the demo: `node server.js 8123` → http://localhost:8123/ — a showcase graph
with colored nodes, labeled/colored edges, nested groups, and boundary ports.

## Features

- **Nodes** with param rows — every row has an input port (left) and an output
  port (right). Resize (`width`, or drag the right-edge grip), rename
  (double-click), reorder rows by dragging (edges follow), tint with an accent
  color.
- **Orthogonal edges** — 90° polylines with obstacle-avoiding auto-routing that
  recomputes on drop, never mid-drag. Drag segment grips to bend manually
  (double-click a grip to collapse a run), drag the label to slide it, give an
  edge its own color. Repeated clicks at one spot cycle through overlapping edges.
- **Groups** — labelled rectangles under the nodes with a geometric membership:
  a node belongs while its centre is inside, so dragging a group carries its
  members (and any nested groups) along. Resize from four corner grips, tint,
  or go outline-only (`fill: false` — transparent interior, clicks pass through).
- **Boundary ports** — anchors on a group's border that make the whole box one
  interface (e.g. load balancing). Drag an edge onto a group border to create
  one (a ghost dot previews the spot, direction is inferred), or add them
  programmatically. Ports slide along the border; attached edges follow.
- **Undo / redo** — snapshot history (last 50 steps) covering UI gestures *and*
  API calls alike. A whole drag is one step; no-ops record nothing.
- **Copy / paste** — selected nodes + groups to the internal clipboard; a copied
  group auto-includes its members, edges between copied nodes come along, and
  pastes land centred in the view with fresh ids.
- **JSON persistence** — pretty-printed export, validated import (bad files
  throw before touching state).
- **Vector PDF export** — a minimal built-in PDF 1.4 writer: one page, ≥20 px
  clear space, theme-matched colors, selection-aware.
- **Pan / zoom** — wheel zoom anchored at the cursor, middle-drag pan, fit-view,
  reset-view. Everything snaps to a 20 px grid.
- **Theming** — every color is a CSS custom property on `.ng-graph`; a `dark`
  class (or `graph.setDark(true)`) swaps the whole palette.
  
## Gestures

| Gesture | Result |
|---|---|
| click node / edge / group | select (shift-click toggles; multi-selection drags together) |
| click overlapping edges | repeat clicks at the same spot cycle through them |
| drag node | move, grid-snapped; glued waypoints follow, auto edges re-route on drop |
| drag group body / corner grips | move (carries nested groups + members) / resize |
| drag empty canvas | marquee-select (a group joins only when fully enclosed) |
| drag middle button / wheel | pan / zoom at cursor |
| drag port → port | connect (either direction: out→in or in→out) |
| drag port → group border | create a boundary port there and wire it |
| drag group port | slide it along the border |
| drag a selected node's right edge | resize its width |
| drag a param row | reorder rows (edges follow) |
| drag an edge segment grip / its label | bend the edge / slide the label |
| double-click a segment grip | collapse the run |
| double-click node / param / edge / group label | inline text editor (Enter commits, Esc cancels) |
| right-click, or double-click empty canvas | context menu (never changes the selection — left-click to target first) |
| `Ctrl/Cmd + A` | select all / deselect all (toggle) |
| `Ctrl/Cmd + C` / `V` | copy / paste |
| `Ctrl/Cmd + Z` / `Shift+Z` / `Y` | undo / redo |
| Delete / Backspace | remove the selection |
| Escape | cancel edit → close menu → clear selection |

Errors (e.g. connecting two outputs) show as a transient toast, never a dialog.

## API — `createGraph(container)`

Creates the model, SVG renderer, and all interactions inside `container` (the
`ng-graph` class is added for theming). Every call re-renders and records one
undo step.

### Nodes

| Call | Description |
|---|---|
| `addNode({ x, y, label, params: [{ name }], width })` | add a node; returns it (with generated ids) |
| `removeNode(id)` | remove a node and every edge touching it |
| `setNodeLabel(id, label)` | rename |
| `moveNode(id, x, y)` | move; glued waypoint runs follow |
| `setNodeWidth(id, width)` | resize width (min 100); ports follow |
| `setNodeColor(id, color)` | `#rgb`/`#rrggbb` accent, `null` = theme default; invalid values ignored |

### Groups

| Call | Description |
|---|---|
| `addGroup({ x, y, w, h, label, color })` | add a group box (defaults 320×220) |
| `removeGroup(id)` | remove the box only — contained nodes stay |
| `setGroupLabel(id, label)` / `setGroupColor(id, color)` | rename / tint |
| `setGroupFill(id, on)` | `false` = outline-only group (transparent interior, border-only hit area) |
| `setGroupRect(id, { x, y, w, h })` | reposition / resize |
| `moveGroup(id, x, y)` | move + carry every member node and nested group |
| `groupMembers(id)` | ids of the nodes currently inside (centre-based) |
| `addGroupPort(groupId, { side, t })` | add a boundary port (`side`: `top`/`right`/`bottom`/`left`, `t`: 0..1); reuses a port already at that spot |
| `removeGroupPort(groupId, portId)` | remove the port and every edge wired to it |
| `getGroupPorts(groupId)` | the group's ports (live array) |

### Parameters

| Call | Description |
|---|---|
| `addParam(nodeId, { name })` | append a row (both ports appear); returns it |
| `removeParam(nodeId, paramId)` | remove the row and any edge on its ports |
| `moveParam(nodeId, paramId, toIndex)` | reorder rows (index clamped); edges follow |

### Edges

| Call | Description |
|---|---|
| `connect(source, target)` | refs `{ node, param }` or `{ group, port }`. Throws on unknown port, self-connect, or duplicate; returns the edge |
| `removeEdge(id)` | delete |
| `setEdgeLabel(id, label)` | set the single label (empty string clears it) |
| `setEdgeLabelT(id, t)` | slide the label to fraction `t` (0..1) of edge length |
| `setEdgeColor(id, color)` | `#rgb`/`#rrggbb` stroke color, `null` = theme default |

### History, JSON, PDF

| Call | Description |
|---|---|
| `undo()` / `redo()` | step through the last 50 changes; `false` when nothing to do |
| `exportJSON()` | pretty-printed `{ version: 1, nodes, edges, groups }` string |
| `importJSON(text)` | parse + validate, then replace the live model. Throws on bad JSON, wrong shape, or dangling port refs — before touching state |
| `exportPDF(nodeIds?)` | one-page vector PDF as a `Uint8Array`. Defaults to all nodes; pass an array/Set for a subset (plus the groups containing them) |

### Theme & viewport

| Call | Description |
|---|---|
| `setDark(on)` | toggle the `dark` class |
| `view` | live `{ x, y, scale }` of the pan/zoom transform |
| `panBy(dx, dy)` | pan by screen pixels |
| `zoomTo(scale)` | zoom centred on the canvas (clamped 0.2–4) |
| `fitView()` | zoom + pan so everything (nodes, groups, routed edge paths) fits, centred |
| `resetView()` | back to the origin at 100% |

### Misc

| Call | Description |
|---|---|
| `getNodes()` / `getEdges()` / `getGroups()` | live model arrays (read-only by convention) |
| `addContextMenuItem(label, action)` | append an item to the context menu |
| `destroy()` | remove listeners, SVG, and the `ng-graph` classes |

## The graph model

Plain JSON-serialisable objects — the MODEL section of `nodegraph.js` exports
pure functions over this shape, usable without any UI:

```js
{
  nodes: [{ id, label, x, y, width?, color?, params: [{ id, name }] }],
  edges: [{ id, source, target,   // each: { node, param } or { group, port }
            label, labelT, points: [{ x, y }], color? }],
  groups: [{ id, label, x, y, w, h, color?, fill?, ports: [{ id, side, t }] }],
}
```

An empty `points` array means the router picks the route; the renderer
re-bridges any waypoint list into a 90° polyline, so a diagonal can never
appear.

## Theming

All visuals come from CSS custom properties on `.ng-graph`; the `dark` class
(or `graph.setDark(true)`) swaps the whole palette. Override any of them in
your own stylesheet:

| Variable | Light | Dark | Used for |
|---|---|---|---|
| `--ng-bg` | `#fafafa` | `#1e1e24` | canvas (also the PDF page + label halo) |
| `--ng-grid` | `#e0e0e0` | `#2e2e38` | grid lines |
| `--ng-node-bg` | `#fff` | `#2a2a33` | node body, menus, editor |
| `--ng-node-border` | `#b0b0b0` | `#55556a` | node outline, group border |
| `--ng-header-bg` | `#e8e8e8` | `#3a3a48` | node header |
| `--ng-text` | `#222` | `#e8e8f0` | labels |
| `--ng-muted` | `#888` | `#9a9ab0` | group labels, hints |
| `--ng-port-in` | `#2a7fff` | `#5aa2ff` | input ports |
| `--ng-port-out` | `#ff7f2a` | `#ffa057` | output ports |
| `--ng-edge` | `#777` | `#8a8aa0` | edges (dashed `6 4`) |
| `--ng-edge-selected` | `#d33` | `#ff6666` | selection, grips |
| `--ng-group-fill` | `rgba(122,134,184,.10)` | `rgba(150,160,210,.08)` | group wash |
| `--ng-group-port` | `#777` | `#8a8aa0` | group boundary ports + the connect ghost dot |

A node's or group's own `color` overrides the header/border (nodes) or
fill/border (groups).

## Advanced exports

Besides `createGraph`, the module exports its internals (each documented in the
section it lives in) so you can build custom tooling without a UI:

- **Model**: `createModel`, `findNode`, `findGroup`, and every CRUD function —
  including `moveParam`, `setEdgeColor`, `moveGroupsBy`, `copySelection` and
  `pasteSnapshot`.
- **Geometry**: `GRID`, `NODE_W`, `MIN_NODE_W`, `HEADER_H`, `ROW_H`, `GROUP_MIN`,
  `GROUP_LABEL_H`, `GROUP_CORNERS`, `EDGE_DASH`, `NODE_COLORS`, `portPos`,
  `nodeRects`, `nodesInGroup`, `groupsInGroup`, `groupClosure`, `edgePoints`,
  `edgesNearPoint`, `moveSegment`, `removeSegment`, `segmentMovable`,
  `adjustPointsForMove`, `snapToGrid`, `polylinePath`, `polylineLength`,
  `polylinePointAt`, `nearestSegment`, `findFreeSpot`, and the color helpers
  (`normalizeColor`, `hexToRgba`, `readableTextOn`).
- **Renderer**: `Renderer` (headless use: `new Renderer(container)` then
  `buildScene`).
- **PDF**: `buildPDF`, `textWidth`.
- **Style**: `NG_CSS` (the stylesheet source, if you'd rather inject it yourself).

## Files

| File | Purpose |
|---|---|
| `nodegraph.js` | the library — seven documented sections: STYLE, MODEL, GEOMETRY, RENDERER, INTERACTIONS, PDF EXPORT, PUBLIC API |
| `nodegraph.min.js` | compact build of the same code (comments stripped, CSS inlined) |
| `index.html` | the demo |
| `server.js` | minimal static server: `node server.js [port]` |

## Tests

The suite lives outside the package (this is a zero-dependency library). It
runs under Node + jsdom from `/tmp/ngtest`: `node smoke.mjs`, `geom.mjs`,
`inter.mjs`, `groups.mjs`, `gports.mjs`, `route.mjs`, `seg2.mjs`, `dragroute.mjs`,
`paramorder.mjs`, `copy.mjs`, `undo.mjs`, `edecycle.mjs`, `edgecolor.mjs`,
`color.mjs`, `test-label.mjs`, `layer.mjs`, `regress.mjs`, `fixes7.mjs`, plus
`pdfval.mjs`, which round-trips the PDF through pdf-lib to prove the bytes are
a valid, readable document. `min-*.mjs` mirror the same suites against
`nodegraph.min.js`.
