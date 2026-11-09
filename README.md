# nodegraph.js

A zero-dependency visual node-graph editor in a single ES module. No build step,
no framework, no runtime dependencies — drop `nodegraph.js` next to your page and
import it. The stylesheet is embedded and injected automatically on first import.

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

Try it: `node server.js 8123` → http://localhost:8123/demo.html

## Where to read

Everything lives in `nodegraph.js`, in seven clearly-marked sections. The
pointers below (e.g. *→ PUBLIC API*) name the section to read for full details;
line numbers are approximate and drift with edits, so search for the banner.

| Section | Line | What's there |
|---|---|---|
| STYLE | ~28 | embedded stylesheet (`NG_CSS`) + one-time `<head>` injection |
| MODEL | ~312 | plain-object graph, CRUD, JSON serialisation — no DOM |
| GEOMETRY | ~589 | layout constants, colour helpers, orthogonal edge routing |
| RENDERER | ~1081 | `Renderer` class: SVG drawing + PDF scene snapshot |
| INTERACTIONS | ~1426 | every pointer/keyboard gesture |
| PDF EXPORT | ~2463 | minimal zero-dependency PDF 1.4 vector writer |
| PUBLIC API | ~2760 | `createGraph()` — the factory that wires it all together |

---

## The graph model (→ MODEL)

Plain JSON-serialisable objects, no class instances:

```js
{
  nodes: [{ id, label, x, y, width?, color?, params: [{ id, name }] }],
  edges: [{ id, source: { node, param }, target: { node, param },
            label, labelT, points: [{ x, y }] }],
  groups: [{ id, label, x, y, w, h, color? }],
}
```

- Every **param** has two ports: input on the node's left edge, output on the
  right. Ports always land on grid intersections (`GRID = 20`).
- **Edges** are orthogonal (90°) polylines: source port → `points` (manual
  waypoints) → target port. An empty `points` array means the router picks a
  default obstacle-avoiding route. The renderer re-bridges any waypoint list
  into a 90° polyline, so a diagonal can never appear.
- `label` is the edge's single label; `labelT` (0..1) is where it sits along it.
- **Groups** have no stored membership: a node belongs to a group while its
  *centre* lies inside the rectangle. Moving a group carries its members;
  resizing reveals or hides nodes without deleting them.

The MODEL section exports pure functions over this shape (`addNode(model, …)`
etc.) — useful for manipulating a model without a UI. The `graph` object
returned by `createGraph()` wraps the same functions with automatic
re-rendering (below).

---

## `createGraph(container)` (→ PUBLIC API)

Creates the model, the SVG renderer, and all interactions inside `container`
(the `ng-graph` class is added for theming). Returns an API object; every call
re-renders.

### Nodes

| Call | Description |
|---|---|
| `addNode({ x, y, label, params: [{ name }], width })` | add a node, returns it (with generated ids) |
| `removeNode(id)` | remove a node and every edge touching it |
| `setNodeLabel(id, label)` | rename |
| `moveNode(id, x, y)` | move; waypoint runs glued to its ports follow |
| `setNodeWidth(id, width)` | resize width (min 100); ports follow |
| `setNodeColor(id, color)` | `#rgb`/`#rrggbb` accent (header + border), `null` = theme default; invalid values ignored |

### Groups

| Call | Description |
|---|---|
| `addGroup({ x, y, w, h, label, color })` | add a group box (defaults 320×220) |
| `removeGroup(id)` | remove the box only — contained nodes stay |
| `setGroupLabel(id, label)` / `setGroupColor(id, color)` | rename / tint (colour washes the fill and paints the double border) |
| `setGroupRect(id, { x, y, w, h })` | reposition/resize (w, h floored at 1) |
| `moveGroup(id, x, y)` | move the box and translate every member node by the same delta |
| `groupMembers(id)` | ids of the nodes currently inside (centre-based) |

### Parameters

| Call | Description |
|---|---|
| `addParam(nodeId, { name })` | append a param row (both ports appear); returns it |
| `removeParam(nodeId, paramId)` | remove the row and any edge on its ports |

### Edges

| Call | Description |
|---|---|
| `connect(source, target)` | refs `{ node, param }`. Throws on unknown port, self-connect, or duplicate; returns the edge |
| `removeEdge(id)` | delete |
| `setEdgeLabel(id, label)` | set the single label (empty string clears it) |
| `setEdgeLabelT(id, t)` | slide the label to fraction `t` (0..1) of edge length |

### JSON

| Call | Description |
|---|---|
| `exportJSON()` | pretty-printed `{ version: 1, nodes, edges, groups }` string |
| `importJSON(text)` | parse + validate, then replace the live model. Throws on bad JSON, wrong shape, or dangling port refs — before touching state. `groups` are optional (older files) |

### PDF

| Call | Description |
|---|---|
| `exportPDF(nodeIds?)` | one-page vector PDF as a `Uint8Array`, ≥20 px clear space. Defaults to all nodes; pass an array/Set to export a subset (plus the groups containing them). Throws on an empty set |

### Theme & viewport

| Call | Description |
|---|---|
| `setDark(on)` | toggle the `dark` class (see THEMING) |
| `view` | live `{ x, y, scale }` of the pan/zoom transform |
| `panBy(dx, dy)` | pan by screen pixels |
| `zoomTo(scale)` | zoom centred on the canvas (clamped 0.2–4) |

### Misc

| Call | Description |
|---|---|
| `getNodes()` / `getEdges()` / `getGroups()` | live model arrays (read-only by convention) |
| `addContextMenuItem(label, action)` | append an item to the context menu |
| `destroy()` | remove listeners, SVG, and the `ng-graph` classes |

---

## Interactions (→ INTERACTIONS)

| Gesture | Result |
|---|---|
| click node / edge / group | select (shift-click toggles; a multi-selection drags together) |
| click empty canvas | clear selection |
| drag node | move, snapping to the grid; connected waypoints follow |
| drag empty canvas | marquee-select nodes |
| drag middle button | pan (wheel zooms, anchored at the cursor) |
| drag port → port | connect (either direction: out→in or in→out) |
| drag a selected node's right-edge grip | resize its width |
| drag an edge segment grip | slide that straight run perpendicular to itself |
| double-click a segment grip | collapse the run |
| drag an edge label | slide it along the edge |
| double-click node / param / edge label / group label | inline text editor (Enter commits, Escape cancels, clicking away commits) |
| `+` / `−` / `×` buttons | add param / remove param / delete node |
| right-click, or double-click empty canvas | context menu: add node/group, delete selection, rename/tint group, tint node, Export PDF / JSON, Import JSON, Fit view, theme toggle |
| Delete / Backspace | remove the selection |
| Escape | cancel edit → close menu → clear selection |

Errors (e.g. connecting two outputs) show as a transient toast, never a dialog.

---

## THEMING (→ STYLE)

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

A node's or group's own `color` overrides the header/border (nodes) or
fill/border (groups) via inline custom properties — see `#renderNode` /
`#renderGroup` in RENDERER.

---

## PDF export (→ PDF EXPORT)

`buildPDF(scene)` is a minimal PDF 1.4 writer: no libraries, vector output,
standard Helvetica fonts (no embedding). `Renderer.buildScene(model, nodeIds)`
(RENDERER) snapshots the graph into the scene format it consumes, reading the
current theme's CSS variables so the PDF matches the screen:

- **Dashed edges** — the `d` operator takes a PDF *array* plus a phase
  (`[6 4] 0 d`); the bare `6 4 d` form is invalid and viewers silently draw
  solid lines.
- **Label halos** — SVG's `paint-order: stroke` is emulated with two passes:
  stroke-only text (`1 Tr`) then fill (`0 Tr`). PDF render mode 2 strokes *over*
  the fill and eats thin glyphs — never use it here.
- **No alpha** — translucent group fills are composited onto the page background
  into an opaque colour before writing.
- Groups are included when they contain at least one exported node.

---

## Advanced exports

Besides `createGraph`, the module exports its internals (each documented in the
section it lives in) so you can build custom tooling without a UI:

- **Model**: `createModel`, `findNode`, `findGroup`, and every CRUD function.
- **Geometry**: `GRID`, `NODE_W`, `MIN_NODE_W`, `HEADER_H`, `ROW_H`, `GROUP_MIN`,
  `GROUP_LABEL_H`, `EDGE_DASH`, `NODE_COLORS`, `portPos`, `nodeRects`,
  `nodesInGroup`, `edgePoints`, `moveSegment`, `removeSegment`,
  `segmentMovable`, `adjustPointsForMove`, `snapToGrid`, `polylinePath`,
  `polylineLength`, `polylinePointAt`, `nearestSegment`, `findFreeSpot`, and the
  colour helpers (`normalizeColor`, `hexToRgba`, `readableTextOn`).
- **Renderer**: `Renderer` (headless use: `new Renderer(container)` then
  `buildScene`).
- **PDF**: `buildPDF`, `textWidth`.
- **Style**: `NG_CSS` (the stylesheet source, if you'd rather inject it yourself).

## Tests

The suite lives outside the package (this is a zero-dependency library). It
runs under Node + jsdom from `/tmp/ngtest`: `node geom.mjs`, `inter.mjs`,
`regress.mjs`, `seg2.mjs`, `pdf.mjs`, `test-label.mjs`, `color.mjs`,
`route.mjs`, `groups.mjs`, plus `pdfval.mjs`, which round-trips the PDF through
pdf-lib to prove the bytes are a valid, readable document.
