/*!
 * nodegraph.js — a zero-dependency visual node-graph editor.
 *
 * One ES module, no build step, no runtime dependencies: drop this file next to
 * your page and go — its stylesheet is embedded and injected on import.
 *
 *   import { createGraph } from './nodegraph.js';
 *   const graph = createGraph(document.getElementById('app'));
 *   const a = graph.addNode({ x: 80, y: 120, label: 'Source', params: [{ name: 'value' }] });
 *   const b = graph.addNode({ x: 380, y: 120, label: 'Sink',   params: [{ name: 'input' }] });
 *   graph.connect({ node: a.id, param: a.params[0].id }, { node: b.id, param: b.params[0].id });
 *
 * Everything is plain SVG + DOM. Themes are CSS custom properties (README.md →
 * THEMING); persistence is JSON; export is one-page vector PDF.
 *
 * ── SECTION MAP ─────────────────────────────────────────────────────────────
 *   STYLE          embedded stylesheet + one-time injection into <head>
 *   MODEL          plain-object graph model, CRUD, JSON serialisation
 *   GEOMETRY       layout constants, colours, orthogonal edge routing, snapping
 *   RENDERER       SVG rendering + the PDF scene snapshot (Renderer class)
 *   INTERACTIONS   every pointer / keyboard gesture, wired by createGraph()
 *   PDF EXPORT     minimal zero-dependency PDF 1.4 vector writer
 *   PUBLIC API     createGraph() — the factory that wires it all together
 *
 * README.md is the glossary: every public function, one line each, pointing at
 * the section here for the full details.
 */
// ═══════════════════════════════════════════════════════════════════════════
// STYLE — the complete stylesheet, injected into <head> once on import.
// All visuals are driven by the CSS custom properties below, so theming is
// just a `dark` class toggle on the container (see README.md → THEMING).
// ═══════════════════════════════════════════════════════════════════════════
export const NG_CSS = `/* nodegraph.css — minimal themeable styles.
   Light theme is the default; add class "dark" to the container for dark mode. */

.ng-graph {
  --ng-bg: #fafafa;
  --ng-grid: #e0e0e0;
  --ng-node-bg: #ffffff;
  --ng-node-border: #b0b0b0;
  --ng-header-bg: #e8e8e8;
  --ng-text: #222222;
  --ng-muted: #888888;
  --ng-port-in: #2a7fff;
  --ng-port-out: #ff7f2a;
  --ng-edge: #777777;
  --ng-edge-selected: #d33;
  --ng-btn-hover: #00000022;
  --ng-group-fill: rgba(122, 134, 184, 0.10);
  --ng-group-border: #b0b0b0;
  --ng-group-port: #777777;

  position: relative;
  overflow: hidden;
  background: var(--ng-bg);
  font-family: system-ui, sans-serif;
  user-select: none;
}

.ng-graph.dark {
  --ng-bg: #1e1e24;
  --ng-grid: #2e2e38;
  --ng-node-bg: #2a2a33;
  --ng-node-border: #55556a;
  --ng-header-bg: #3a3a48;
  --ng-text: #e8e8f0;
  --ng-muted: #9a9ab0;
  --ng-port-in: #5aa2ff;
  --ng-port-out: #ffa057;
  --ng-edge: #8a8aa0;
  --ng-edge-selected: #ff6666;
  --ng-btn-hover: #ffffff22;
  --ng-group-fill: rgba(150, 160, 210, 0.08);
  --ng-group-border: #55556a;
  --ng-group-port: #8a8aa0;
}

.ng-svg {
  width: 100%;
  height: 100%;
  display: block;
  cursor: default;
}
.ng-svg.ng-panning { cursor: grabbing; }

.ng-grid-line { fill: none; stroke: var(--ng-grid); stroke-width: 1; }

/* groups — a large labelled, resizable rectangle drawn UNDER the nodes (see the
   layer order in render.js). A solid DOUBLE border keeps it clearly distinct
   from the dashed edges, and a light tinted fill marks the area without hiding
   the grid. A group's colour tints both (see --ng-group-* in #renderGroup). */
.ng-group-rect {
  fill: var(--ng-group-fill);
  stroke: var(--ng-group-border);
  stroke-width: 1.5;
  pointer-events: all;
  cursor: move;
}
/* inner line of the double border — decorative; the body rect handles hits */
.ng-group-rect-inner {
  fill: none;
  stroke: var(--ng-group-border);
  stroke-width: 1;
  pointer-events: none;
}
.ng-group-label {
  fill: var(--ng-muted);
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
}
/* selection outline + resize grip live in the top overlay layer so they stay
   grabbable even where a node overlaps the group's border */
.ng-group-outline {
  fill: none;
  stroke: var(--ng-edge-selected);
  stroke-width: 2;
  pointer-events: none;
}
.ng-group-resize {
  fill: var(--ng-edge-selected);
  stroke: var(--ng-bg);
  stroke-width: 1;
  cursor: nwse-resize;
  opacity: 0.85;
}
.ng-group-resize.ng-resize-nw, .ng-group-resize.ng-resize-se { cursor: nwse-resize; }
.ng-group-resize.ng-resize-ne, .ng-group-resize.ng-resize-sw { cursor: nesw-resize; }
/* group boundary ports — interface anchors on a group's border (see
   addGroupPort). They look like node ports but are neutral-coloured: a group
   port is a drop target only — edges attach to it (in either direction), and
   dragging the port itself slides it along the group's border. */
.ng-group-port {
  fill: var(--ng-group-port);
  stroke: var(--ng-group-port);
  stroke-width: 1;
  cursor: move;
}
.ng-group-port:hover { stroke-width: 3; }
/* while dragging an edge toward a group border: the ghost dot marks where a
   new port would land, the highlighted run shows the border accepting it */
.ng-port-ghost {
  fill: var(--ng-group-port);
  stroke: var(--ng-bg);
  stroke-width: 2;
  opacity: 0.75;
  pointer-events: none;
}
.ng-group-border-hint {
  fill: none;
  stroke: var(--ng-edge-selected);
  stroke-width: 3;
  stroke-linecap: round;
  pointer-events: none;
}

/* nodes */
/* body fill only — the border is a separate rect drawn after the header
   (see #renderNode) so the header fill can't cover the top of the outline */
.ng-node-bg { fill: var(--ng-node-bg); }
.ng-node-stroke { fill: none; stroke: var(--ng-node-border); stroke-width: 1.5; pointer-events: none; }
.ng-header-bg { fill: var(--ng-header-bg); }
/* header text + buttons follow the node's accent colour when it has one
   (--ng-header-text is set on the node group by #renderNode) */
.ng-label { fill: var(--ng-header-text, var(--ng-text)); font-size: 13px; font-weight: 600; pointer-events: none; }
.ng-header .ng-btn { fill: var(--ng-header-text, var(--ng-muted)); }
.ng-param-name { fill: var(--ng-text); font-size: 12px; }
.ng-node { cursor: move; }
/* selection outline — drawn on top of every child (incl. the header) so the
   highlight is never covered by the header fill */
.ng-node .ng-node-outline {
  fill: none;
  stroke: var(--ng-edge-selected);
  stroke-width: 2.5;
  pointer-events: none;
}
/* width resize handle on the right edge of a selected node */
.ng-resize-grip {
  fill: var(--ng-edge-selected);
  stroke: var(--ng-bg);
  stroke-width: 1;
  cursor: ew-resize;
  opacity: 0.85;
}

/* header / param buttons */
.ng-btn {
  font-size: 13px;
  fill: var(--ng-muted);
  cursor: pointer;
  text-anchor: middle;
}
.ng-btn:hover { fill: var(--ng-text); }
.ng-btn-danger:hover { fill: #e04040; }

/* ports — solid dots (the fill colour is the port's own), drawn above the
   node border so nothing clips them */
.ng-port { stroke-width: 1; cursor: crosshair; }
.ng-port-in { fill: var(--ng-port-in); stroke: var(--ng-port-in); }
.ng-port-out { fill: var(--ng-port-out); stroke: var(--ng-port-out); }
.ng-port:hover { stroke-width: 3; }
/* invisible enlarged grab area around ports */
.ng-port-hit { fill: transparent; stroke: none; cursor: crosshair; }
/* ...but a group boundary port's grab area slides the port, not an edge */
.ng-gport-hit { cursor: move; }

/* edges — the visible stroke lives in a layer ABOVE the nodes (a connector
   must never be hidden by a node's outline) and is click-through; the wide
   invisible .ng-edge-hit paths in the layer below the nodes do the picking */
.ng-edge { fill: none; stroke: var(--ng-edge); stroke-width: 2; stroke-dasharray: 6 4; pointer-events: none; }
.ng-edge.ng-selected { stroke: var(--ng-edge-selected); stroke-width: 3; }
/* invisible wide path under each edge to make thin curves easy to click */
.ng-edge-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; }
.ng-temp { stroke-dasharray: 6 4; pointer-events: none; }
.ng-edge-label {
  fill: var(--ng-text);
  font-size: 10px;
  text-anchor: middle;
  paint-order: stroke;
  stroke: var(--ng-bg);
  stroke-width: 3px;
  cursor: grab;
}
.ng-edge-label-hint { fill: var(--ng-muted); font-style: italic; }
/* invisible generous hit box over the label so it is easy to click/drag,
   and always on top of the segment grips */
.ng-edge-label-hit { fill: transparent; stroke: none; pointer-events: all; cursor: grab; }

/* edge segment handles (visible while the edge is selected):
   drag sideways to slide a straight run, double-click to collapse it */
.ng-seg-hit { stroke: transparent; stroke-width: 10; cursor: move; fill: none; }

/* invisible full-row hit area — dragging a param row reorders the params */
.ng-param-hit { fill: transparent; stroke: none; cursor: ns-resize; }

/* horizontal line showing where a dragged param row will be inserted */
.ng-param-insert-line {
  stroke: var(--ng-edge);
  stroke-width: 2;
  stroke-dasharray: 4 3;
  pointer-events: none;
}
.ng-seg-grip {
  fill: var(--ng-edge-selected);
  stroke: var(--ng-bg);
  stroke-width: 1;
  cursor: move;
  opacity: 0.85;
}
.ng-seg-grip.ng-seg-h { cursor: ns-resize; }
.ng-seg-grip.ng-seg-v { cursor: ew-resize; }

/* rubber-band rectangle while marquee-selecting nodes */
.ng-marquee-rect {
  fill: #4a90d922;
  stroke: #4a90d9;
  stroke-width: 1;
  stroke-dasharray: 4 3;
  pointer-events: none;
}

/* context menu (double-click on empty canvas) */
.ng-menu {
  position: absolute;
  z-index: 25;
  min-width: 150px;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid var(--ng-node-border);
  background: var(--ng-node-bg);
  box-shadow: 0 4px 16px #00000033;
  font: 12px system-ui, sans-serif;
  display: flex;
  flex-direction: column;
}
.ng-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ng-text);
  font: inherit;
  cursor: pointer;
}
.ng-menu button:hover { background: var(--ng-btn-hover); }
.ng-menu button.ng-menu-danger { color: #e04040; }
/* colour chip in the "Node colour" palette */
.ng-menu-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 8px;
  vertical-align: -1px;
  border-radius: 3px;
  border: 1px solid #00000033;
}

/* submenu rows (Export / Import ▸) */
.ng-menu-item { position: relative; }
.ng-menu-submenu {
  display: none;
  position: absolute;
  left: calc(100% + 2px);
  top: -5px;
}
.ng-menu-submenu.ng-menu-submenu-left { left: auto; right: calc(100% + 2px); }
.ng-menu-item:hover > .ng-menu-submenu,
.ng-menu-item.ng-open > .ng-menu-submenu { display: flex; }

/* inline label editor (replaces prompt()) */
.ng-editor {
  position: absolute;
  z-index: 20;
  box-sizing: border-box;
  padding: 2px 4px;
  border: 1px solid var(--ng-edge-selected);
  border-radius: 3px;
  background: var(--ng-node-bg);
  color: var(--ng-text);
  font-family: inherit;
  outline: none;
}

/* transient toast (replaces alert()) */
.ng-toast {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%) translateY(8px);
  z-index: 30;
  max-width: 80%;
  padding: 6px 14px;
  border-radius: 6px;
  background: var(--ng-edge-selected);
  color: #fff;
  font: 12px system-ui, sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
}
.ng-toast.ng-show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}`;

if (typeof document !== 'undefined' && !document.getElementById('ng-style')) {
  const ngStyle = document.createElement('style');
  ngStyle.id = 'ng-style';
  ngStyle.textContent = NG_CSS;
  document.head.appendChild(ngStyle);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL — plain-object graph, CRUD, JSON. No DOM, no dependencies.
// ═══════════════════════════════════════════════════════════════════════════
// No DOM, no dependencies. All functions operate on a model object:
//   { nodes:  [{ id, label, x, y, width?, color?, params: [{ id, name }] }],
//     edges:  [{ id, source, target,   // each: { node, param } or { group, port }
//               label, labelT, points: [{ x, y }], color? }],
//     groups: [{ id, label, x, y, w, h, color?, fill?, ports: [{ id, side, t }] }] }
// Every parameter has both an input port (left) and an output port (right).
// Edges are orthogonal (90°) polylines: source port → corners → target port.
// An empty `points` array means the renderer picks a default Z-route.
// `label` is the edge's single label; `labelT` (0..1) is where it sits along it.
// A `color` (#rgb/#rrggbb) overrides the theme accent; groups have no stored
// membership — a node belongs while its centre is inside the box.

let seq = 0;
const uid = (prefix) => `${prefix}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Clamp a fraction into 0..1 (label positions, port positions along a side).
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// A valid accent colour is a #rgb / #rrggbb hex string, stored as given (only
// trimmed + lower-cased, so '#abc' stays '#abc'). null when not a hex colour.
const validColor = (color) => {
  const c = typeof color === 'string' ? color.trim().toLowerCase() : null;
  return c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c) ? c : null;
};

// Shared body of setNodeColor / setEdgeColor / setGroupColor: a null/blank
// colour deletes the property (theme default returns), an invalid value is
// ignored, a valid one is stored.
const applyColor = (obj, color) => {
  if (typeof color !== 'string' || !color.trim()) {
    delete obj.color;
    return;
  }
  const c = validColor(color);
  if (c) obj.color = c;
};

// Spread form for importJSON: { color } when valid, {} when absent/invalid.
const colorProp = (v) => {
  const c = validColor(v);
  return c ? { color: c } : {};
};

export function createModel() {
  return { nodes: [], edges: [], groups: [] };
}

export function findNode(model, id) {
  return model.nodes.find((n) => n.id === id);
}

// --- nodes ---

export function addNode(model, { x = 0, y = 0, label = 'Node', params = [], width } = {}) {
  const node = {
    id: uid('n'),
    label,
    x,
    y,
    params: params.map(({ name = 'param' }) => ({ id: uid('p'), name })),
  };
  if (Number.isFinite(Number(width))) node.width = Math.max(100, Number(width));
  model.nodes.push(node);
  return node;
}

export function removeNode(model, id) {
  model.nodes = model.nodes.filter((n) => n.id !== id);
  dropEdges(model, (e) => e.source.node === id || e.target.node === id);
}

export function setNodeLabel(model, id, label) {
  const node = findNode(model, id);
  if (node) node.label = label;
}

export function moveNode(model, id, x, y) {
  const node = findNode(model, id);
  if (node) {
    node.x = x;
    node.y = y;
  }
}

// Set a node's width in graph units (clamped to a usable minimum).
export function setNodeWidth(model, id, width) {
  const node = findNode(model, id);
  if (node) node.width = Math.max(100, Number(width) || 0);
}

// Set a node's accent colour (a #rrggbb / #rgb hex string, or null to restore
// the theme default). Invalid values are ignored.
export function setNodeColor(model, id, color) {
  const node = findNode(model, id);
  if (node) applyColor(node, color);
}

// --- parameters ---

export function addParam(model, nodeId, { name = 'param' } = {}) {
  const node = findNode(model, nodeId);
  if (!node) return null;
  const param = { id: uid('p'), name };
  node.params.push(param);
  return param;
}

export function removeParam(model, nodeId, paramId) {
  const node = findNode(model, nodeId);
  if (!node) return;
  node.params = node.params.filter((p) => p.id !== paramId);
  dropEdges(model, (e) => touches(e, nodeId, paramId));
}

// Reorder a node's params by moving the param with `paramId` to index
// `toIndex` (clamped into range). Params keep their ids, so edges attached to
// them follow automatically — only the row (and therefore the port's y) moves.
export function moveParam(model, nodeId, paramId, toIndex) {
  const node = findNode(model, nodeId);
  if (!node) return false;
  const from = node.params.findIndex((p) => p.id === paramId);
  if (from < 0) return false;
  const to = Math.max(0, Math.min(node.params.length - 1, toIndex));
  if (to === from) return false;
  const [param] = node.params.splice(from, 1);
  node.params.splice(to, 0, param);
  return true;
}

// --- edges ---

function findEdge(model, id) {
  return model.edges.find((e) => e.id === id);
}

// An edge endpoint is a ref: either a param port { node, param } or a group
// boundary port { group, port }. Resolve a ref to its graph point (or null
// when the thing it points at is gone). `side` only matters for param ports
// (out = right edge, in = left edge); group ports sit on the group's border.
function resolveEnd(model, ref, side) {
  if (!ref) return null;
  if (ref.group != null) {
    const g = findGroup(model, ref.group);
    const p = g && (g.ports || []).find((pp) => pp.id === ref.port);
    return g && p ? groupPortPos(g, p) : null;
  }
  const n = findNode(model, ref.node);
  const p = n && n.params.find((pp) => pp.id === ref.param);
  return n && p ? portPos(n, p, side) : null;
}

// True when two endpoint refs point at the same port (either kind).
const sameEnd = (a, b) =>
  !!a && !!b && (a.group != null ? b.group === a.group && b.port === a.port : b.node === a.node && b.param === a.param);

// source/target are endpoint refs (see resolveEnd). A group boundary port is a
// bidirectional interface: edges to it model things like routing one output
// into a whole group through a single anchor.
export function connect(model, source, target) {
  if (!resolveEnd(model, source, 'out') || !resolveEnd(model, target, 'in')) throw new Error('Unknown port');
  if (sameEnd(source, target)) throw new Error('Cannot connect a port to itself');
  const dup = model.edges.some((e) => sameEnd(e.source, source) && sameEnd(e.target, target));
  if (dup) throw new Error('Edge already exists');
  const edge = { id: uid('e'), source: { ...source }, target: { ...target }, label: '', labelT: 0.5, points: [] };
  model.edges.push(edge);
  return edge;
}

export function removeEdge(model, id) {
  model.edges = model.edges.filter((e) => e.id !== id);
}

// Set the edge's single label text.
export function setEdgeLabel(model, id, label) {
  const edge = findEdge(model, id);
  if (edge) edge.label = label;
}

// Set an edge's colour (a #rrggbb / #rgb hex string, or null to restore the
// theme default). The colour paints the edge's stroke. Invalid values are
// ignored — same rules as setNodeColor.
export function setEdgeColor(model, id, color) {
  const edge = findEdge(model, id);
  if (edge) applyColor(edge, color);
}

// Set where the label sits along the edge, as a fraction of total length (0..1).
export function setEdgeLabelT(model, id, t) {
  const edge = findEdge(model, id);
  if (edge) edge.labelT = clamp01(t);
}

// Replace an edge's manual waypoints (graph coordinates).
// An empty array restores the automatic route.
export function setEdgePoints(model, id, points) {
  const edge = findEdge(model, id);
  if (edge) edge.points = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

// --- groups ---
// A group is a labelled rectangle that renders underneath the nodes. It has no
// stored membership: a node belongs to a group when its centre lies inside the
// rectangle (see nodesInGroup in render.js). Moving a group translates every
// node currently inside it; resizing just changes the box.

export function findGroup(model, id) {
  return (model.groups || []).find((g) => g.id === id);
}

export function addGroup(model, { x = 0, y = 0, w = 320, h = 220, label = 'Group', color = null } = {}) {
  if (!model.groups) model.groups = [];
  const group = {
    id: uid('g'),
    label,
    x: Number(x) || 0,
    y: Number(y) || 0,
    w: Math.max(1, Number(w) || 1),
    h: Math.max(1, Number(h) || 1),
  };
  if (color) group.color = color;
  model.groups.push(group);
  return group;
}

// Remove the group box only — the nodes it contained are left untouched.
// Edges wired to the group's boundary ports go with it: without the box there
// is nothing for those anchors to sit on.
export function removeGroup(model, id) {
  if (!model.groups) return;
  model.groups = model.groups.filter((g) => g.id !== id);
  dropEdges(model, (e) => e.source.group === id || e.target.group === id);
}

export function setGroupLabel(model, id, label) {
  const group = findGroup(model, id);
  if (group) group.label = label;
}

// Set a group's colour (a #rrggbb / #rgb hex string, or null to restore the
// theme default). The colour tints the group's fill and paints its double
// border. Invalid values are ignored.
export function setGroupColor(model, id, color) {
  const group = findGroup(model, id);
  if (group) applyColor(group, color);
}

// Turn a group's fill on or off. With fill off the group is a pure outline:
// the interior is fully transparent, and the body rect only captures clicks
// on its border (see #renderGroup), so marquee drags and empty-canvas
// gestures pass through the group's area. Pass false to remove the fill,
// anything else to restore it.
export function setGroupFill(model, id, on) {
  const group = findGroup(model, id);
  if (!group) return;
  if (on === false) group.fill = false;
  else delete group.fill;
}

// Set a group's rectangle (graph coords). Width/height are floored at 1.
// Boundary ports keep their relative spot (t), so their absolute position
// moves with the border — the waypoint runs glued to them follow, exactly as
// they do when a node moves.
export function setGroupRect(model, id, { x, y, w, h } = {}) {
  const group = findGroup(model, id);
  if (!group) return;
  followWaypoints(model, (e) => e.source.group === id || e.target.group === id, () => {
    if (Number.isFinite(Number(x))) group.x = Number(x);
    if (Number.isFinite(Number(y))) group.y = Number(y);
    if (Number.isFinite(Number(w))) group.w = Math.max(1, Number(w));
    if (Number.isFinite(Number(h))) group.h = Math.max(1, Number(h));
  });
}

// --- group boundary ports ---
// A port on a group's border: an interface anchor that edges can attach to,
// representing e.g. one output fanning out into a whole group of like nodes.
// Position is relative (side + t along it), so ports survive a resize.

// A group's existing port sitting within tolPx (absolute graph distance) of a
// side/t spot, or null. Comparing absolute positions — not just side + t —
// also catches two ports meeting at the same CORNER from adjacent sides. This
// is what keeps a drop that misses the hit circle but lands on the border from
// stacking a second dot on top of an existing one.
function groupPortNear(group, side, t, tolPx = GRID / 2) {
  if (!group || !group.ports) return null;
  const p = groupPortPos(group, { side, t });
  return group.ports.find((q) => {
    const qp = groupPortPos(group, q);
    return Math.hypot(qp.x - p.x, qp.y - p.y) <= tolPx;
  }) || null;
}

export function addGroupPort(model, groupId, { side = 'right', t = 0.5 } = {}) {
  const group = findGroup(model, groupId);
  if (!group) return null;
  const s = GROUP_SIDES.includes(side) ? side : 'right';
  const tt = clamp01(Number(t) || 0);
  if (!group.ports) group.ports = [];
  // never stack two ports on the same spot — reuse the one already there
  const near = groupPortNear(group, s, tt);
  if (near) return near;
  const port = { id: uid('gp'), side: s, t: tt };
  group.ports.push(port);
  return port;
}

// Remove a boundary port and every edge attached to it.
export function removeGroupPort(model, groupId, portId) {
  const group = findGroup(model, groupId);
  if (!group || !group.ports) return;
  group.ports = group.ports.filter((p) => p.id !== portId);
  dropEdges(model, (e) => (e.source.group === groupId && e.source.port === portId) || (e.target.group === groupId && e.target.port === portId));
}

// Port endpoints (graph coords) for an edge, or null if an endpoint's
// node/param or group/port is gone. Endpoint refs are either { node, param }
// or { group, port } — this is the single resolver every consumer (renderer,
// segment drags, label placement, PDF) goes through.
export function edgeEnds(model, edge) {
  const a = resolveEnd(model, edge.source, 'out');
  const b = resolveEnd(model, edge.target, 'in');
  return a && b ? { a, b } : null;
}

// Run `mutate` and translate the waypoint runs glued to the ports of every
// edge matching `watch` — the single implementation of the snapshot → mutate →
// adjust dance that every port-moving operation needs (see
// adjustPointsForMove). Only edges with manual waypoints are touched; an edge
// whose endpoints stop resolving mid-mutate is skipped.
function followWaypoints(model, watch, mutate) {
  const prev = new Map();
  for (const edge of model.edges) {
    if (!edge.points.length || !watch(edge)) continue;
    const ends = edgeEnds(model, edge);
    if (ends) prev.set(edge.id, { a: { ...ends.a }, b: { ...ends.b } });
  }
  const result = mutate();
  for (const edge of model.edges) {
    const p = prev.get(edge.id);
    if (!p) continue;
    const ends = edgeEnds(model, edge);
    if (!ends) continue;
    edge.points = adjustPointsForMove(edge.points, ends.a, ends.b, p.a, p.b);
  }
  return result;
}

// Translate a set of groups AND a set of member nodes by (dx, dy), both snapped
// to the grid. Waypoints glued to a moved member's port follow it (see
// adjustPointsForMove). Membership is NOT recomputed here — the caller snapshots
// the scope at drag start, so a node that slides into a group mid-drag is not
// carried until the next drag. This is the single implementation behind group
// dragging (interactions) and the public moveGroup API.
export function moveGroupsBy(model, groupIds, nodeIds, dx, dy) {
  const moved = new Set(nodeIds);
  const movedGroups = new Set(groupIds);
  followWaypoints(
    model,
    (edge) =>
      moved.has(edge.source.node) || moved.has(edge.target.node) ||
      movedGroups.has(edge.source.group) || movedGroups.has(edge.target.group),
    () => {
      for (const gid of groupIds) {
        const g = findGroup(model, gid);
        if (g) {
          g.x = snapToGrid(g.x + dx);
          g.y = snapToGrid(g.y + dy);
        }
      }
      for (const nid of moved) {
        const node = findNode(model, nid);
        if (node) {
          node.x = snapToGrid(node.x + dx);
          node.y = snapToGrid(node.y + dy);
        }
      }
    },
  );
}

// --- helpers ---

function touches(edge, nodeId, paramId) {
  return (
    (edge.source.node === nodeId && edge.source.param === paramId) ||
    (edge.target.node === nodeId && edge.target.param === paramId)
  );
}

function dropEdges(model, pred) {
  model.edges = model.edges.filter((e) => !pred(e));
}

// --- JSON ---

export function exportJSON(model) {
  return JSON.stringify({ version: 1, nodes: model.nodes, edges: model.edges, groups: model.groups || [] }, null, 2);
}

// Parse + validate. Throws on bad JSON, wrong shape, or dangling edge refs.
export function importJSON(text) {
  const data = typeof text === 'string' ? JSON.parse(text) : text;
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Invalid graph JSON: expected { version, nodes, edges }');
  }
  const model = createModel();
  for (const n of data.nodes) {
    if (!n.id || !Array.isArray(n.params)) throw new Error('Invalid graph JSON: bad node');
    model.nodes.push({
      id: n.id,
      label: n.label ?? 'Node',
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      params: n.params.map((p) => ({
        id: p.id,
        name: p.name ?? 'param',
      })),
      ...(Number.isFinite(Number(n.width)) ? { width: Math.max(100, Number(n.width)) } : {}),
      ...colorProp(n.color),
    });
  }
  // groups are parsed BEFORE edges: an edge endpoint may reference a group
  // boundary port, so those ids must exist when the edges are validated.
  // Groups are optional (older files have none); malformed entries are skipped.
  for (const g of Array.isArray(data.groups) ? data.groups : []) {
    if (!g || !Number.isFinite(Number(g.w)) || !Number.isFinite(Number(g.h))) continue;
    model.groups.push({
      id: g.id ?? uid('g'),
      label: g.label ?? 'Group',
      x: Number(g.x) || 0,
      y: Number(g.y) || 0,
      w: Math.max(1, Number(g.w)),
      h: Math.max(1, Number(g.h)),
      ...colorProp(g.color),
      // fill is opt-out: only an explicit false persists (absent = filled)
      ...(g.fill === false ? { fill: false } : {}),
      // boundary ports are optional too; bad entries are dropped
      ...(Array.isArray(g.ports) && g.ports.length
        ? {
            ports: g.ports
              .filter((p) => p && GROUP_SIDES.includes(p.side))
              .map((p) => ({ id: p.id ?? uid('gp'), side: p.side, t: clamp01(Number(p.t) || 0) })),
          }
        : {}),
    });
  }
  const paramIds = new Set(model.nodes.flatMap((n) => n.params.map((p) => p.id)));
  const groupPortIds = new Set(model.groups.flatMap((g) => (g.ports || []).map((p) => p.id)));
  // an endpoint ref is either a param port or a group boundary port
  const endOk = (ref) => !!ref && (ref.group != null ? groupPortIds.has(ref.port) : paramIds.has(ref.param));
  for (const e of data.edges) {
    if (!e.source || !e.target || !endOk(e.source) || !endOk(e.target)) {
      throw new Error('Invalid graph JSON: edge references unknown port');
    }
    model.edges.push({
      id: e.id ?? uid('e'),
      source: { ...e.source },
      target: { ...e.target },
      label: e.label ?? '',
      labelT: Number.isFinite(Number(e.labelT)) ? clamp01(Number(e.labelT)) : 0.5,
      points: Array.isArray(e.points) ? e.points.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [],
      ...colorProp(e.color),
    });
  }
  return model;
}

// ── Copy / paste ────────────────────────────────────────────────────────────
// Snapshot the current selection into a plain, self-contained object. Group
// membership is centre-based and never stored, so copying a group must also
// copy every node whose centre falls inside it — otherwise the pasted group
// would be empty. Edges are copied only when both endpoints belong to the
// copied node set. Ids are kept as-is; pasteSnapshot mints fresh ones.
export function copySelection(model, nodeIds, groupIds) {
  const copyNodeIds = new Set(nodeIds);
  for (const gid of groupIds) {
    const g = findGroup(model, gid);
    if (g) for (const nid of nodesInGroup(model, g)) copyNodeIds.add(nid);
  }
  const nodes = model.nodes
    .filter((n) => copyNodeIds.has(n.id))
    .map((n) => ({ ...n, params: n.params.map((p) => ({ ...p })) }));
  // an edge is copied when BOTH endpoints are inside the copied set — a set
  // that includes the copied groups' boundary ports, not just their nodes
  const copiedGroupIds = new Set(groupIds);
  const endCopied = (ref) => (ref.group != null ? copiedGroupIds.has(ref.group) : copyNodeIds.has(ref.node));
  const edges = model.edges
    .filter((e) => endCopied(e.source) && endCopied(e.target))
    .map((e) => ({
      ...e,
      source: { ...e.source },
      target: { ...e.target },
      points: e.points.map((p) => ({ ...p })),
    }));
  const groups = (model.groups || [])
    .filter((g) => groupIds.has(g.id))
    .map((g) => ({ ...g, ports: (g.ports || []).map((p) => ({ ...p })) }));
  return { nodes, edges, groups };
}

// Insert a snapshot produced by copySelection, offset by (dx, dy) and with
// brand-new ids everywhere so pasting never collides with the original.
// Returns the ids of the pasted nodes and groups so the caller can select them.
export function pasteSnapshot(model, snap, dx, dy) {
  const nodeId = new Map();
  const paramId = new Map(); // old node id -> (old param id -> new param id)
  for (const n of snap.nodes) {
    const id = uid('n');
    nodeId.set(n.id, id);
    const params = n.params.map((p) => ({ ...p, id: uid('p') }));
    paramId.set(n.id, new Map(n.params.map((p, i) => [p.id, params[i].id])));
    model.nodes.push({ ...n, id, x: n.x + dx, y: n.y + dy, params });
  }
  // groups first, so their fresh boundary-port ids exist when edges remap
  const groupId = new Map();
  const groupPortId = new Map(); // old group id -> (old port id -> new port id)
  for (const g of snap.groups) {
    const id = uid('g');
    groupId.set(g.id, id);
    const ports = (g.ports || []).map((p) => ({ ...p, id: uid('gp') }));
    groupPortId.set(g.id, new Map((g.ports || []).map((p, i) => [p.id, ports[i].id])));
    model.groups.push({ ...g, id, x: g.x + dx, y: g.y + dy, ...(ports.length ? { ports } : {}) });
  }
  const remapEnd = (end) => {
    if (end.group != null) {
      const gid = groupId.get(end.group);
      if (!gid) return null;
      return { group: gid, port: groupPortId.get(end.group)?.get(end.port) ?? end.port };
    }
    const nid = nodeId.get(end.node);
    if (!nid) return null;
    return { node: nid, param: paramId.get(end.node)?.get(end.param) ?? end.param };
  };
  for (const e of snap.edges) {
    const source = remapEnd(e.source);
    const target = remapEnd(e.target);
    if (!source || !target) continue;
    model.edges.push({
      ...e,
      id: uid('e'),
      source,
      target,
      points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    });
  }
  return { nodeIds: new Set([...nodeId.values()]), groupIds: new Set([...groupId.values()]) };
}

// ═══════════════════════════════════════════════════════════════════════════
// GEOMETRY — layout constants, colour helpers, orthogonal edge routing.
// ═══════════════════════════════════════════════════════════════════════════
// All colors come from CSS custom properties (see NG_CSS above), so theme
// switching is just a class toggle on the container.

// Grid pitch in graph units. The background grid, the vertical spacing between
// ports and node snapping all share this value, so ports always land on grid
// intersections and node edges always sit on grid lines.
export const GRID = 20;
export const NODE_W = 180;
export const MIN_NODE_W = 100;
// Header + row heights are multiples of GRID so that a grid-aligned node also
// has every port centre on a grid line.
export const HEADER_H = 30;
export const ROW_H = 20;

// Group boxes: a large labelled, resizable rectangle with a solid double border
// and a light tinted fill, sitting underneath the nodes. Moving it moves every
// node inside it. Sizes snap to the grid; a group is never smaller than
// GROUP_MIN on either axis.
export const GROUP_MIN = 80;
export const GROUP_LABEL_H = 24;

// The four corner resize grips of a selected group: [corner, css-class]. The
// corner name drives both the grip position and which edge moves while dragging
// (see the resize-group drag); the class sets the correct resize cursor.
export const GROUP_CORNERS = [
  ['nw', 'ng-resize-nw'],
  ['ne', 'ng-resize-ne'],
  ['sw', 'ng-resize-sw'],
  ['se', 'ng-resize-se'],
];

// The four sides a boundary port can sit on. `t` (0..1) is the port's relative
// position along that side, so ports keep their place when the group resizes.
export const GROUP_SIDES = ['top', 'right', 'bottom', 'left'];

// Edges are drawn dashed so they read clearly against node fills and the grid.
// (The SVG dash comes from CSS; this array is what the PDF writer consumes.)
export const EDGE_DASH = [6, 4];

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

// A node's width. Nodes are scalable; anything missing or too small falls back
// to the default width.
export function nodeWidth(node) {
  const w = node && Number(node.width);
  return Number.isFinite(w) ? Math.max(MIN_NODE_W, w) : NODE_W;
}

// Snap a graph coordinate to the nearest grid line.
export function snapToGrid(v, step = GRID) {
  return Math.round(v / step) * step;
}

// Bounding-box accumulator: grow(x, y) expands the box with a point; box()
// returns { x0, y0, x1, y1 }, or null while nothing has been added. Shared by
// fitView, paste centring, and the PDF scene bounds.
function bbox() {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  return {
    grow(x, y) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    },
    box: () => (Number.isFinite(x0) ? { x0, y0, x1, y1 } : null),
  };
}

// Accent colours offered in the "Node colour" menu. A node's colour paints its
// header (and its border), so the palette is chosen to stay legible in both
// themes; `null` restores the theme default.
export const NODE_COLORS = [
  { name: 'Blue', value: '#2a7fff' },
  { name: 'Teal', value: '#0f9d8f' },
  { name: 'Green', value: '#3f9b3f' },
  { name: 'Amber', value: '#d99400' },
  { name: 'Orange', value: '#e0662a' },
  { name: 'Red', value: '#d33a3a' },
  { name: 'Purple', value: '#8250df' },
  { name: 'Pink', value: '#d6409f' },
];

// Normalise a colour to #rrggbb, or null when it isn't a hex colour.
export function normalizeColor(color) {
  if (typeof color !== 'string') return null;
  const c = color.trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((ch) => ch + ch).join('') : m[1];
  return `#${hex}`;
}

// Parse a CSS colour (#rgb / #rrggbb / #rrggbbaa / rgb() / rgba()) into
// components: r, g, b in 0–255, a in 0–1. Anything unparseable is black.
// Shared by the PDF scene snapshot (alpha compositing) and the PDF writer.
function parseColor(value) {
  const s = String(value || '').trim();
  let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
  m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    let h = m[1];
    let a = 1;
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 8) {
      a = parseInt(h.slice(6, 8), 16) / 255;
      h = h.slice(0, 6);
    }
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

// #rrggbb + alpha (0–1) → rgba(r, g, b, a). Assumes a normalised hex colour.
export function hexToRgba(color, alpha) {
  const hex = normalizeColor(color);
  if (!hex) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Black or white — whichever reads better on the given background colour.
export function readableTextOn(bg) {
  const hex = normalizeColor(bg);
  if (!hex) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.45 ? '#1c1c22' : '#ffffff';
}

// Path for a rectangle whose TOP corners are rounded and whose bottom corners
// are square — used for node headers so the fill merges seamlessly with the
// body below instead of leaving rounded notches.
export function topRoundedRectPath(w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M 0 ${h} L 0 ${rr} Q 0 0 ${rr} 0 L ${w - rr} 0 Q ${w} 0 ${w} ${rr} L ${w} ${h} Z`;
}

// Graph-space position of a port circle. Every param has both ports:
// input on the left edge, output on the right edge.
export function portPos(node, param, side) {
  const i = node.params.indexOf(param);
  const x = side === 'out' ? node.x + nodeWidth(node) : node.x;
  const y = node.y + HEADER_H + i * ROW_H + ROW_H / 2;
  return { x, y };
}

export function nodeHeight(node) {
  return HEADER_H + Math.max(node.params.length, 1) * ROW_H;
}

// Graph-space position of a group boundary port: `side` picks the border, `t`
// (0..1) the relative spot along it. Relative to the box, so resizing the
// group keeps every port exactly where it visually sits.
export function groupPortPos(group, port) {
  switch (port.side) {
    case 'top':
      return { x: group.x + port.t * group.w, y: group.y };
    case 'bottom':
      return { x: group.x + port.t * group.w, y: group.y + group.h };
    case 'left':
      return { x: group.x, y: group.y + port.t * group.h };
    default: // 'right'
      return { x: group.x + group.w, y: group.y + port.t * group.h };
  }
}

// Nearest point on any group's border to (x, y), or null when every border is
// farther than maxDist. The candidate is quantised along the border to a grid
// line so a port created there lands on the grid like everything else. Used
// both for the drag cue and for the drop that creates the port, so what you
// see is exactly what you get. `excludeGroupId` skips a group (e.g. the one
// the drag started from). Returns { group, side, t, x, y }.
export function groupBorderPointAt(model, x, y, maxDist = 24, excludeGroupId = null) {
  let best = null;
  for (const g of model.groups || []) {
    if (g.id === excludeGroupId) continue;
    const inside = x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
    let side;
    let px;
    let py;
    if (inside) {
      // nearest border = the closest of the four edges
      const d = { top: y - g.y, bottom: g.y + g.h - y, left: x - g.x, right: g.x + g.w - x };
      side = ['top', 'bottom', 'left', 'right'].reduce((a, b) => (d[b] < d[a] ? b : a));
      px = side === 'left' ? g.x : side === 'right' ? g.x + g.w : x;
      py = side === 'top' ? g.y : side === 'bottom' ? g.y + g.h : y;
    } else {
      // clamp onto the rectangle; the axis that clamped is the side
      const cx = Math.min(Math.max(x, g.x), g.x + g.w);
      const cy = Math.min(Math.max(y, g.y), g.y + g.h);
      px = cx;
      py = cy;
      const clampedX = cx !== x;
      const clampedY = cy !== y;
      if (clampedX && (!clampedY || Math.abs(cx - x) >= Math.abs(cy - y))) side = cx === g.x ? 'left' : 'right';
      else side = cy === g.y ? 'top' : 'bottom';
    }
    if (Math.hypot(x - px, y - py) > maxDist) continue;
    // quantise the along-border coordinate to the grid, clamped to the side
    const horiz = side === 'top' || side === 'bottom';
    const lo = horiz ? g.x : g.y;
    const hi = horiz ? g.x + g.w : g.y + g.h;
    const along = Math.min(Math.max(snapToGrid(horiz ? px : py), lo), hi);
    const qx = horiz ? along : px;
    const qy = horiz ? py : along;
    const dist = Math.hypot(x - qx, y - qy);
    if (!best || dist < best.dist) best = { group: g, side, x: qx, y: qy, t: (along - lo) / (hi - lo || 1), dist };
  }
  if (!best) return null;
  const { dist, ...cand } = best;
  return cand;
}

// Smooth curve used only for the rubber-band preview while connecting.
export function edgePath(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

// --- angular edge routing ----------------------------------------------
// Edges are orthogonal polylines: source port → manual waypoints → target port.
// With no waypoints a default Z-route is used. The user adjusts an edge by
// sliding one of its straight segments perpendicular to itself (the segments
// either side stretch to keep every joint at 90°).

// Insert bridge waypoints so any list of points forms an orthogonal (90°)
// polyline. Guarantees the invariant that no segment is ever diagonal, no
// matter how the waypoints were produced (drag, collapse, import…).
function orthogonalize(pts) {
  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    if (prev.x === cur.x || prev.y === cur.y) {
      out.push({ x: cur.x, y: cur.y });
      continue;
    }
    // diagonal → insert a corner. Pick the orientation that continues the
    // run we arrived on, so the bridge never folds back on itself.
    const arrivedVertically = out.length >= 2 && out[out.length - 2].x === prev.x;
    out.push(arrivedVertically ? { x: prev.x, y: cur.y } : { x: cur.x, y: prev.y });
    out.push({ x: cur.x, y: cur.y });
  }
  return out;
}

function dedupe(pts) {
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

// Drop intermediate points that lie on the straight run between their
// neighbours — a polyline should only keep its actual corners, so the number
// of rendered segments is always minimal.
function simplify(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = out[out.length - 1];
    const q = pts[i];
    const r = pts[i + 1];
    if ((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)) continue;
    out.push(q);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Bounding boxes of every node — the obstacles an auto-routed edge must avoid.
export function nodeRects(model) {
  return model.nodes.map((n) => ({ x: n.x, y: n.y, w: nodeWidth(n), h: nodeHeight(n) }));
}

// A node belongs to a group when its centre lies inside the group's rectangle.
// Centre-based (not full-containment) so a node that merely overhangs the edge
// still travels with the group, and membership stays stable while the group
// moves (its members move with it, so they stay inside).
export function nodesInGroup(model, group) {
  const ids = [];
  for (const n of model.nodes) {
    const cx = n.x + nodeWidth(n) / 2;
    const cy = n.y + nodeHeight(n) / 2;
    if (cx >= group.x && cx <= group.x + group.w && cy >= group.y && cy <= group.y + group.h) ids.push(n.id);
  }
  return ids;
}

// Groups whose rectangle lies FULLY inside `group`'s — i.e. nested child groups.
// (A group is never inside itself.)
export function groupsInGroup(model, group) {
  return (model.groups || []).filter(
    (g) =>
      g.id !== group.id &&
      g.x >= group.x &&
      g.x + g.w <= group.x + group.w &&
      g.y >= group.y &&
      g.y + g.h <= group.y + group.h,
  );
}

// The full drag scope for a set of groups: every given group, every group nested
// inside them (transitively), and every node inside any of them. Moving the
// closure together is what makes a group carry its nested groups, and what lets
// a multi-selection of groups move as one unit.
export function groupClosure(model, rootIds) {
  const roots = (model.groups || []).filter((g) => rootIds.has(g.id));
  const groupIds = new Set(roots.map((g) => g.id));
  const queue = [...roots];
  while (queue.length) {
    for (const child of groupsInGroup(model, queue.shift())) {
      if (!groupIds.has(child.id)) {
        groupIds.add(child.id);
        queue.push(child);
      }
    }
  }
  const nodeIds = new Set();
  for (const gid of groupIds) {
    const g = findGroup(model, gid);
    if (g) for (const nid of nodesInGroup(model, g)) nodeIds.add(nid);
  }
  return { groupIds, nodeIds };
}

// --- obstacle-avoiding orthogonal router ---------------------------------
// Finds a 90° polyline from output port `a` to input port `b` that (a) never
// passes through a node's rectangle — including the node it originates from —
// and (b) uses as few bends as possible. More segments are acceptable; running
// under a node is not. Returns interior corner points (graph coords) or null
// when no clean route exists (caller falls back to the simple Z-route).
//
// Method: a rectilinear visibility grid over candidate lines (node edges grown
// by a keep-out margin, plus the two ports), searched with 0-1 BFS where moving
// straight is free and turning costs 1 — i.e. a minimum-bend path. The edge
// leaves `a` to the right and enters `b` from the left (both horizontal), so
// short horizontal stubs clear the two ports before the search begins.
function routeOrthogonal(a, b, obstacles, M = GRID) {
  const S = GRID; // stub length out of each port
  const aStub = { x: a.x + S, y: a.y };
  const bStub = { x: b.x - S, y: b.y };
  const inside = (r, p) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  // Grow each node by the keep-out margin — except when a port's stub lands
  // inside the grown box (nodes packed closer than the margin): there is no
  // room to keep out, so hug that node's border instead of trapping the route.
  const rects = obstacles.map((r) => {
    const g = { x: r.x - M, y: r.y - M, w: r.w + 2 * M, h: r.h + 2 * M };
    return inside(g, aStub) || inside(g, bStub) ? { x: r.x, y: r.y, w: r.w, h: r.h } : g;
  });

  const xset = new Set([aStub.x, bStub.x, a.x, b.x]);
  const yset = new Set([aStub.y, bStub.y, a.y, b.y]);
  for (const r of rects) {
    xset.add(r.x); xset.add(r.x + r.w);
    yset.add(r.y); yset.add(r.y + r.h);
  }
  const X = [...xset].sort((p, q) => p - q);
  const Y = [...yset].sort((p, q) => p - q);
  const nx = X.length;
  const ny = Y.length;
  if (nx * ny > 60000) return null; // safety valve for pathological graphs

  const si = X.indexOf(aStub.x);
  const sj = Y.indexOf(aStub.y);
  const ti = X.indexOf(bStub.x);
  const tj = Y.indexOf(bStub.y);

  // A segment is blocked only when it cuts through a rect's INTERIOR; running
  // along a rect's boundary line is always allowed (routes hug node edges).
  const blockedH = (j, i0, i1) => {
    const y = Y[j];
    const lo = Math.min(X[i0], X[i1]);
    const hi = Math.max(X[i0], X[i1]);
    return rects.some((r) => y > r.y && y < r.y + r.h && hi > r.x && lo < r.x + r.w);
  };
  const blockedV = (i, j0, j1) => {
    const x = X[i];
    const lo = Math.min(Y[j0], Y[j1]);
    const hi = Math.max(Y[j0], Y[j1]);
    return rects.some((r) => x > r.x && x < r.x + r.w && hi > r.y && lo < r.y + r.h);
  };

  const N = nx * ny * 2;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const idx = (i, j, d) => (i * ny + j) * 2 + d; // d: 0 = horizontal, 1 = vertical
  // 0-1 BFS over a preallocated deque: straight moves push to the front (cost
  // 0), turns push to the back (cost 1). The deque stays sorted by distance, so
  // a node's distance is final the first time it is popped (marked `done`);
  // every edge then relaxes at most once, bounding pushes to O(edges).
  const cap = 16 * N + 64;
  const dq = new Int32Array(cap);
  let head = cap >> 1;
  let tail = head;
  dq[tail++] = idx(si, sj, 0);
  dist[idx(si, sj, 0)] = 0;
  while (head < tail) {
    const cur = dq[head++];
    if (done[cur]) continue;
    done[cur] = 1;
    const d = cur & 1;
    const ij = (cur - d) / 2;
    const j = ij % ny;
    const i = (ij - j) / ny;
    const cd = dist[cur];
    for (const ni of [i - 1, i + 1]) {
      if (ni < 0 || ni >= nx || blockedH(j, i, ni)) continue;
      const k = idx(ni, j, 0);
      if (done[k] || cd >= dist[k]) continue;
      dist[k] = cd; prev[k] = cur;
      if (--head < 0) return null;
      dq[head] = k; // straight: free
    }
    for (const nj of [j - 1, j + 1]) {
      if (nj < 0 || nj >= ny || blockedV(i, j, nj)) continue;
      const k = idx(i, nj, 1);
      if (done[k]) continue;
      if (cd + 1 < dist[k]) {
        dist[k] = cd + 1; prev[k] = cur;
        if (tail >= cap) return null;
        dq[tail++] = k; // turn: +1
      }
    }
  }

  // The final stub (bStub → b) is horizontal; arriving vertically at bStub adds
  // one more bend, so weigh both arrival directions.
  const endH = dist[idx(ti, tj, 0)];
  const endV = dist[idx(ti, tj, 1)] + 1;
  const endDir = endH <= endV ? 0 : 1;
  if (!isFinite(Math.min(endH, endV))) return null;

  const chain = [];
  for (let cur = idx(ti, tj, endDir); cur !== -1; cur = prev[cur]) {
    const d = cur & 1;
    const ij = (cur - d) / 2;
    const j = ij % ny;
    const i = (ij - j) / ny;
    chain.push({ x: X[i], y: Y[j] });
  }
  chain.reverse();
  return chain;
}

// Orthogonal (90°) edge path: source port → corners → target port.
// With no corners the route is chosen automatically: if `obstacles` (node
// rectangles) are supplied, an obstacle-avoiding minimum-bend route is used so
// an edge never runs underneath a node; otherwise a simple Z-route is used.
// The result is always orthogonal: moveSegment() only ever shifts one axis, and
// edgePoints() re-bridges anything else (a collapsed run, hand-edited or
// imported waypoints).
export function edgePoints(a, b, corners = [], obstacles = null) {
  if (!corners.length && obstacles && obstacles.length) {
    const auto = routeOrthogonal(a, b, obstacles);
    if (auto) return simplify(dedupe(orthogonalize([a, ...auto, b])));
  }
  const mid = snapToGrid((a.x + b.x) / 2);
  const raw = corners.length
    ? [a, ...corners, b]
    : [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b];
  return simplify(dedupe(orthogonalize(raw)));
}

// The straight run through segment `index` of an orthogonal polyline:
// the point indices sharing its constant axis coordinate, the axis, and
// whether the run is pinned to a port endpoint (and therefore unmovable).
function segmentRun(pts, index) {
  const p = pts[index];
  const q = pts[index + 1];
  if (!p || !q) return null;
  const horizontal = Math.abs(p.y - q.y) < 0.5;
  const axis = horizontal ? 'y' : 'x';
  const v = p[axis];
  const run = [];
  for (let s = index; s >= 0 && pts[s][axis] === v; s--) run.push(s);
  for (let t = index + 1; t < pts.length && pts[t][axis] === v; t++) run.push(t);
  return { run, axis, locked: run.includes(0) || run.includes(pts.length - 1) };
}

// True when segment `index` can be slid (its run is not pinned to a port).
export function segmentMovable(a, b, corners, index, obstacles = null) {
  const seg = segmentRun(edgePoints(a, b, corners, obstacles), index);
  return !!seg && !seg.locked;
}

// Slide the straight run through segment `index` (of the points returned by
// edgePoints) perpendicular to its orientation, keeping 90° segments.
// A run pinned to a port endpoint cannot move.
export function moveSegment(a, b, corners, index, dx, dy, obstacles = null, snap = false) {
  const pts = edgePoints(a, b, corners, obstacles);
  const seg = segmentRun(pts, index);
  if (!seg || seg.locked) return corners;
  let d = seg.axis === 'y' ? dy : dx;
  if (!d) return corners;
  // Snap the run's constant coordinate onto a grid line (not just the delta),
  // so a dragged segment always settles on the grid like everything else.
  if (snap) {
    const coord = pts[seg.run[0]][seg.axis];
    d = snapToGrid(coord + d) - coord;
    if (!d) return corners;
  }
  for (const k of seg.run) pts[k][seg.axis] += d;
  return pts.slice(1, -1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

// Keep waypoints glued to a port that just moved by (dx, dy). Waypoints are
// stored in absolute graph coords, so when a node moves, the run of waypoints
// adjacent to its port must translate with it — otherwise the port detaches
// from the route and edgePoints() has to bridge the gap with a new corner
// (the "spawning extra segments" artifact when dragging a node).
// The run adjacent to the source port is the prefix of waypoints sharing the
// first leg's axis; adjacent to the target port it's the suffix.
export function adjustPointsForMove(points, a, b, prevA, prevB) {
  if (!points.length) return points;
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  // orientation of the leg leaving a port: horizontal legs keep a constant y.
  // Only the component perpendicular to the leg can detach the port —
  // movement along the leg just stretches it.
  const axisOf = (leg, anchor) => (Math.abs(leg.y - anchor.y) < 0.5 ? 'y' : 'x');
  // Partition the waypoints into a target-adjacent suffix and a source-adjacent
  // prefix (the suffix claims first) so no point is shifted twice when both
  // ports move. Each run translates by its own port's perpendicular delta.
  let suffixStart = pts.length;
  if (prevB) {
    const axis = axisOf(pts[pts.length - 1], prevB);
    const v = pts[pts.length - 1][axis];
    let i = pts.length - 1;
    while (i >= 0 && pts[i][axis] === v) i--;
    suffixStart = i + 1;
  }
  let prefixEnd = -1; // inclusive last index owned by the source
  if (prevA) {
    const axis = axisOf(pts[0], prevA);
    const v = pts[0][axis];
    let i = 0;
    while (i < suffixStart && pts[i][axis] === v) i++;
    prefixEnd = i - 1;
    const delta = a[axis] - prevA[axis];
    if (delta) for (let k = 0; k <= prefixEnd; k++) pts[k][axis] += delta;
  }
  if (prevB) {
    const axis = axisOf(pts[pts.length - 1], prevB);
    const delta = b[axis] - prevB[axis];
    if (delta) for (let k = suffixStart; k < pts.length; k++) pts[k][axis] += delta;
  }
  return pts;
}

// Remove the waypoint pair that bounds segment `index`, collapsing the edge.
export function removeSegment(a, b, corners, index, obstacles = null) {
  const pts = edgePoints(a, b, corners, obstacles);
  const p = pts[index];
  const q = pts[index + 1];
  if (!p || !q) return corners;
  const horizontal = Math.abs(p.y - q.y) < 0.5;
  const axis = horizontal ? 'y' : 'x';
  const drop = new Set();
  for (let i = 1; i < pts.length - 1; i++) if (pts[i][axis] === p[axis]) drop.add(i - 1);
  return corners.filter((_, i) => !drop.has(i));
}
export function polylinePath(pts) {
  return pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
}

// First grid-aligned position at/after (x, y) where a new node overlaps
// nothing. Scans outward in a small grid so a click on top of a node still
// lands clear.
export function findFreeSpot(model, x, y, width = NODE_W) {
  const rects = nodeRects(model);
  const hit = (px, py) =>
    rects.some((r) => px < r.x + r.w && px + width > r.x && py < r.y + r.h && py + nodeHeight({ params: [] }) > r.y);
  if (!hit(x, y)) return { x, y };
  for (let d = 1; d < 20; d++) {
    for (let a = 0; a < 360; a += 30) {
      const nx = x + Math.round(Math.cos((a * Math.PI) / 180) * d * GRID);
      const ny = y + Math.round(Math.sin((a * Math.PI) / 180) * d * GRID);
      if (!hit(nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

// Total length of a polyline.
export function polylineLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}

// Point at fraction `t` (0..1) of cumulative polyline length — where the label sits.
export function polylinePointAt(pts, t = 0.5) {
  const total = polylineLength(pts);
  let target = clamp01(t) * total;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (target <= d || i === pts.length - 1) {
      const u = d ? clamp01(target / d) : 0;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u };
    }
    target -= d;
  }
  return pts[pts.length - 1];
}

// Index of the segment (between pts[i] and pts[i+1]) closest to (x, y),
// or -1 when the point is farther than `maxDist`.
export function nearestSegment(pts, x, y, maxDist) {
  let best = -1;
  let bestD = maxDist;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = distToSegment(x, y, pts[i], pts[i + 1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = clamp01(t);
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

// Every edge whose drawn polyline passes within maxDist of the point, nearest
// first. Used to cycle the selection when several edges overlap at one spot.
export function edgesNearPoint(model, p, maxDist = 8) {
  const found = [];
  const obstacles = nodeRects(model);
  for (const edge of model.edges) {
    const ends = edgeEnds(model, edge);
    if (!ends) continue;
    const pts = edgePoints(ends.a, ends.b, edge.points, obstacles);
    let d = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, distToSegment(p.x, p.y, pts[i], pts[i + 1]));
    if (d <= maxDist) found.push({ id: edge.id, d });
  }
  found.sort((a, b) => a.d - b.d);
  return found.map((f) => f.id);
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDERER — SVG rendering + the PDF scene snapshot.
// ═══════════════════════════════════════════════════════════════════════════
export class Renderer {
  constructor(container) {
    this.container = container;
    this.svg = el('svg', { class: 'ng-svg' });
    container.appendChild(this.svg);

    const defs = el('defs', {}, this.svg);
    const pattern = el('pattern', { id: 'ng-grid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M 20 0 L 0 0 0 20', class: 'ng-grid-line' }, pattern);

    this.viewport = el('g', { class: 'ng-viewport' }, this.svg);
    // Huge rect so the grid covers the canvas no matter how far you pan.
    el('rect', { x: -100000, y: -100000, width: 200000, height: 200000, fill: 'url(#ng-grid)' }, this.viewport);
    this.marqueeLayer = el('g', { class: 'ng-marquee' }, this.viewport);
    // group boxes — the bottom-most interactive layer, drawn UNDER everything
    // (edges' hit paths, nodes, visible edges) so a group is a backdrop: a node
    // or an edge crossing a group still wins the click, only the group's empty
    // area selects/moves the group itself.
    this.groupsLayer = el('g', { class: 'ng-groups' }, this.viewport);
    // wide invisible hit-paths for the edges — below the nodes so they never
    // block clicking a node (or a port) that an edge passes over
    this.edgesHitLayer = el('g', { class: 'ng-edges-hit' }, this.viewport);
    // wide invisible hit-lines for the selected edge's segments — below the
    // nodes so they never block clicking a node the edge passes over
    this.segHitLayer = el('g', { class: 'ng-seg-hits' }, this.viewport);
    // group boundary ports — their OWN layer, above the edge/segment hit-paths
    // and below the nodes. An edge wired to a port draws a 14px-wide invisible
    // hit-path right over it; if the port lived in groupsLayer (bottom) that
    // hit-path would swallow the drop and a SECOND port would be created on top
    // of the first. Here the port wins its own click, while a node port sitting
    // on a group border still wins (nodes paint above).
    this.groupPortsLayer = el('g', { class: 'ng-group-ports' }, this.viewport);
    this.nodesLayer = el('g', { class: 'ng-nodes' }, this.viewport);
    // visible edges drawn ABOVE the nodes so a connector is never hidden by a
    // node's outline; they are pointer-events:none (see .ng-edge in the CSS),
    // clicks land on the hit paths in edgesHitLayer below
    this.edgesLayer = el('g', { class: 'ng-edges' }, this.viewport);
    // edge labels + segment grips, drawn above everything so they stay grabbable
    this.overlayLayer = el('g', { class: 'ng-overlay' }, this.viewport);
    // transient drag affordances (the param-reorder insertion line). Kept in
    // its own layer because render() wipes the overlay every frame; this one is
    // cleared explicitly when a gesture ends.
    this.indicatorLayer = el('g', { class: 'ng-indicators' }, this.viewport);
    this.tempPath = el('path', { class: 'ng-edge ng-temp', style: 'display:none' }, this.viewport);
  }

  setView({ x, y, scale }) {
    this.viewport.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
  }

  render(model, selectedEdgeId, selectedNodeIds, selectedGroupIds, dragging = false) {
    const selNodes = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds ? [selectedNodeIds] : []);
    const selGroups = selectedGroupIds instanceof Set ? selectedGroupIds : new Set(selectedGroupIds ? [selectedGroupIds] : []);
    // wipe every content layer (indicatorLayer is excluded — it survives render
    // frames during a gesture and is cleared when the gesture ends)
    for (const layer of [
      this.marqueeLayer, this.groupsLayer, this.groupPortsLayer, this.edgesHitLayer,
      this.segHitLayer, this.nodesLayer, this.edgesLayer, this.overlayLayer,
    ]) layer.textContent = '';
    for (const group of model.groups || []) this.#renderGroup(group, selGroups.has(group.id));
    const obstacles = nodeRects(model);
    for (const edge of model.edges) this.#renderEdge(edge, model, edge.id === selectedEdgeId, obstacles, dragging);
    for (const node of model.nodes) this.#renderNode(node, selNodes.has(node.id));
  }

  // Draw the rubber-band selection rectangle (graph coordinates).
  drawMarquee(x, y, w, h) {
    this.marqueeLayer.textContent = '';
    if (!w && !h) return;
    el('rect', { x, y, width: Math.abs(w), height: Math.abs(h), class: 'ng-marquee-rect' }, this.marqueeLayer);
  }

  // Snapshot the given nodes (and every edge whose endpoints are both in the
  // set) into a plain scene description for the PDF writer (see PDF EXPORT).
  // Colors are read from the container's CSS custom properties so the export
  // matches the current theme.
  buildScene(model, nodeIds) {
    const ids = nodeIds instanceof Set ? nodeIds : new Set(nodeIds || []);
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(this.container) : null;
    const cssVar = (name, fallback) => {
      const v = cs && cs.getPropertyValue && cs.getPropertyValue(name);
      return (v && v.trim()) || fallback;
    };
    const colors = {
      bg: cssVar('--ng-bg', '#ffffff'),
      nodeBg: cssVar('--ng-node-bg', '#ffffff'),
      nodeBorder: cssVar('--ng-node-border', '#b0b0b0'),
      headerBg: cssVar('--ng-header-bg', '#e8e8e8'),
      text: cssVar('--ng-text', '#222222'),
      portIn: cssVar('--ng-port-in', '#2a7fff'),
      portOut: cssVar('--ng-port-out', '#ff7f2a'),
      edge: cssVar('--ng-edge', '#777777'),
      muted: cssVar('--ng-muted', '#888888'),
      groupFill: cssVar('--ng-group-fill', 'rgba(122, 134, 184, 0.10)'),
      groupBorder: cssVar('--ng-group-border', '#b0b0b0'),
      groupPort: cssVar('--ng-group-port', '#777777'),
    };

    // PDF has no alpha, so a translucent group fill is composited over the page
    // background into an opaque equivalent before it is written.
    const mixOn = (bg, fg, alpha) => {
      const b = parseColor(bg), c = parseColor(fg);
      const a = alpha == null ? c.a : alpha;
      const ch = (x, y) => Math.round(x * (1 - a) + y * a);
      const hex = (v) => v.toString(16).padStart(2, '0');
      return `#${hex(ch(b.r, c.r))}${hex(ch(b.g, c.g))}${hex(ch(b.b, c.b))}`;
    };

    const scene = { margin: 20, background: colors.bg, rects: [], circles: [], paths: [], texts: [] };
    const nodes = model.nodes.filter((nd) => ids.has(nd.id));
    // Groups that actually get drawn. A group is on the page when it contains
    // ≥1 exported node (centre-based membership) OR one of its boundary ports
    // is wired to an exported node — otherwise that connector would dangle to
    // a box that isn't there. A group-port edge is in scope when BOTH its
    // endpoints are: an endpoint ref is {node,param} or {group,port}, so the
    // old `ids.has(source.node) && ids.has(target.node)` test silently dropped
    // EVERY edge wired to a group port (a group ref has no .node).
    const drawnGroupIds = new Set();
    for (const g of model.groups || []) {
      if (nodesInGroup(model, g).some((nid) => ids.has(nid))) drawnGroupIds.add(g.id);
    }
    for (const e of model.edges) {
      if (e.source.group && e.target.node && ids.has(e.target.node)) drawnGroupIds.add(e.source.group);
      if (e.target.group && e.source.node && ids.has(e.source.node)) drawnGroupIds.add(e.target.group);
    }
    const drawnGroups = (model.groups || []).filter((g) => drawnGroupIds.has(g.id));
    const endInScope = (ref) => (ref.node ? ids.has(ref.node) : drawnGroupIds.has(ref.group));
    const edges = model.edges.filter((e) => endInScope(e.source) && endInScope(e.target));

    // groups first — they render underneath the nodes. A group is included when
    // it contains at least one exported node (centre-based membership), so a
    // subset export still frames its members without stray empty boxes.
    for (const group of drawnGroups) {
      const accent = normalizeColor(group.color);
      const noFill = group.fill === false;
      const fill = noFill ? null : accent ? mixOn(colors.bg, accent, 0.1) : mixOn(colors.bg, colors.groupFill);
      const border = accent || colors.groupBorder;
      // outer border + inset inner line = the solid double border (see CSS).
      // A no-fill group exports as stroke-only (the PDF writer emits `S` for
      // an unfilled rect), matching the transparent interior on screen.
      scene.rects.push({ x: group.x, y: group.y, w: group.w, h: group.h, r: 8, fill, stroke: border, strokeWidth: 1.5 });
      scene.rects.push({ x: group.x + 3, y: group.y + 3, w: Math.max(0, group.w - 6), h: Math.max(0, group.h - 6), r: 5, stroke: border, strokeWidth: 1 });
      scene.texts.push({ x: group.x + 10, y: group.y + GROUP_LABEL_H - 7, text: group.label || 'Group', size: 12, bold: true, fill: colors.muted });
      // boundary ports ride on the border, drawn after the rects so nothing clips them
      for (const port of group.ports || []) {
        const pp = groupPortPos(group, port);
        scene.circles.push({ x: pp.x, y: pp.y, r: 5, fill: colors.groupPort, stroke: colors.groupPort, strokeWidth: 1 });
      }
    }

    // nodes first, edges on top — same layering as the SVG (connectors are
    // never hidden by a node's outline)
    for (const node of nodes) {
      const h = nodeHeight(node);
      const w = nodeWidth(node);
      // a node's own colour paints the header (and border) instead of the theme
      const accent = normalizeColor(node.color);
      const headerFill = accent || colors.headerBg;
      const borderStroke = accent || colors.nodeBorder;
      const headerText = (accent && readableTextOn(accent)) || colors.text;
      // body fill first, header fill over it, border last — same layering as
      // the SVG, so the header never covers the top edge of the outline
      scene.rects.push({ x: node.x, y: node.y, w, h, r: 6, fill: colors.nodeBg });
      // header: only the top corners are rounded (matches the SVG path)
      scene.rects.push({ x: node.x, y: node.y, w, h: HEADER_H, r: { tl: 6, tr: 6, br: 0, bl: 0 }, fill: headerFill });
      scene.rects.push({ x: node.x, y: node.y, w, h, r: 6, stroke: borderStroke, strokeWidth: 1.5 });
      scene.texts.push({ x: node.x + 8, y: node.y + HEADER_H / 2 + 4, text: node.label, size: 13, bold: true, fill: headerText });
      node.params.forEach((param, i) => {
        const y = node.y + HEADER_H + i * ROW_H + ROW_H / 2;
        scene.texts.push({ x: node.x + 14, y: y + 4, text: param.name, size: 12, fill: colors.text });
        // solid port dots, drawn after the border so nothing clips them
        scene.circles.push({ x: node.x, y, r: 5, fill: colors.portIn, stroke: colors.portIn, strokeWidth: 1 });
        scene.circles.push({ x: node.x + w, y, r: 5, fill: colors.portOut, stroke: colors.portOut, strokeWidth: 1 });
      });
    }

    for (const edge of edges) {
      const ends = edgeEnds(model, edge);
      if (!ends) continue;
      const pts = edgePoints(ends.a, ends.b, edge.points, nodeRects(model));
      scene.paths.push({ pts, stroke: normalizeColor(edge.color) || colors.edge, strokeWidth: 2, dash: EDGE_DASH });
      if (edge.label) {
        const pos = polylinePointAt(pts, edge.labelT);
        // halo matches the on-screen `paint-order: stroke` outline, so the
        // label stays readable where it crosses the (dashed) edge
        scene.texts.push({ x: pos.x, y: pos.y - 6, text: edge.label, size: 10, fill: colors.text, anchor: 'middle', stroke: colors.bg, strokeWidth: 3 });
      }
    }
    return scene;
  }

  #renderEdge(edge, model, selected, obstacles = null, dragging = false) {
    const ends = edgeEnds(model, edge);
    if (!ends) return; // defensive; model keeps edges in sync
    const a = ends.a;
    const b = ends.b;
    // While a node/group drag is in progress, skip the obstacle-avoiding
    // router for edges that have no manual waypoints: the BFS would re-run on
    // every pointermove for every auto edge. A cheap Z-route stands in until
    // the drop, when the final render routes properly once.
    const obs = dragging && !edge.points.length ? null : obstacles;
    const pts = edgePoints(a, b, edge.points, obs);
    const d = polylinePath(pts);
    // invisible wide path in the hit layer (below the nodes) so thin edges are
    // easy to click without stealing clicks from nodes/ports they pass over
    el('path', { d, class: 'ng-edge-hit', 'data-edge': edge.id }, this.edgesHitLayer);
    // an edge's own colour overrides the theme stroke (the selected highlight
    // still wins — see .ng-edge.ng-selected in the CSS)
    const accent = normalizeColor(edge.color);
    el('path', {
      d, class: 'ng-edge' + (selected ? ' ng-selected' : ''),
      style: accent ? `--ng-edge:${accent}` : undefined,
      'data-edge': edge.id,
    }, this.edgesLayer);

    // Segment handles (while selected): drag sideways to slide that straight
    // run; double-click to collapse it. Runs pinned to a port can't move, so
    // they get no handle at all.
    if (selected) {
      for (let i = 0; i + 1 < pts.length; i++) {
        if (!segmentMovable(a, b, edge.points, i, obstacles)) continue;
        const p = pts[i];
        const q = pts[i + 1];
        const horizontal = Math.abs(p.y - q.y) < 0.5;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        el('line', {
          x1: p.x, y1: p.y, x2: q.x, y2: q.y,
          class: 'ng-seg-hit', 'data-seg': i, 'data-edge': edge.id,
        }, this.segHitLayer);
        el('rect', {
          x: mx - 3, y: my - 3, width: 6, height: 6, rx: 1.5,
          class: 'ng-seg-grip' + (horizontal ? ' ng-seg-h' : ' ng-seg-v'),
          'data-seg': i, 'data-edge': edge.id,
        }, this.overlayLayer);
      }
    }

    // Single label, positioned by fraction `labelT` along the edge. Draggable
    // along the polyline; an empty label shows a "+ label" hint that starts a
    // new label with a single click. Drawn AFTER the grips (and with its own
    // transparent hit box) so a handle sitting on the label's spot can never
    // steal the click.
    if (edge.label || selected) {
      const pos = polylinePointAt(pts, edge.labelT);
      const text = edge.label || '+ label';
      el('text', {
        x: pos.x, y: pos.y - 6,
        class: 'ng-edge-label' + (edge.label ? '' : ' ng-edge-label-hint'),
        'data-edgelabel': edge.id, 'data-edge': edge.id,
      }, this.overlayLayer).textContent = text;
      let w = text.length * 6.5 + 16;
      try {
        const bb = this.overlayLayer.lastChild.getBBox();
        if (bb && bb.width) w = bb.width + 16;
      } catch { /* layout unavailable */ }
      el('rect', {
        x: pos.x - w / 2, y: pos.y - 20, width: w, height: 16,
        class: 'ng-edge-label-hit', 'data-edgelabel': edge.id, 'data-edge': edge.id,
      }, this.overlayLayer);
    }
  }

  // A group box: a large labelled rectangle with a solid double border and a
  // light tinted fill, drawn under the nodes. The body rect is the drag handle
  // (data-group) and lives in the bottom layer, so nodes/edges drawn above
  // still win their own clicks and only the group's empty area selects/moves
  // it. The selection outline and the resize grip are drawn in the top overlay
  // layer so they stay grabbable even where a node overlaps the group's border.
  #renderGroup(group, selected) {
    // A group's own colour tints its fill (a light wash) and paints the double
    // border; otherwise the theme's --ng-group-* defaults apply (see CSS).
    // With fill off the interior is transparent and the body rect only catches
    // clicks on its border, so the label (normally pointer-events:none, riding
    // on the body rect) must take its own hits to stay double-clickable.
    const accent = normalizeColor(group.color);
    const noFill = group.fill === false;
    let style = accent
      ? `--ng-group-fill:${hexToRgba(accent, 0.10)};--ng-group-border:${accent}`
      : '';
    if (noFill) style += `${style ? ';' : ''}--ng-group-fill:transparent`;
    const g = el('g', { class: 'ng-group' + (selected ? ' ng-selected' : ''), style: style || undefined, 'data-group': group.id }, this.groupsLayer);
    // The body rect carries the fill + outer border and is the drag handle
    // (data-group). It lives in the bottom layer, so nodes/edges drawn above
    // still win their own clicks and only the group's empty area selects it.
    // A no-fill group narrows its hit area to the stroke (border) only.
    el('rect', {
      x: group.x, y: group.y, width: group.w, height: group.h, rx: 8,
      class: 'ng-group-rect', 'data-group': group.id,
      style: noFill ? 'pointer-events:stroke' : undefined,
    }, g);
    // second, inset line — together with the outer border this reads as a
    // solid DOUBLE line, clearly distinct from the dashed edges
    el('rect', {
      x: group.x + 3, y: group.y + 3, width: Math.max(0, group.w - 6), height: Math.max(0, group.h - 6), rx: 5,
      class: 'ng-group-rect-inner', 'pointer-events': 'none',
    }, g);
    // label tab across the top-left of the box (double-click to rename)
    const label = el('text', {
      x: group.x + 10, y: group.y + GROUP_LABEL_H - 7,
      class: 'ng-group-label', 'data-group': group.id,
      style: noFill ? 'pointer-events:all' : undefined,
    }, g);
    label.textContent = group.label || 'Group';
    // boundary ports — interface anchors on the border. Drawn in their own
    // layer (above the edge hit-paths, below the nodes — see the constructor)
    // so an edge already wired here can't steal the drop; each has an invisible
    // larger hit circle so it is easy to grab, exactly like a node's port.
    for (const port of group.ports || []) {
      const p = groupPortPos(group, port);
      el('circle', { cx: p.x, cy: p.y, r: 5, class: 'ng-group-port', 'data-gport': group.id, 'data-gport-id': port.id, 'data-group': group.id }, this.groupPortsLayer);
      el('circle', { cx: p.x, cy: p.y, r: 10, class: 'ng-port-hit ng-gport-hit', 'data-gport': group.id, 'data-gport-id': port.id, 'data-group': group.id }, this.groupPortsLayer);
    }
    if (selected) {
      el('rect', {
        x: group.x, y: group.y, width: group.w, height: group.h, rx: 8,
        class: 'ng-group-outline', 'pointer-events': 'none',
      }, this.overlayLayer);
      // resize grips on ALL FOUR corners (drag to resize; snaps to grid). Each
      // grip keeps the OPPOSITE corner fixed — see the resize-group drag.
      for (const [corner, cls] of GROUP_CORNERS) {
        el('rect', {
          x: group.x + (corner.includes('e') ? group.w : 0) - 4,
          y: group.y + (corner.includes('s') ? group.h : 0) - 4,
          width: 8, height: 8, rx: 2,
          class: `ng-group-resize ${cls}`, 'data-resize-group': group.id, 'data-corner': corner, 'data-group': group.id,
        }, this.overlayLayer);
      }
    }
  }

  #renderNode(node, selected) {
    const h = nodeHeight(node);
    const w = nodeWidth(node);
    // A node's own colour overrides the theme for its header + border. Setting
    // CSS custom properties on the group cascades to every child (see the CSS
    // fallbacks on .ng-header-bg / .ng-node-stroke / .ng-label).
    const accent = normalizeColor(node.color);
    const style = accent
      ? `--ng-header-bg:${accent};--ng-node-border:${accent};--ng-header-text:${readableTextOn(accent)}`
      : undefined;
    const g = el('g', { class: 'ng-node' + (selected ? ' ng-selected' : ''), transform: `translate(${node.x} ${node.y})`, style, 'data-node': node.id }, this.nodesLayer);
    // Body fill only — the border is a separate rect drawn after the header
    // (below), so the header fill can never paint over the top edge of it.
    el('rect', { width: w, height: h, rx: 6, class: 'ng-node-bg' }, g);
    // header: label + "+" (add param) + "×" (delete node)
    // No data-role on the header itself — it is the drag handle for the node.
    // Top-only rounded corners: a plain rx rect would round the bottom corners
    // too and leave notches between the header fill and the body.
    const header = el('g', { class: 'ng-header' }, g);
    el('path', { d: topRoundedRectPath(w, HEADER_H, 6), class: 'ng-header-bg' }, header);
    el('text', { x: 8, y: HEADER_H / 2 + 4, class: 'ng-label' }, header).textContent = node.label;
    const addBtn = el('text', { x: w - 30, y: HEADER_H / 2 + 5, class: 'ng-btn', 'data-role': 'add-param' }, header);
    addBtn.textContent = '+';
    const delBtn = el('text', { x: w - 12, y: HEADER_H / 2 + 5, class: 'ng-btn ng-btn-danger', 'data-role': 'delete-node' }, header);
    delBtn.textContent = '×';

    // Border drawn after the header so the header fill never covers the top of
    // the outline — but BEFORE the param rows, so the port circles (which sit
    // on the node's left/right edge) stay on top of the border.
    el('rect', { width: w, height: h, rx: 6, class: 'ng-node-stroke' }, g);

    // param rows — each row has an input port (left) and an output port (right)
    node.params.forEach((param, i) => {
      const y = HEADER_H + i * ROW_H;
      // data-paramrow marks the whole row as the drag handle for reordering.
      // The invisible full-row rect gives the row a hit area; the name, buttons
      // and ports paint on top and win the click (ports and data-role buttons
      // are checked before rows in the pointerdown handler).
      const row = el('g', { class: 'ng-param', 'data-param': param.id, 'data-paramrow': param.id }, g);
      el('rect', { x: 0, y, width: w, height: ROW_H, class: 'ng-param-hit' }, row);
      el('text', { x: 14, y: y + ROW_H / 2 + 4, class: 'ng-param-name' }, row).textContent = param.name;
      const rm = el('text', { x: w - 16, y: y + ROW_H / 2 + 4, class: 'ng-btn ng-btn-danger', 'data-role': 'delete-param' }, row);
      rm.textContent = '−';

      el('circle', { cx: 0, cy: y + ROW_H / 2, r: 5, class: 'ng-port ng-port-in', 'data-port': 'in', 'data-node': node.id, 'data-param': param.id }, row);
      el('circle', { cx: w, cy: y + ROW_H / 2, r: 5, class: 'ng-port ng-port-out', 'data-port': 'out', 'data-node': node.id, 'data-param': param.id }, row);
      // invisible larger hit targets so ports are easy to grab
      el('circle', { cx: 0, cy: y + ROW_H / 2, r: 10, class: 'ng-port-hit', 'data-port': 'in', 'data-node': node.id, 'data-param': param.id }, row);
      el('circle', { cx: w, cy: y + ROW_H / 2, r: 10, class: 'ng-port-hit', 'data-port': 'out', 'data-node': node.id, 'data-param': param.id }, row);
    });

    // Selection outline drawn last so it renders above the header fill
    // (otherwise the header rect paints over the highlighted border).
    if (selected) {
      el('rect', { width: w, height: h, rx: 6, class: 'ng-node-outline' }, g);
      // width resize grip on the right edge (drag horizontally; snaps to grid)
      el('rect', {
        x: w - 3, y: h / 2 - 12, width: 6, height: 24, rx: 2,
        class: 'ng-resize-grip', 'data-resize': node.id, 'data-node': node.id,
      }, g);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIONS — every pointer / keyboard gesture (wired by createGraph).
// ═══════════════════════════════════════════════════════════════════════════
//
// Interaction model:
//   click node            → select it (shift-click adds / removes)
//   click edge            → select it (reveals segment handles + label)
//   click empty canvas    → clear selection
//   drag node             → move it (whole selection moves together)
//   drag empty canvas     → rectangular selection of nodes (left button)
//   drag middle button    → pan
//   drag port → port      → connect (either direction: out→in or in→out)
//   drag edge segment     → slide that straight run perpendicular to itself
//   drag edge label       → slide the label along the edge
//   double-click          → edit node / param / edge label inline in place
//   double-click canvas   → open the context menu
//   Delete / Backspace    → remove the selected nodes / edge
//   Escape                → cancel edit / close menu / clear selection
// Errors (bad connection etc.) show as a transient toast, never a dialog.
// Uses event delegation on the SVG root so re-renders never break listeners.

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

// Apply an imported graph to the live model (importJSON validates first, so a
// bad file throws before touching any state).
function applyImportJSON(model, text) {
  const next = importJSON(text);
  model.nodes = next.nodes;
  model.edges = next.edges;
  model.groups = next.groups;
}

// --- undo / redo ---------------------------------------------------------
// Snapshot history: every entry is a full JSON clone of { nodes, edges,
// groups }. The model is small (hundreds of plain objects at most), so full
// snapshots are far simpler — and far more robust — than per-command inverse
// operations. The stack is capped at HISTORY_LIMIT steps; older entries fall
// off the bottom. Restoring mutates the model object IN PLACE (swapping its
// arrays), because interactions and the renderer close over that reference.
const HISTORY_LIMIT = 50;

function createHistory(model, onRestore) {
  const undoStack = [];
  const redoStack = [];
  const snap = () => JSON.stringify({ nodes: model.nodes, edges: model.edges, groups: model.groups || [] });
  const restore = (text) => {
    const s = JSON.parse(text);
    model.nodes = s.nodes;
    model.edges = s.edges;
    model.groups = s.groups;
  };
  const pushEntry = (entry) => {
    undoStack.push(entry);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0; // any new change invalidates the redo branch
  };
  return {
    // Record the current state as an undo point. Call BEFORE the mutation.
    push() {
      pushEntry(snap());
    },
    // For gestures (drags): take the before-picture up front…
    begin() {
      return snap();
    },
    // …and close the gesture with it. Pushes only if the gesture actually
    // changed something, so a click that never moved adds no undo steps.
    end(pre) {
      if (pre != null && pre !== snap()) pushEntry(pre);
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undo() {
      if (!undoStack.length) return false;
      redoStack.push(snap());
      restore(undoStack.pop());
      onRestore();
      return true;
    },
    redo() {
      if (!redoStack.length) return false;
      undoStack.push(snap());
      restore(redoStack.pop());
      onRestore();
      return true;
    },
  };
}

function setupInteractions(model, renderer, render, history) {
  const svg = renderer.svg;
  const container = renderer.container;
  const view = { x: 0, y: 0, scale: 1 };
  const selNodes = new Set();
  const selGroups = new Set();
  let selEdge = null;
  let drag = null; // { kind, ... }
  let editor = null; // { input, commit }
  let menu = null; // { el, graphPoint }
  let toastTimer = null;
  const extraMenuItems = []; // [{ label, action }]
  // Internal copy buffer (not the system clipboard — that would need async
  // permissions and can't carry graph structure anyway).
  let clipboard = null; // { nodes, edges, groups } | null
  // Cycle state for overlapping edges: the last click point + the edges that
  // were near it. A repeat click at the same spot advances the selection.
  let lastEdgeCycle = null; // { x, y, ids } | null

  const select = (nodeIds, edgeId, groupIds) => {
    const next = new Set();
    if (typeof nodeIds === 'string') next.add(nodeIds);
    else if (nodeIds) for (const id of nodeIds) next.add(id);
    const nextGroups = new Set();
    if (typeof groupIds === 'string') nextGroups.add(groupIds);
    else if (groupIds) for (const id of groupIds) nextGroups.add(id);
    const edge = edgeId ?? null;
    const same =
      edge === selEdge &&
      next.size === selNodes.size &&
      [...next].every((id) => selNodes.has(id)) &&
      nextGroups.size === selGroups.size &&
      [...nextGroups].every((id) => selGroups.has(id));
    selNodes.clear();
    for (const id of next) selNodes.add(id);
    selGroups.clear();
    for (const id of nextGroups) selGroups.add(id);
    selEdge = edge;
    // Only re-render on an actual change: rebuilding the SVG mid-gesture would
    // detach the event target and break dblclick / label editing.
    if (!same) render();
  };

  // Shift-click: toggle one id in a selection set (nodes or groups), dropping
  // any edge selection, and re-render.
  const toggleSelect = (set, id) => {
    if (set.has(id)) set.delete(id);
    else set.add(id);
    selEdge = null;
    render();
  };

  // Begin a node drag over `ids`: snapshot their positions (the drag moves
  // relative to these origins) and take the pre-state for one undo step.
  const nodeDrag = (ids, p) => {
    drag = {
      kind: 'node',
      ids,
      dx: p.x,
      dy: p.y,
      pre: history.begin(),
      origins: new Map(ids.map((id) => {
        const n = findNode(model, id);
        return [id, { x: n.x, y: n.y }];
      })),
    };
  };

  const screenToGraph = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.x) / view.scale,
      y: (clientY - r.top - view.y) / view.scale,
    };
  };

  // graph coords → container-relative screen coords (for the inline editor)
  const graphToScreen = (gx, gy) => ({
    x: gx * view.scale + view.x,
    y: gy * view.scale + view.y,
  });

  // Reset the viewport to the origin at 100% (the old "Fit view" behaviour).
  const resetView = () => {
    view.x = 0;
    view.y = 0;
    view.scale = 1;
    renderer.setView(view);
  };

  // Zoom to `scale` (clamped) keeping the container-relative point (px, py)
  // fixed on screen — the graph point under the anchor stays under it.
  const zoomAt = (px, py, scale) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    view.x = px - ((px - view.x) / view.scale) * s;
    view.y = py - ((py - view.y) / view.scale) * s;
    view.scale = s;
    renderer.setView(view);
  };

  // Zoom so ALL content fits the canvas, centred, with a margin of clear space
  // around it. The bounding box spans every node, group, and routed edge
  // polyline (so a long auto-routed edge with no waypoints is framed too).
  // Scale is clamped to the wheel-zoom range; an empty graph just resets.
  const fitView = () => {
    const bb = bbox();
    for (const n of model.nodes) {
      bb.grow(n.x, n.y);
      bb.grow(n.x + nodeWidth(n), n.y + nodeHeight(n));
    }
    for (const g of model.groups || []) {
      bb.grow(g.x, g.y);
      bb.grow(g.x + g.w, g.y + g.h);
    }
    const obstacles = nodeRects(model);
    for (const edge of model.edges) {
      const ends = edgeEnds(model, edge);
      if (!ends) continue;
      for (const p of edgePoints(ends.a, ends.b, edge.points, obstacles)) bb.grow(p.x, p.y);
    }
    const b = bb.box();
    if (!b) return resetView(); // nothing to frame
    const { x0, y0, x1, y1 } = b;
    const r = svg.getBoundingClientRect();
    const pad = 40; // clear space, in screen px
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((r.width - pad * 2) / bw, (r.height - pad * 2) / bh))
    );
    // centre the content's midpoint in the viewport at the chosen scale
    view.scale = scale;
    view.x = r.width / 2 - ((x0 + x1) / 2) * scale;
    view.y = r.height / 2 - ((y0 + y1) / 2) * scale;
    renderer.setView(view);
  };

  // e.target.closest() scoped to the SVG (avoids matching menu elements).
  const closest = (e, attr) => {
    const t = e.target.closest ? e.target.closest(`[${attr}]`) : null;
    return t && svg.contains(t) ? t : null;
  };

  // --- toast: transient message, replaces alert() ---
  const toast = (msg) => {
    let el = container.querySelector('.ng-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ng-toast';
      container.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('ng-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('ng-show'), 1800);
  };

  // --- inline label editor: replaces prompt() ---
  // Opens a text input on top of the label being edited. Enter commits,
  // Escape cancels, clicking away commits.
  // NOTE: closeEditor() must commit explicitly — removing a focused element
  // does not reliably fire `blur` (Chrome fires nothing), so relying on the
  // blur listener alone silently throws away the edit when you click away.
  // Committing is the default; pass false only to cancel (Escape / destroy).
  const closeEditor = (commit = true) => {
    if (!editor) return;
    const { finish } = editor;
    editor = null; // null first: finish() below must not re-enter
    finish(commit);
  };

  // sx, sy = container-relative screen px; w = width in px.
  const openEditor = ({ sx, sy, w, text, onCommit }) => {
    closeEditor(true); // switching editors commits whatever was being typed
    closeMenu();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ng-editor';
    input.value = text;
    input.style.left = `${sx}px`;
    input.style.top = `${sy}px`;
    input.style.width = `${Math.max(40, w)}px`;
    input.style.fontSize = `${Math.max(10, 12 * view.scale)}px`;
    container.appendChild(input);
    input.focus();
    input.select();
    // Focus can be stolen by the browser's default handling of the pointerdown
    // that created us (mousedown focuses the canvas), which would blur this
    // input and instantly commit an empty label. Re-assert focus next frame.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (editor && editor.input === input && document.activeElement !== input) input.focus();
      });
    }

    const state = { done: false };
    const finish = (commit) => {
      if (state.done) return;
      state.done = true;
      if (commit) onCommit(input.value);
      if (input.isConnected) input.remove();
      render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // don't let Delete/Escape reach the canvas handler
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    editor = { input, finish };
  };

  // Shared onCommit for the label editors: trim, fall back to `fallback` when
  // empty, skip no-ops, otherwise record one undo step and apply the new value.
  const renameCommit = (old, fallback, apply) => (v) => {
    const nv = v.trim() || fallback;
    if (nv === old) return;
    history.push();
    apply(nv);
  };

  const editNode = (node) => {
    const p = graphToScreen(node.x + 6, node.y + 2);
    openEditor({
      sx: p.x,
      sy: p.y,
      w: (180 - 56) * view.scale,
      text: node.label,
      onCommit: renameCommit(node.label, node.label, (nv) => { node.label = nv; }),
    });
  };

  const editParam = (node, param) => {
    const p = graphToScreen(node.x + 10, node.y + HEADER_H + node.params.indexOf(param) * ROW_H + 1);
    openEditor({
      sx: p.x,
      sy: p.y,
      w: (180 - 40) * view.scale,
      text: param.name,
      onCommit: renameCommit(param.name, param.name, (nv) => { param.name = nv; }),
    });
  };

  const editGroup = (group) => {
    const p = graphToScreen(group.x + 8, group.y + 2);
    openEditor({
      sx: p.x,
      sy: p.y,
      w: Math.max(80, Math.min(group.w, 240)) * view.scale,
      text: group.label || '',
      onCommit: renameCommit(group.label, 'Group', (nv) => setGroupLabel(model, group.id, nv)),
    });
  };

  // Edit an edge's single label. `el` is the label element (for positioning);
  // when absent the editor opens at the label's position on the edge.
  const editLabel = (edge, el) => {
    const cr = container.getBoundingClientRect();
    let sx;
    let sy;
    let w;
    if (el && el.isConnected) {
      const r = el.getBoundingClientRect();
      sx = r.left - cr.left - 14;
      sy = r.top - cr.top - 6;
      w = Math.max(110, r.width + 32);
    } else {
      const ends = edgeEnds(model, edge);
      const pts = ends ? edgePoints(ends.a, ends.b, edge.points, nodeRects(model)) : [];
      const pos = pts.length ? polylinePointAt(pts, edge.labelT) : { x: 0, y: 0 };
      const p = graphToScreen(pos.x, pos.y);
      sx = p.x - 60;
      sy = p.y - 26;
      w = 140;
    }
    openEditor({
      sx: Math.max(0, Math.min(sx, cr.width - w - 4)),
      sy: Math.max(0, sy),
      w,
      text: edge.label || '',
      onCommit: (v) => {
        const nv = v.trim();
        if (nv === (edge.label || '')) return;
        history.push();
        setEdgeLabel(model, edge.id, nv);
      },
    });
  };

  // --- context menu: opens on double-click of empty canvas ---
  const closeMenu = () => {
    if (!menu) return;
    const el = menu.el;
    menu = null;
    el.remove();
  };

  const deleteSelection = () => {
    const pre = history.begin();
    if (selEdge) removeEdge(model, selEdge);
    for (const id of selNodes) removeNode(model, id);
    for (const id of selGroups) removeGroup(model, id);
    selNodes.clear();
    selGroups.clear();
    selEdge = null;
    history.end(pre);
    render();
  };

  // Snapshot the selection into the internal buffer. Copying a group also
  // copies its member nodes (copySelection expands them), so the paste is
  // self-contained; a lone edge can't be copied — it needs its endpoints.
  const copySelectionToClipboard = () => {
    if (!selNodes.size && !selGroups.size) return;
    clipboard = copySelection(model, selNodes, selGroups);
    const n = clipboard.nodes.length;
    const g = clipboard.groups.length;
    toast(`Copied ${n} node${n === 1 ? '' : 's'}${g ? ` + ${g} group${g === 1 ? '' : 's'}` : ''}`);
  };

  // Insert the buffer at the centre of the viewport, with fresh ids. Centering
  // (instead of a small offset from the original) keeps the pasted copy fully
  // on screen and gives the user control: pan/zoom first, then paste exactly
  // where you're looking.
  const pasteClipboard = () => {
    if (!clipboard) return;
    // bounding box of the snapshot (nodes + groups) in graph coords
    const bb = bbox();
    for (const n of clipboard.nodes) {
      bb.grow(n.x, n.y);
      bb.grow(n.x + nodeWidth(n), n.y + nodeHeight(n));
    }
    for (const g of clipboard.groups) {
      bb.grow(g.x, g.y);
      bb.grow(g.x + g.w, g.y + g.h);
    }
    const b = bb.box();
    if (!b) return; // empty snapshot — nothing to paste
    const { x0, y0, x1, y1 } = b;
    // centre of the visible canvas, in graph coordinates
    const r = svg.getBoundingClientRect();
    const c = screenToGraph(r.left + r.width / 2, r.top + r.height / 2);
    const dx = c.x - (x0 + x1) / 2;
    const dy = c.y - (y0 + y1) / 2;
    const pre = history.begin();
    const { nodeIds, groupIds } = pasteSnapshot(model, clipboard, dx, dy);
    history.end(pre);
    select(nodeIds, null, groupIds);
    render();
    toast(`Pasted ${nodeIds.size} node${nodeIds.size === 1 ? '' : 's'}`);
  };

  // Save `data` (string or bytes) to `name`: the File System Access API when
  // available, otherwise a download link. A cancelled picker stays silent;
  // failures toast `failMsg`.
  const saveFile = async (name, mime, data, okMsg, failMsg) => {
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: name.split('.').pop().toUpperCase(), accept: { [mime]: [`.${name.split('.').pop()}`] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        return toast(okMsg);
      }
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      toast(okMsg);
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
      toast(failMsg);
    }
  };

  const exportJson = () =>
    saveFile('graph.json', 'application/json', exportJSON(model), 'Graph saved', 'Save failed');

  // Read a JSON file chosen by the user: the File System Access API when
  // available, otherwise a hidden <input type=file>. Rejects AbortError on cancel.
  const pickJson = async () => {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      return (await handle.getFile()).text();
    }
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => (input.files[0] ? input.files[0].text().then(resolve) : reject(new Error('AbortError')));
      input.click();
    });
  };

  const importJson = async () => {
    try {
      const text = await pickJson();
      const pre = history.begin(); // snapshot before mutating; a failed
      applyImportJSON(model, text); // import throws and records nothing
      history.push(pre);
      selNodes.clear();
      selEdge = null;
      render();
      toast('Graph imported');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
      toast('Invalid graph file');
    }
  };

  // The node ids a PDF export should cover: the current selection (selected
  // nodes, plus every node inside a selected group), or the whole graph when
  // nothing is selected. buildScene then frames just those nodes and the groups
  // that contain them.
  const exportScope = () => {
    if (!selNodes.size && !selGroups.size) return model.nodes.map((n) => n.id);
    const ids = new Set(selNodes);
    for (const gid of selGroups) {
      const g = findGroup(model, gid);
      if (g) for (const nid of nodesInGroup(model, g)) ids.add(nid);
    }
    return [...ids];
  };

  // Export as a one-page vector PDF with ≥20px of clear space around it.
  // Exports the selection when one exists (left-click to select, then open the
  // menu — right-clicking never changes the selection); otherwise the whole graph.
  const exportPdf = async () => {
    const ids = exportScope();
    if (!ids.length) return toast('Nothing to export');
    try {
      const bytes = buildPDF(renderer.buildScene(model, ids));
      await saveFile('graph.pdf', 'application/pdf', bytes, 'PDF saved', 'PDF export failed');
    } catch {
      toast('PDF export failed');
    }
  };

  const openMenu = (clientX, clientY, graphPoint, ctx = {}) => {
    closeMenu();
    closeEditor();
    const cr = container.getBoundingClientRect();
    const items = [];
    if (history.canUndo()) items.push({ label: 'Undo', action: () => history.undo() });
    if (history.canRedo()) items.push({ label: 'Redo', action: () => history.redo() });
    // right-clicking a group's boundary port offers to remove it (and its edges)
    if (ctx.gport && ctx.group) {
      const gid = ctx.group.id;
      const pid = ctx.gport.id;
      items.push({
        label: 'Delete port',
        danger: true,
        action: () => {
          history.push();
          removeGroupPort(model, gid, pid);
          render();
        },
      });
    }
    items.push(
      {
        label: 'Add node here',
        action: () => {
          const at = findFreeSpot(model, snapToGrid(graphPoint.x), snapToGrid(graphPoint.y));
          const node = addNode(model, { x: at.x, y: at.y });
          select(node.id, null);
          editNode(node);
        },
      },
      {
        label: 'Add group here',
        action: () => {
          // anchor the box's top-left on the snapped cursor, sized to enclose
          // whatever nodes already sit around that point (plus a margin)
          const gx = snapToGrid(graphPoint.x);
          const gy = snapToGrid(graphPoint.y);
          const group = addGroup(model, { x: gx, y: gy, w: 320, h: 220, label: 'Group' });
          select(null, null, group.id);
          editGroup(group);
        },
      },
    );
    if (selNodes.size || selEdge || selGroups.size) {
      const n = selNodes.size + (selEdge ? 1 : 0) + selGroups.size;
      items.push({ label: `Delete selection (${n})`, danger: true, action: deleteSelection });
    }
    if (selNodes.size || selGroups.size) {
      items.push({ label: 'Copy', action: copySelectionToClipboard });
    }
    if (clipboard) {
      items.push({ label: 'Paste', action: pasteClipboard });
    }
    // rename a selected group
    if (selGroups.size === 1) {
      const gid = [...selGroups][0];
      const group = findGroup(model, gid);
      if (group) items.push({ label: 'Rename group', action: () => editGroup(group) });
    }
    // rename a selected node (mirrors Rename group; double-clicking the node's
    // header does the same thing directly)
    if (selNodes.size === 1) {
      const nid = [...selNodes][0];
      const node = findNode(model, nid);
      if (node) items.push({ label: 'Rename node', action: () => editNode(node) });
    }
    // A "… colour" submenu: the standard palette plus Default (null restores
    // the theme colour). `apply` receives the chosen colour; `extra` appends
    // items (e.g. the group's "No fill").
    const colorSubmenu = (label, apply, extra = []) => ({
      label,
      submenu: [
        ...NODE_COLORS.map((c) => ({ label: c.name, swatch: c.value, action: () => apply(c.value) })),
        { label: 'Default', action: () => apply(null) },
        ...extra,
      ],
    });
    // tint the selected edge(s) — same palette as nodes; the colour paints the
    // edge's stroke (the selected highlight still wins on screen)
    if (selEdge) {
      const eid = selEdge;
      items.push(colorSubmenu('Edge colour', (c) => {
        history.push();
        setEdgeColor(model, eid, c);
        render();
      }));
    }
    // tint the selected group(s) — same palette as nodes; the colour washes
    // the group's fill and paints its double border. "No fill" drops the wash
    // entirely (outline-only); picking any colour brings the fill back.
    if (selGroups.size) {
      const gids = [...selGroups];
      items.push(
        colorSubmenu(
          'Group colour',
          (c) => {
            history.push();
            for (const id of gids) {
              setGroupFill(model, id, true);
              setGroupColor(model, id, c);
            }
            render();
          },
          [
            {
              label: 'No fill',
              action: () => {
                history.push();
                for (const id of gids) setGroupFill(model, id, false);
                render();
              },
            },
          ],
        ),
      );
    }
    // colour the selected node(s) — shown whenever at least one node is selected
    if (selNodes.size) {
      const ids = [...selNodes];
      items.push(colorSubmenu('Node colour', (c) => {
        history.push();
        for (const id of ids) setNodeColor(model, id, c);
        render();
      }));
    }
    items.push(
      {
        label: 'Export / Import',
        submenu: [
          {
            label: selNodes.size || selGroups.size ? 'Export selection as PDF…' : 'Export all as PDF…',
            action: exportPdf,
          },
          { label: 'Export JSON…', action: exportJson },
          { label: 'Import JSON…', action: importJson },
        ],
      },
      {
        label: 'Fit view',
        action: fitView,
      },
      {
        label: 'Reset view',
        action: resetView,
      },
      { label: container.classList.contains('dark') ? 'Light theme' : 'Dark theme', action: () => container.classList.toggle('dark') },
      ...extraMenuItems,
    );

    const el = document.createElement('div');
    el.className = 'ng-menu';
    // Render a list of items into `parent`. Items with a `submenu` array get a
    // wrapper that reveals the nested list on hover (or click, for touch).
    const renderItems = (list, parent) => {
      for (const item of list) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = item.submenu ? `${item.label} ▸` : item.label;
        if (item.danger) btn.classList.add('ng-menu-danger');
        if (item.swatch) {
          // prepend a colour chip so the palette reads at a glance
          const chip = document.createElement('span');
          chip.className = 'ng-menu-swatch';
          chip.style.background = item.swatch;
          btn.insertBefore(chip, btn.firstChild);
        }
        if (item.submenu) {
          const wrap = document.createElement('div');
          wrap.className = 'ng-menu-item';
          const sub = document.createElement('div');
          sub.className = 'ng-menu ng-menu-submenu';
          renderItems(item.submenu, sub);
          let hideTimer = null;
          const showSub = () => {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            // collapse any sibling submenu so only one branch is open at a time
            // (leaving a click-locked one alone)
            for (const other of el.querySelectorAll('.ng-menu-submenu')) {
              if (other !== sub && !other.parentElement.classList.contains('ng-open')) other.style.display = '';
            }
            // flip to the left when the submenu would spill outside the canvas
            sub.classList.remove('ng-menu-submenu-left');
            sub.style.display = 'flex';
            const sr = sub.getBoundingClientRect();
            if (sr.right > cr.right - 4) sub.classList.add('ng-menu-submenu-left');
          };
          // Hover-intent: wait a beat before collapsing, so the pointer can
          // cross the 2px gap between a row and its submenu without the menu
          // vanishing out from under it. Re-entering the row — or its submenu,
          // which is a child of the row — cancels the pending hide.
          const scheduleHide = () => {
            if (wrap.classList.contains('ng-open')) return;
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
              hideTimer = null;
              if (!wrap.classList.contains('ng-open')) sub.style.display = '';
            }, 250);
          };
          wrap.addEventListener('mouseenter', showSub);
          wrap.addEventListener('mouseleave', scheduleHide);
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            wrap.classList.toggle('ng-open');
            if (wrap.classList.contains('ng-open')) showSub();
            else {
              if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
              sub.style.display = '';
            }
          });
          wrap.appendChild(btn);
          wrap.appendChild(sub);
          parent.appendChild(wrap);
          continue;
        }
        btn.addEventListener('click', () => {
          closeMenu();
          item.action();
        });
        parent.appendChild(btn);
      }
    };
    renderItems(items, el);
    container.appendChild(el);
    // clamp so the menu never spills outside the canvas
    el.style.left = `${Math.max(0, Math.min(clientX - cr.left, cr.width - el.offsetWidth - 4))}px`;
    el.style.top = `${Math.max(0, Math.min(clientY - cr.top, cr.height - el.offsetHeight - 4))}px`;
    menu = { el, graphPoint };
  };

  // --- pointer down: connect / select+drag node / slide segment / marquee / pan ---
  // NOTE: no setPointerCapture here — capture retargets the click/dblclick
  // compatibility events to the svg, which breaks button clicks and renaming.
  // pointermove/pointerup are listened for on window instead.
  svg.addEventListener('pointerdown', (e) => {
    // middle button → pan
    if (e.button === 1) {
      e.preventDefault();
      closeMenu();
      svg.classList.add('ng-panning');
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (e.button !== 0) return;

    if (closest(e, 'data-role')) return; // buttons handled by click

    // group resize grip (any of the four corners of a selected group) → resize
    // it. Checked early: the grips live in the top overlay layer, above nodes.
    const gripG = closest(e, 'data-resize-group');
    if (gripG) {
      const group = findGroup(model, gripG.dataset.resizeGroup);
      if (!group) return;
      const p = screenToGraph(e.clientX, e.clientY);
      drag = {
        kind: 'resize-group',
        id: group.id,
        corner: gripG.dataset.corner || 'se',
        baseX: group.x,
        baseY: group.y,
        baseW: group.w,
        baseH: group.h,
        ox: p.x,
        oy: p.y,
        pre: history.begin(),
      };
      return;
    }

    // edge label → an empty label (the "+ label" hint) starts a new label with a
    // single click; an existing label drags along the edge, double-click edits it
    const lbl = closest(e, 'data-edgelabel');
    if (lbl) {
      const edge = findEdge(model, lbl.dataset.edgelabel);
      if (!edge) return;
      select(null, edge.id);
      if (!edge.label) {
        // preventDefault stops the browser moving focus away from the input
        // we are about to create (mousedown's default focus would blur it and
        // instantly commit an empty label, losing the edit).
        e.preventDefault();
        editLabel(edge, lbl);
        return;
      }
      drag = { kind: 'label', edgeId: edge.id, pre: history.begin() };
      return;
    }

    // segment handle of the selected edge → slide that straight run
    const seg = closest(e, 'data-seg');
    if (seg) {
      const edge = findEdge(model, seg.dataset.edge);
      if (!edge) return;
      select(null, edge.id);
      const p = screenToGraph(e.clientX, e.clientY);
      drag = {
        kind: 'segment',
        edgeId: edge.id,
        index: Number(seg.dataset.seg),
        base: edge.points.map((pt) => ({ x: pt.x, y: pt.y })),
        ox: p.x,
        oy: p.y,
        pre: history.begin(),
      };
      return;
    }

    const port = closest(e, 'data-port');
    if (port) {
      const node = findNode(model, port.dataset.node);
      const param = node && node.params.find((p) => p.id === port.dataset.param);
      if (!node || !param) return;
      drag = {
        kind: 'connect',
        originPort: port.dataset.port,
        source: { node: node.id, param: param.id },
        origin: portPos(node, param, port.dataset.port),
      };
      renderer.tempPath.style.display = '';
      return;
    }

    // A group's boundary port is a drop target, never a source: dragging it
    // slides the port along the group's border (attached edges follow).
    const gportEl = closest(e, 'data-gport');
    if (gportEl) {
      const group = findGroup(model, gportEl.dataset.gport);
      const gport = group && (group.ports || []).find((p) => p.id === gportEl.dataset.gportId);
      if (!group || !gport) return;
      drag = {
        kind: 'gport-move',
        groupId: group.id,
        portId: gport.id,
        pre: history.begin(),
      };
      return;
    }

    // a param row (its name / body, not a port or button) → drag to reorder.
    // Deferred like node/group drags: a press that never moves is just a click
    // that selects the node (handled in pointerup), so single-click selection
    // and double-click-to-rename keep working unchanged.
    const paramRow = closest(e, 'data-paramrow');
    if (paramRow) {
      const nodeG = closest(e, 'data-node');
      const node = nodeG && findNode(model, nodeG.dataset.node);
      const param = node && node.params.find((p) => p.id === paramRow.dataset.paramrow);
      if (!node || !param) return;
      const p = screenToGraph(e.clientX, e.clientY);
      drag = {
        kind: 'maybe-paramrow',
        nodeId: node.id,
        paramId: param.id,
        fromIndex: node.params.indexOf(param),
        ox: p.x,
        oy: p.y,
      };
      return;
    }

    const nodeG = closest(e, 'data-node');
    if (nodeG) {
      const node = findNode(model, nodeG.dataset.node);
      if (!node) return;
      closeMenu();
      const p = screenToGraph(e.clientX, e.clientY);

      // width handle on the right edge of a selected node → resize it
      if (closest(e, 'data-resize')) {
        drag = { kind: 'resize', id: node.id, base: nodeWidth(node), ox: p.x, pre: history.begin() };
        return;
      }

      if (e.shiftKey) {
        // shift-click toggles membership; a drag afterwards moves the group
        toggleSelect(selNodes, node.id);
        drag = { kind: 'maybe-node', id: node.id, ox: p.x, oy: p.y };
        return;
      }
      if (!selNodes.has(node.id)) select(node.id, null);
      else closeEditor();
      // dragging one item of a multi-selection moves the whole selection —
      // groups included, so a mixed group + node selection travels together
      selectionDrag(p);
      return;
    }

    const edgeEl = closest(e, 'data-edge');
    if (edgeEl) {
      closeMenu();
      // Overlapping edges: repeated clicks at (nearly) the same spot cycle the
      // selection through every edge that passes within a few pixels, so a
      // hidden edge under another is still reachable. The cycle resets when the
      // click moves away or lands on a different element (selEdge goes null).
      const p = screenToGraph(e.clientX, e.clientY);
      const near = edgesNearPoint(model, p, 8);
      const sameSpot =
        lastEdgeCycle &&
        near.length > 1 &&
        Math.hypot(p.x - lastEdgeCycle.x, p.y - lastEdgeCycle.y) <= 8 &&
        near.length === lastEdgeCycle.ids.length &&
        near.every((id, k) => id === lastEdgeCycle.ids[k]);
      if (sameSpot && selEdge && near.includes(selEdge)) {
        const next = near[(near.indexOf(selEdge) + 1) % near.length];
        select(null, next);
      } else {
        select(null, edgeEl.dataset.edge);
      }
      lastEdgeCycle = { x: p.x, y: p.y, ids: near };
      return;
    }

    // group box body (bottom layer) → select + drag it. Reached only when the
    // pointer is over the group's empty area: a node, port, edge or handle above
    // it would have matched first. When groups overlap, the INNERMOST one under
    // the cursor wins — dragging a group fully embedded in another moves the
    // child, never the parent. Dragging moves the group, every group nested in
    // it, every node inside any of them, and every individually selected node
    // outside them (a mixed selection moves as one block).
    const groupG = closest(e, 'data-group');
    if (groupG) {
      const p = screenToGraph(e.clientX, e.clientY);
      const group = innermostGroupAt(model, p.x, p.y) || findGroup(model, groupG.dataset.group);
      if (!group) return;
      closeMenu();
      if (e.shiftKey) {
        toggleSelect(selGroups, group.id);
        drag = { kind: 'maybe-group', id: group.id, ox: p.x, oy: p.y };
        return;
      }
      if (!selGroups.has(group.id)) select(null, null, group.id);
      else closeEditor();
      drag = { kind: 'group', id: group.id, ox: p.x, oy: p.y, scope: groupScope(), pre: history.begin() };
      return;
    }

    // empty canvas → clear selection and start a rectangular (marquee) selection
    closeEditor();
    closeMenu();
    const base = e.shiftKey ? new Set(selNodes) : new Set();
    const baseGroups = e.shiftKey ? new Set(selGroups) : new Set();
    if (!e.shiftKey && (selNodes.size || selEdge || selGroups.size)) select(null, null);
    const p = screenToGraph(e.clientX, e.clientY);
    drag = { kind: 'marquee', ox: p.x, oy: p.y, shift: e.shiftKey, base, baseGroups };
  });

  // The drag scope for the current selection: every selected group, every group
  // nested inside them, every node inside any of them — PLUS every individually
  // selected node (inside a group or not). Snapshotted once at drag start so
  // membership stays frozen for the whole drag. This is what makes a mixed
  // group + node selection move as one block: grabbing the group carries the
  // loose selected nodes too, and grabbing a loose node carries the group.
  const groupScope = () => {
    const scope = groupClosure(model, selGroups.size ? selGroups : new Set());
    for (const id of selNodes) scope.nodeIds.add(id);
    return scope;
  };

  // The innermost group containing the point (smallest area wins), or null.
  // Used so clicking a group fully embedded in another targets the child.
  const innermostGroupAt = (model, x, y) => {
    let best = null;
    for (const g of model.groups || []) {
      if (x < g.x || x > g.x + g.w || y < g.y || y > g.y + g.h) continue;
      if (!best || g.w * g.h < best.w * best.h) best = g;
    }
    return best;
  };

  const rectHits = (x, y, w, h, node) => {
    const nh = nodeHeight(node);
    return x < node.x + nodeWidth(node) && x + w > node.x && y < node.y + nh && y + h > node.y;
  };

  // The gap index (0..params.length) a param-reorder cursor falls into: the
  // row under the cursor, and whether the cursor is in its upper or lower half.
  // The gap is where the dragged row would be inserted if released now.
  const paramGapAt = (node, gy) => {
    const rel = gy - node.y - HEADER_H;
    if (rel < 0) return 0;
    if (rel > node.params.length * ROW_H) return node.params.length;
    const i = Math.floor(rel / ROW_H);
    return rel - i * ROW_H < ROW_H / 2 ? i : i + 1;
  };

  // Draw (or move) the insertion line for the active param-reorder drag.
  const updateParamIndicator = () => {
    const node = findNode(model, drag.nodeId);
    if (!node) return;
    const gap = paramGapAt(node, drag.cy);
    drag.gap = gap;
    const y = node.y + HEADER_H + gap * ROW_H;
    const w = nodeWidth(node);
    renderer.indicatorLayer.textContent = '';
    el('line', { x1: node.x, y1: y, x2: node.x + w, y2: y, class: 'ng-param-insert-line' }, renderer.indicatorLayer);
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      view.x = drag.vx + (e.clientX - drag.sx);
      view.y = drag.vy + (e.clientY - drag.sy);
      renderer.setView(view);
    } else if (drag.kind === 'maybe-node' || drag.kind === 'maybe-group' || drag.kind === 'maybe-paramrow') {
      // Deferred drags: promote to a real drag only once the pointer has moved
      // past a small threshold — a press that never moves stays a click.
      const p = screenToGraph(e.clientX, e.clientY);
      if (Math.hypot(p.x - drag.ox, p.y - drag.oy) < 3) return;
      if (drag.kind === 'maybe-node') {
        if (!selNodes.has(drag.id)) selNodes.add(drag.id);
        startNodeDrag(p);
      } else if (drag.kind === 'maybe-group') {
        if (!selGroups.has(drag.id)) selGroups.add(drag.id);
        drag = { kind: 'group', id: drag.id, ox: p.x, oy: p.y, scope: groupScope(), pre: history.begin() };
      } else {
        drag = { kind: 'param-reorder', nodeId: drag.nodeId, paramId: drag.paramId, fromIndex: drag.fromIndex, cx: p.x, cy: p.y, gap: drag.fromIndex, pre: history.begin() };
        updateParamIndicator();
      }
    } else if (drag.kind === 'param-reorder') {
      const p = screenToGraph(e.clientX, e.clientY);
      drag.cx = p.x;
      drag.cy = p.y;
      updateParamIndicator();
    } else if (drag.kind === 'group') {
      const p = screenToGraph(e.clientX, e.clientY);
      // move the whole scope (selected groups + nested groups + their members +
      // loose selected nodes) by the snapped delta so everything lands on grid
      // lines (recomputed from the current, already-snapped origins). The scope
      // was snapshotted at drag start, so nodes entering a group mid-drag are
      // not carried.
      const dx = snapToGrid(p.x - drag.ox);
      const dy = snapToGrid(p.y - drag.oy);
      if (dx || dy) {
        drag.moved = true;
        moveGroupsBy(model, drag.scope.groupIds, drag.scope.nodeIds, dx, dy);
        drag.ox += dx;
        drag.oy += dy;
        render(true);
      }
    } else if (drag.kind === 'resize-group') {
      const group = findGroup(model, drag.id);
      if (!group) return;
      const p = screenToGraph(e.clientX, e.clientY);
      // The dragged corner moves; the OPPOSITE corner stays fixed. The moving
      // edges snap to grid lines; the size is floored at GROUP_MIN (which pins
      // the moving edge against the fixed one instead of shrinking past it).
      const dx = p.x - drag.ox;
      const dy = p.y - drag.oy;
      const west = drag.corner.includes('w');
      const north = drag.corner.includes('n');
      let x = drag.baseX;
      let y = drag.baseY;
      let w = drag.baseW;
      let h = drag.baseH;
      if (west) {
        const right = drag.baseX + drag.baseW;
        x = Math.min(snapToGrid(drag.baseX + dx), right - GROUP_MIN);
        w = right - x;
      } else {
        w = Math.max(GROUP_MIN, snapToGrid(drag.baseW + dx));
      }
      if (north) {
        const bottom = drag.baseY + drag.baseH;
        y = Math.min(snapToGrid(drag.baseY + dy), bottom - GROUP_MIN);
        h = bottom - y;
      } else {
        h = Math.max(GROUP_MIN, snapToGrid(drag.baseH + dy));
      }
      setGroupRect(model, group.id, { x, y, w, h });
      render();
    } else if (drag.kind === 'node') {
      const p = screenToGraph(e.clientX, e.clientY);
      drag.moved = true; // any movement re-rendered with the cheap router → pointerup must re-route
      // nodes snap to the background grid: each node's own position lands on a
      // grid line (not just the cursor delta), so off-grid nodes snap in too
      const sx = p.x - drag.dx;
      const sy = p.y - drag.dy;
      // Waypoints are absolute, so the waypoint runs adjacent to the moved
      // nodes' ports translate with them (followWaypoints) — otherwise moving
      // a node detaches the route and the renderer bridges the gap by spawning
      // extra segments.
      const moved = new Set(drag.ids);
      followWaypoints(model, (edge) => moved.has(edge.source.node) || moved.has(edge.target.node), () => {
        for (const id of drag.ids) {
          const node = findNode(model, id);
          const o = drag.origins.get(id);
          if (node && o) {
            node.x = snapToGrid(o.x + sx);
            node.y = snapToGrid(o.y + sy);
          }
        }
      });
      render(true);
    } else if (drag.kind === 'resize') {
      const node = findNode(model, drag.id);
      if (!node) return;
      const p = screenToGraph(e.clientX, e.clientY);
      // the new width snaps to the grid so the right edge stays on a grid line
      const w = snapToGrid(drag.base + (p.x - drag.ox));
      if (nodeWidth(node) !== w) {
        drag.moved = true;
        setNodeWidth(model, node.id, w);
        render();
      }
    } else if (drag.kind === 'gport-move') {
      const group = findGroup(model, drag.groupId);
      if (!group) return;
      const gport = (group.ports || []).find((p) => p.id === drag.portId);
      if (!gport) return;
      const p = screenToGraph(e.clientX, e.clientY);
      // project the cursor onto the port's side: t is the normalised spot along
      // the border, snapped to the grid and clamped to the side's extent
      const horiz = gport.side === 'top' || gport.side === 'bottom';
      const lo = horiz ? group.x : group.y;
      const span = horiz ? group.w : group.h;
      const along = Math.min(Math.max(snapToGrid(horiz ? p.x : p.y), lo), lo + span);
      const t = span > 0 ? (along - lo) / span : gport.t;
      if (t === gport.t) return;
      // the waypoint runs glued to the port follow it, exactly as when a node
      // moves
      followWaypoints(model, (edge) => edge.source.group === group.id || edge.target.group === group.id, () => {
        gport.t = t;
      });
      render();
    } else if (drag.kind === 'connect') {
      const p = screenToGraph(e.clientX, e.clientY);
      // draw the rubber band out of the port you grabbed, into the cursor
      const from = drag.originPort === 'out' ? drag.origin : p;
      const to = drag.originPort === 'out' ? p : drag.origin;
      renderer.tempPath.setAttribute('d', edgePath(from, to));
      updateConnectCue(p, e.clientX, e.clientY);
    } else if (drag.kind === 'segment') {
      const edge = findEdge(model, drag.edgeId);
      if (!edge) return;
      const ends = edgeEnds(model, edge);
      if (!ends) return;
      const p = screenToGraph(e.clientX, e.clientY);
      const next = moveSegment(ends.a, ends.b, drag.base, drag.index, Math.round(p.x - drag.ox), Math.round(p.y - drag.oy), nodeRects(model), true);
      setEdgePoints(model, edge.id, next);
      render();
    } else if (drag.kind === 'label') {
      const edge = findEdge(model, drag.edgeId);
      if (!edge) return;
      const ends = edgeEnds(model, edge);
      if (!ends) return;
      const pts = edgePoints(ends.a, ends.b, edge.points, nodeRects(model));
      const p = screenToGraph(e.clientX, e.clientY);
      const idx = nearestSegment(pts, p.x, p.y, Infinity);
      if (idx < 0) return;
      // project the cursor onto that segment, then convert to a fraction of total length
      const a = pts[idx];
      const b = pts[idx + 1];
      const horizontal = Math.abs(a.y - b.y) < 0.5;
      const proj = horizontal
        ? { x: Math.min(Math.max(p.x, Math.min(a.x, b.x)), Math.max(a.x, b.x)), y: a.y }
        : { x: a.x, y: Math.min(Math.max(p.y, Math.min(a.y, b.y)), Math.max(a.y, b.y)) };
      let len = 0;
      for (let i = 1; i <= idx; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      len += Math.hypot(proj.x - a.x, proj.y - a.y);
      setEdgeLabelT(model, edge.id, len / (polylineLength(pts) || 1));
      render();
    } else if (drag.kind === 'marquee') {
      const p = screenToGraph(e.clientX, e.clientY);
      const x = Math.min(drag.ox, p.x);
      const y = Math.min(drag.oy, p.y);
      const w = Math.abs(p.x - drag.ox);
      const h = Math.abs(p.y - drag.oy);
      const hit = new Set(drag.shift ? drag.base : []);
      for (const node of model.nodes) if (rectHits(x, y, w, h, node)) hit.add(node.id);
      // Groups join the marquee only when the band FULLY contains them — a
      // group is a large backdrop, and selecting one on a mere corner touch
      // would drag half the canvas unexpectedly.
      const hitGroups = new Set(drag.shift ? drag.baseGroups : []);
      for (const g of model.groups || []) {
        if (g.x >= x && g.x + g.w <= x + w && g.y >= y && g.y + g.h <= y + h) hitGroups.add(g.id);
      }
      selNodes.clear();
      for (const id of hit) selNodes.add(id);
      selEdge = null;
      selGroups.clear();
      for (const id of hitGroups) selGroups.add(id);
      render();
      renderer.drawMarquee(x, y, w, h);
    }
  };

  // Begin a drag from a node press. With groups also selected, the gesture
  // becomes a group drag over the full selection scope (selected groups +
  // nested groups + their members + every loose selected node), so a mixed
  // group + node selection moves as one block whichever item you grab.
  const selectionDrag = (p) => {
    if (selGroups.size) {
      drag = { kind: 'group', id: null, ox: p.x, oy: p.y, scope: groupScope(), pre: history.begin() };
    } else {
      nodeDrag([...selNodes], p);
    }
  };

  const startNodeDrag = (p) => selectionDrag(p);

  // --- connect-drag cue: where would a group boundary port land? ---
  // While dragging an edge, hovering a group's border previews the drop: the
  // border run lights up and a ghost dot marks the exact spot (grid-snapped,
  // the same candidate the drop uses — what you see is what you get). Drawn in
  // the indicator layer, which render() never wipes mid-gesture.
  const clearConnectCue = () => {
    renderer.indicatorLayer.textContent = '';
  };
  const updateConnectCue = (p, clientX, clientY) => {
    clearConnectCue();
    // over an existing port (node or group) the drop lands there — no ghost
    const under = document.elementFromPoint ? document.elementFromPoint(clientX, clientY) : null;
    if (under && under.closest && svg.contains(under) && (under.closest('[data-port]') || under.closest('[data-gport]'))) return;
    const cand = groupBorderPointAt(model, p.x, p.y, 24, drag.excludeGroup);
    if (!cand) return;
    // the spot already holds a port — that port is the drop target, no ghost
    if (groupPortNear(cand.group, cand.side, cand.t)) return;
    const g = cand.group;
    const ends =
      cand.side === 'top'
        ? { x1: g.x, y1: g.y, x2: g.x + g.w, y2: g.y }
        : cand.side === 'bottom'
          ? { x1: g.x, y1: g.y + g.h, x2: g.x + g.w, y2: g.y + g.h }
          : cand.side === 'left'
            ? { x1: g.x, y1: g.y, x2: g.x, y2: g.y + g.h }
            : { x1: g.x + g.w, y1: g.y, x2: g.x + g.w, y2: g.y + g.h };
    el('line', { ...ends, class: 'ng-group-border-hint' }, renderer.indicatorLayer);
    el('circle', { cx: cand.x, cy: cand.y, r: 5, class: 'ng-port-ghost' }, renderer.indicatorLayer);
  };

  // Orient a drop so the edge always runs out → in, whichever end the drag
  // started from. Returns [source, target] for `target` as the drop end.
  const orient = (target) => (drag.originPort === 'out' ? [drag.source, target] : [target, drag.source]);

  // Wire an edge, recording one undo step. A failed connect (duplicate,
  // self-loop…) toasts the reason and records nothing. `pre` may be a
  // history.begin() snapshot taken earlier (e.g. before a boundary port is
  // created) so the whole gesture stays a single undo step.
  const tryConnect = (src, dst, pre = history.begin()) => {
    try {
      connect(model, src, dst);
      history.end(pre);
    } catch (err) {
      toast(err.message);
    }
  };

  const onPointerUp = (e) => {
    if (!drag) return;
    svg.classList.remove('ng-panning');
    // Close out any gesture that could have mutated the model: the pre-state
    // taken at drag start becomes an undo step only if something changed.
    if (drag.pre != null) history.end(drag.pre);
    if (drag.kind === 'connect') {
      renderer.tempPath.style.display = 'none';
      clearConnectCue();
      // hit-test the cursor point (works regardless of event retargeting)
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const port = under && under.closest ? under.closest('[data-port]') : null;
      const gportEl = under && under.closest ? under.closest('[data-gport]') : null;
      if (port && svg.contains(port)) {
        const target = { node: port.dataset.node, param: port.dataset.param };
        // allow dragging in either direction — orient out → in automatically
        if (port.dataset.port === drag.originPort) {
          toast('Connect an output port to an input port');
        } else {
          tryConnect(...orient(target));
        }
      } else if (gportEl && svg.contains(gportEl)) {
        // dropped on an existing group boundary port — the group is a
        // bidirectional interface, so the drag's origin side wins the direction
        tryConnect(...orient({ group: gportEl.dataset.gport, port: gportEl.dataset.gportId }));
      } else {
        // dropped on empty space: if the cursor rests on a group's border, the
        // cue's candidate becomes real — create a boundary port there and wire
        // the edge to it (the group acts as one interface for its contents).
        const p = screenToGraph(e.clientX, e.clientY);
        const cand = groupBorderPointAt(model, p.x, p.y, 24, drag.excludeGroup);
        if (cand) {
          const pre = history.begin(); // before the port is created
          const port = addGroupPort(model, cand.group.id, { side: cand.side, t: cand.t });
          tryConnect(...orient({ group: cand.group.id, port: port.id }), pre);
        }
      }
      render();
    } else if (drag.kind === 'marquee') {
      renderer.drawMarquee(0, 0, 0, 0);
      render();
    } else if (drag.kind === 'node' || drag.kind === 'group' || drag.kind === 'resize') {
      // The drag rendered with the router skipped (cheap Z-routes); now that the
      // gesture is done, render once more so every auto-routed edge recomputes
      // its obstacle-avoiding path against the final positions. A press that
      // never moved changed nothing — skip the rebuild so the SVG (and its
      // elements) survive intact for the dblclick that follows a plain click.
      if (drag.moved) render();
    } else if (drag.kind === 'maybe-paramrow') {
      // never moved → it was a plain click on the row: select the node
      // (shift toggles it into the multi-selection, like clicking the header)
      if (e.shiftKey) {
        toggleSelect(selNodes, drag.nodeId);
      } else if (!selNodes.has(drag.nodeId)) {
        select(drag.nodeId, null);
      }
    } else if (drag.kind === 'param-reorder') {
      renderer.indicatorLayer.textContent = '';
      const node = findNode(model, drag.nodeId);
      if (node && drag.gap != null) {
        // the gap index counts insertion slots; removing the dragged row first
        // shifts later slots down by one, so the final index is gap or gap-1
        const to = drag.gap > drag.fromIndex ? drag.gap - 1 : drag.gap;
        if (to !== drag.fromIndex) {
          // Reordering moves a param's port (its y), so translate the waypoint
          // runs glued to that node's ports — same dance as a node move.
          followWaypoints(model, (edge) => edge.source.node === node.id || edge.target.node === node.id, () => {
            moveParam(model, node.id, drag.paramId, to);
          });
          render();
        }
      }
    }
    drag = null;
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // suppress the browser's middle-click autoscroll
  svg.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  svg.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  // right-click → context menu for the CURRENT selection. It never selects or
  // clears anything itself — left-click first, then right-click for actions.
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const gportEl = closest(e, 'data-gport');
    const ctx = {};
    if (gportEl) {
      // the port under the cursor is menu context (Delete port), not a selection
      const group = findGroup(model, gportEl.dataset.gport);
      const port = group && (group.ports || []).find((p) => p.id === gportEl.dataset.gportId);
      if (group && port) {
        ctx.group = group;
        ctx.gport = port;
      }
    }
    openMenu(e.clientX, e.clientY, screenToGraph(e.clientX, e.clientY), ctx);
  });

  // --- wheel zoom, anchored at cursor ---
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const r = svg.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.scale * factor);
      closeEditor(); // editor position would be stale after zoom
    },
    { passive: false }
  );

  // --- double click: edit edge / node / param label, or open the context menu ---
  svg.addEventListener('dblclick', (e) => {
    // The first click's pointerup re-renders the SVG (a plain click on a
    // node/group still runs a final render), which detaches the element that
    // was under the cursor. The browser then computes the dblclick target as
    // the nearest common ancestor of the two clicks — the SVG root — so
    // e.target.closest('[data-node]') finds nothing and every rename gesture
    // falls through to the empty-canvas menu. Resolve the element actually
    // under the pointer now instead of trusting e.target.
    const under = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
    const target = under && svg.contains(under) ? under : e.target;
    const hit = (attr) => {
      const t = target.closest ? target.closest(`[${attr}]`) : null;
      return t && svg.contains(t) ? t : null;
    };

    if (hit('data-role')) return; // buttons handled by click

    // double-click a segment handle → collapse that straight run
    const seg = hit('data-seg');
    if (seg) {
      const edge = findEdge(model, seg.dataset.edge);
      if (edge) {
        const ends = edgeEnds(model, edge);
        if (ends) {
          setEdgePoints(model, edge.id, removeSegment(ends.a, ends.b, edge.points, Number(seg.dataset.seg), nodeRects(model)));
          render();
        }
      }
      return;
    }

    // double-click an edge label / hint → edit the label
    const lbl = hit('data-edgelabel');
    if (lbl) {
      const edge = findEdge(model, lbl.dataset.edgelabel);
      if (edge) editLabel(edge, lbl);
      return;
    }

    const edgeEl = hit('data-edge');
    if (edgeEl) {
      const edge = findEdge(model, edgeEl.dataset.edge);
      if (edge) {
        select(null, edge.id);
        editLabel(edge, null);
      }
      return;
    }

    const nodeG = hit('data-node');
    if (nodeG) {
      const node = findNode(model, nodeG.dataset.node);
      if (!node) return;
      select(node.id, null);
      const paramG = target.closest ? target.closest('[data-param]') : null;
      const param = paramG && node.params.find((p) => p.id === paramG.dataset.param);
      if (param) editParam(node, param);
      else editNode(node);
      return;
    }

    // double-click a group (its body or label) → rename it
    const groupG = hit('data-group');
    if (groupG) {
      const group = findGroup(model, groupG.dataset.group);
      if (group) {
        select(null, null, group.id);
        editGroup(group);
      }
      return;
    }

    // empty canvas → context menu at the cursor (double-click no longer adds a node)
    openMenu(e.clientX, e.clientY, screenToGraph(e.clientX, e.clientY));
  });

  // --- node buttons: delete node/param, add param (editor opens ready to type) ---
  svg.addEventListener('click', (e) => {
    const btn = closest(e, 'data-role');
    if (!btn) return;
    const nodeId = btn.closest('[data-node]').dataset.node;
    const paramEl = btn.closest('[data-param]');
    const paramId = paramEl && paramEl.dataset.param;
    switch (btn.dataset.role) {
      case 'delete-node':
        removeNode(model, nodeId);
        selNodes.delete(nodeId);
        break;
      case 'add-param': {
        const param = addParam(model, nodeId, { name: 'param' });
        render();
        const node = findNode(model, nodeId);
        if (param && node) editParam(node, param);
        return;
      }
      case 'delete-param':
        removeParam(model, nodeId, paramId);
        break;
      default:
        return;
    }
    render();
  });

  // --- Delete/Backspace removes the selection, Escape clears it ---
  const onKeyDown = (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      if (menu) closeMenu();
      else if (selNodes.size || selEdge || selGroups.size) select(null, null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!selEdge && !selNodes.size && !selGroups.size) return;
      deleteSelection();
      return;
    }
    // Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes. Skipped while a
    // pointer gesture is in flight — the gesture's own history.end() owns it.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !drag) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        if (history.undo()) e.preventDefault();
        return;
      }
      if ((k === 'z' && e.shiftKey) || k === 'y') {
        if (history.redo()) e.preventDefault();
        return;
      }
    }
    // Ctrl/Cmd+C and Ctrl/Cmd+V operate on the internal buffer (the INPUT
    // guard above means they never fight with the inline text editor).
    // Ctrl/Cmd+A toggles between selecting everything (all nodes and groups)
    // and deselecting all — pressing it again on a full selection clears it.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'a') {
        e.preventDefault();
        const everything = new Set(model.nodes.map((n) => n.id));
        const allGroups = new Set((model.groups || []).map((g) => g.id));
        const allSelected =
          selNodes.size === everything.size && [...everything].every((id) => selNodes.has(id)) &&
          selGroups.size === allGroups.size && [...allGroups].every((id) => selGroups.has(id));
        select(allSelected ? null : everything, null, allSelected ? null : allGroups);
        return;
      }
      if (k === 'c') {
        if (selNodes.size || selGroups.size) {
          e.preventDefault();
          copySelectionToClipboard();
        }
      } else if (k === 'v') {
        if (clipboard) {
          e.preventDefault();
          pasteClipboard();
        }
      }
    }
  };
  window.addEventListener('keydown', onKeyDown);

  // Pointer-down anywhere outside the editor/menu: commit the editor and close
  // the menu. This runs in the capture phase, before the SVG handlers re-render
  // and detach the focused input — removing a focused element does not fire
  // `blur`, so committing here is what makes "click away to save" work.
  const onDocPointerDown = (e) => {
    if (editor && !(editor.input.compareDocumentPosition(e.target) & Node.DOCUMENT_POSITION_CONTAINED_BY) && e.target !== editor.input) {
      closeEditor(true);
    }
    if (menu && !menu.el.contains(e.target)) closeMenu();
  };
  window.addEventListener('pointerdown', onDocPointerDown, true);

  return {
    view,
    screenToGraph,
    fitView,
    resetView,
    zoomAt,
    getSelectedEdge: () => selEdge,
    getSelectedNodes: () => selNodes,
    getSelectedGroups: () => selGroups,
    // Drop every selection (all three sets) without re-rendering — used by
    // undo/redo, where the selected ids may no longer exist.
    clearSelection() {
      selNodes.clear();
      selGroups.clear();
      selEdge = null;
    },
    addContextMenuItem: (label, action) => extraMenuItems.push({ label, action }),
    destroy() {
      closeEditor(false);
      closeMenu();
      clearTimeout(toastTimer);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onDocPointerDown, true);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF EXPORT — minimal zero-dependency PDF 1.4 vector writer.
// ═══════════════════════════════════════════════════════════════════════════
//
// Takes a "scene" description and emits a single-page PDF:
//   {
//     margin: 20,                       // padding around the whole scene
//     rects: [{ x, y, w, h, r, fill, stroke, strokeWidth }],
//     circles: [{ x, y, r, fill, stroke, strokeWidth }],
//     paths: [{ pts: [{x,y}], stroke, strokeWidth, arrow }],
//     texts: [{ x, y, text, size, bold, fill, anchor, stroke, strokeWidth }],
//   }
// Scene coordinates are y-down (same units as the graph). The writer computes
// the scene bounding box, frames it with `margin` units of clear space on every
// side, and flips Y so the page renders upright. Text uses the standard PDF
// fonts Helvetica / Helvetica-Bold, so no embedding is needed.

const KAPPA = 0.5522847498;

// Helvetica advance widths (per 1000) for ASCII 32..126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
// Helvetica-Bold advance widths (per 1000) for ASCII 32..126.
const HELVB = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

// Characters outside Latin-1 that we want to keep, mapped to WinAnsi bytes.
const WINANSI = {
  0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2026: 0x85,
  0x2212: 0x2d, 0x00a0: 0xa0, 0x20ac: 0x80, 0x2122: 0x99,
};

// Reduce arbitrary text to WinAnsi bytes (returned as a string of char codes
// 0..255, one byte each) and escape the three PDF string specials.
function encodeText(str) {
  let out = '';
  for (const ch of String(str)) {
    let code = ch.codePointAt(0);
    if (code > 255) code = WINANSI[code] !== undefined ? WINANSI[code] : 0x3f; // '?'
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\';
    out += String.fromCharCode(code);
  }
  return out;
}

// Width of `text` in user units at `size`, using real font metrics so labels
// can be centred exactly as they are in the SVG.
export function textWidth(text, size, bold) {
  const table = bold ? HELVB : HELV;
  let total = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    total += code >= 32 && code <= 126 ? table[code - 32] : table[0];
  }
  return (total / 1000) * size;
}

// '#rgb' | '#rrggbb' | '#rrggbbaa' | 'rgb(...)' → 'r g b' in 0..1 for PDF.
// Alpha is dropped (the page background is painted first).
function colorOps(value) {
  const { r, g, b } = parseColor(value);
  return `${f(r / 255)} ${f(g / 255)} ${f(b / 255)}`;
}

const f = (n) => (Math.round(n * 1000) / 1000).toString();
const n = (v) => (Number.isFinite(v) ? v : 0);

// Scene → PDF page coordinates: flip Y and shift so the bounding box sits
// `margin` units inside the page.
function makeTransform(bbox, margin) {
  const { minX, maxY } = bbox;
  return {
    x: (x) => f(x - minX + margin),
    y: (y) => f(maxY - y + margin),
  };
}

// Path-building primitives over a transform: P emits a transformed point, C a
// transformed bezier curve segment. Shared by rectPath / circlePath / arrowPath.
const pathHelpers = (t) => ({
  P: (x, y) => `${t.x(x)} ${t.y(y)}`,
  C: (a, b, c, d, e, g) => `${t.x(a)} ${t.y(b)} ${t.x(c)} ${t.y(d)} ${t.x(e)} ${t.y(g)} c`,
});

// Rounded rectangle as a path in scene coords (corners clamped to half the
// side length so degenerate rects stay valid). `r` is either a single radius
// for all four corners or { tl, tr, br, bl } for per-corner radii (node
// headers round only their top corners).
function rectPath(t, x, y, w, h, r) {
  const clamp = (v) => Math.max(0, Math.min(v || 0, w / 2, h / 2));
  const tl = clamp(typeof r === 'object' && r ? r.tl : r);
  const tr = clamp(typeof r === 'object' && r ? r.tr : r);
  const br = clamp(typeof r === 'object' && r ? r.br : r);
  const bl = clamp(typeof r === 'object' && r ? r.bl : r);
  const { P, C } = pathHelpers(t);
  if (tl + tr + br + bl <= 0) return `${P(x, y)} m ${P(x + w, y)} l ${P(x + w, y + h)} l ${P(x, y + h)} l h `;
  return (
    `${P(x + tl, y)} m ` +
    `${P(x + w - tr, y)} l ` +
    (tr > 0 ? C(x + w - tr + tr * KAPPA, y, x + w, y + tr - tr * KAPPA, x + w, y + tr) + ' ' : '') +
    `${P(x + w, y + h - br)} l ` +
    (br > 0 ? C(x + w, y + h - br + br * KAPPA, x + w - br + br * KAPPA, y + h, x + w - br, y + h) + ' ' : '') +
    `${P(x + bl, y + h)} l ` +
    (bl > 0 ? C(x + bl - bl * KAPPA, y + h, x, y + h - bl + bl * KAPPA, x, y + h - bl) + ' ' : '') +
    `${P(x, y + tl)} l ` +
    (tl > 0 ? C(x, y + tl - tl * KAPPA, x + tl - tl * KAPPA, y, x + tl, y) + ' ' : '') +
    'h '
  );
}

// Circle as four bezier arcs (ports).
function circlePath(t, cx, cy, r) {
  const k = r * KAPPA;
  const { P, C } = pathHelpers(t);
  return (
    `${P(cx + r, cy)} m ` +
    C(cx + r, cy + k, cx + k, cy + r, cx, cy + r) + ' ' +
    C(cx - k, cy + r, cx - r, cy + k, cx - r, cy) + ' ' +
    C(cx - r, cy - k, cx - k, cy - r, cx, cy - r) + ' ' +
    C(cx + k, cy - r, cx + r, cy - k, cx + r, cy) + ' h '
  );
}

// Filled arrowhead at the end of a polyline, aligned with its last run.
function arrowPath(t, pts, size = 9, half = 3.5) {
  if (pts.length < 2) return '';
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const px = -uy;
  const py = ux;
  const bx = b.x - ux * size;
  const by = b.y - uy * size;
  const { P } = pathHelpers(t);
  return (
    `${P(b.x, b.y)} m ${P(bx + px * half, by + py * half)} l ` +
    `${P(bx - px * half, by - py * half)} l h `
  );
}

// Bounding box over every drawable (grown by half the stroke widths so the
// margin is clear space even from stroke edges), so the page can be framed
// tightly.
function sceneBounds(scene) {
  const bb = bbox();
  let maxStroke = 0;
  const grow = (x, y) => bb.grow(x, y);
  const stroke = (w) => { maxStroke = Math.max(maxStroke, n(w) || 0); };
  for (const r of scene.rects || []) {
    stroke(r.strokeWidth);
    grow(n(r.x), n(r.y));
    grow(n(r.x) + n(r.w), n(r.y) + n(r.h));
  }
  for (const c of scene.circles || []) {
    stroke(c.strokeWidth);
    grow(n(c.x) - n(c.r), n(c.y) - n(c.r));
    grow(n(c.x) + n(c.r), n(c.y) + n(c.r));
  }
  for (const p of scene.paths || []) {
    stroke(p.strokeWidth);
    for (const pt of p.pts || []) grow(n(pt.x), n(pt.y));
  }
  for (const tx of scene.texts || []) {
    const w = textWidth(tx.text, tx.size || 12, tx.bold);
    const h = (tx.size || 12) * 0.8;
    if (tx.stroke) stroke(tx.strokeWidth); // halo widens the glyph box
    const x0 = tx.anchor === 'middle' ? n(tx.x) - w / 2 : tx.anchor === 'end' ? n(tx.x) - w : n(tx.x);
    grow(x0, n(tx.y) - h);
    grow(x0 + w, n(tx.y) + h * 0.25);
  }
  const b = bb.box();
  if (!b) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  const pad = maxStroke / 2;
  const minX = b.x0 - pad;
  const minY = b.y0 - pad;
  const maxX = b.x1 + pad;
  const maxY = b.y1 + pad;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Build a one-page PDF. Returns a Uint8Array ready for a Blob download.
export function buildPDF(scene = {}) {
  const margin = Math.max(0, n(scene.margin) || 20);
  const bbox = sceneBounds(scene);
  const pageW = bbox.w + margin * 2;
  const pageH = bbox.h + margin * 2;
  const t = makeTransform(bbox, margin);

  const ops = [];
  // page background, so the PDF matches the canvas rather than being transparent
  ops.push(`${colorOps(scene.background)} rg 0 0 ${f(pageW)} ${f(pageH)} re f `);

  // paint one filled/stroked shape: colour ops, then the path, then the
  // paint operator (fill+stroke / fill / stroke)
  const emitShape = (shape, path) => {
    if (shape.fill) ops.push(`${colorOps(shape.fill)} rg `);
    if (shape.stroke) ops.push(`${colorOps(shape.stroke)} RG ${f(shape.strokeWidth || 1)} w `);
    ops.push(path);
    ops.push(shape.fill && shape.stroke ? 'B ' : shape.fill ? 'f ' : 'S ');
  };

  for (const r of scene.rects || []) {
    emitShape(r, rectPath(t, n(r.x), n(r.y), n(r.w), n(r.h), r.r));
  }

  for (const c of scene.circles || []) {
    emitShape(c, circlePath(t, n(c.x), n(c.y), n(c.r)));
  }

  for (const p of scene.paths || []) {
    if (!p.pts || p.pts.length < 2) continue;
    ops.push(`${colorOps(p.stroke || '#000')} RG ${f(p.strokeWidth || 1)} w `);
    // dash pattern (e.g. [6, 4]) — the `d` operator takes a PDF ARRAY plus a
    // phase number; always set so a previous path's dash never leaks
    ops.push(`[${(Array.isArray(p.dash) ? p.dash : []).map(f).join(' ')}] 0 d `);
    ops.push(`${t.x(p.pts[0].x)} ${t.y(p.pts[0].y)} m `);
    for (let i = 1; i < p.pts.length; i++) ops.push(`${t.x(p.pts[i].x)} ${t.y(p.pts[i].y)} l `);
    ops.push('S ');
    if (p.arrow) ops.push(`${colorOps(p.stroke || '#000')} rg ` + arrowPath(t, p.pts) + 'f ');
  }

  for (const tx of scene.texts || []) {
    const size = n(tx.size) || 12;
    const w = textWidth(tx.text, size, tx.bold);
    const x = tx.anchor === 'middle' ? n(tx.x) - w / 2 : tx.anchor === 'end' ? n(tx.x) - w : n(tx.x);
    const font = `/${tx.bold ? 'F2' : 'F1'} ${f(size)} Tf `;
    const pos = `${t.x(x)} ${t.y(n(tx.y))} Td `;
    const str = `(${encodeText(tx.text)})`;
    if (tx.stroke) {
      // Emulate SVG `paint-order: stroke`: PDF render mode 2 strokes OVER the
      // fill (which eats thin glyphs), so draw two passes instead — halo
      // stroke-only (Tr 1) first, then the fill (Tr 0) on top. Line width /
      // join / dash are graphics-state operators and must stay outside BT.
      ops.push(`${colorOps(tx.stroke)} RG ${f(tx.strokeWidth || 3)} w 1 j [] 0 d `);
      ops.push('BT 1 Tr ' + font + pos + str + ' Tj ET ');
      ops.push('BT 0 Tr ' + `${colorOps(tx.fill || '#000')} rg ` + font + pos + str + ' Tj ET ');
    } else {
      ops.push('BT 0 Tr ' + `${colorOps(tx.fill || '#000')} rg ` + font + pos + str + ' Tj ET ');
    }
  }

  const content = ops.join('');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pageW)} ${f(pageH)}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  // Every string here is already WinAnsi (codes 0..255), so length == bytes.
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — createGraph() wires the model, renderer, and interactions.
// ═══════════════════════════════════════════════════════════════════════════
export function createGraph(container) {
  if (!container) throw new Error('createGraph: container element required');
  container.classList.add('ng-graph');

  let model = createModel();
  const renderer = new Renderer(container);
  // `dragging` skips the obstacle-avoiding router for auto-routed edges while a
  // node/group drag is in progress (see #renderEdge); the final render after a
  // drop routes everything properly.
  const render = (dragging = false) =>
    renderer.render(model, interactions.getSelectedEdge(), interactions.getSelectedNodes(), interactions.getSelectedGroups(), dragging);
  // Undo/redo snapshots the whole graph. Restoring replaces the model's arrays
  // in place (the model object itself is shared with the renderer and every
  // interaction closure), so the only thing to do afterwards is drop stale
  // selection state — the restored ids may no longer exist — and repaint.
  const history = createHistory(model, () => {
    interactions.clearSelection();
    render();
  });
  const interactions = setupInteractions(model, renderer, render, history);

  // Wrap a single atomic mutation so it becomes one undo step — but only if it
  // actually changes something (begin/end compares before vs. after, so e.g.
  // setNodeLabel to the same text records nothing).
  const withHistory = (fn) => {
    const pre = history.begin();
    const result = fn();
    history.end(pre);
    return result;
  };

  // Waypoints are stored in absolute graph coords, so any API that moves a
  // port (moveNode, add/removeParam) must translate the waypoint runs glued to
  // it — otherwise the route detaches and the renderer bridges the gap by
  // spawning extra segments. Delegates to the model's followWaypoints.
  const followPorts = (nodeIds, mutate) => {
    const moved = new Set(nodeIds);
    return followWaypoints(model, (edge) => moved.has(edge.source.node) || moved.has(edge.target.node), mutate);
  };

  // Public-method factory: run a MODEL function as one undo step, re-render,
  // and return its result. `follow: true` marks methods that move a node's
  // ports (the node id is the first argument) so glued waypoint runs track them.
  const api = (fn, { follow = false } = {}) => (...args) => {
    const mutate = () => fn(model, ...args);
    const result = withHistory(follow ? () => followPorts([args[0]], mutate) : mutate);
    render();
    return result;
  };

  return {
    // --- nodes ---
    addNode: api(addNode),
    removeNode: api(removeNode),
    setNodeLabel: api(setNodeLabel),
    moveNode: api(moveNode, { follow: true }),
    setNodeWidth: api(setNodeWidth, { follow: true }),
    setNodeColor: api(setNodeColor),

    // --- groups ---
    // A labelled rectangle drawn underneath the nodes. Membership is geometric:
    // a node belongs to the group while its centre is inside the box, so moving
    // a group carries its members along (relatively) and resizing reveals or
    // hides nodes without ever deleting them.
    addGroup: api(addGroup),
    removeGroup: api(removeGroup),
    setGroupLabel: api(setGroupLabel),
    setGroupColor: api(setGroupColor),
    // Fill on/off. With fill off the group is an outline only: transparent
    // interior, and clicks inside it pass through to the canvas (only the
    // border selects/moves the group).
    setGroupFill: api(setGroupFill),
    setGroupRect: api(setGroupRect),
    // Move the group to (x, y) and translate every member node — and every
    // nested group and its members — by the same delta.
    moveGroup(id, x, y) {
      const group = findGroup(model, id);
      if (!group) return;
      const { groupIds, nodeIds } = groupClosure(model, new Set([id]));
      withHistory(() => moveGroupsBy(model, groupIds, nodeIds, x - group.x, y - group.y));
      render();
    },
    // Node ids currently inside the given group (or an empty array).
    groupMembers(id) {
      const group = findGroup(model, id);
      return group ? nodesInGroup(model, group) : [];
    },
    // --- group boundary ports ---
    // A group's ports live on its border and act as one interface for the
    // whole box (e.g. route one output into a load-balancing group). Each port
    // stores a side and a relative position t (0..1), so it slides with the
    // border when the group is resized. Dragging an edge onto a group's border
    // creates one automatically; these are the programmatic equivalents.
    addGroupPort: api(addGroupPort),
    removeGroupPort: api(removeGroupPort),
    getGroupPorts(groupId) {
      const group = findGroup(model, groupId);
      return group ? group.ports || [] : [];
    },

    // --- parameters ---
    addParam: api(addParam, { follow: true }),
    removeParam: api(removeParam, { follow: true }),
    // Reorder a param row (dragging the row in the UI does the same). The param
    // keeps its id, so edges follow; only the row — and its port's y — moves.
    moveParam: api(moveParam, { follow: true }),

    // --- edges ---
    connect: api(connect),
    removeEdge: api(removeEdge),
    setEdgeLabel: api(setEdgeLabel),
    setEdgeColor: api(setEdgeColor),
    setEdgeLabelT: api(setEdgeLabelT),

    // --- undo / redo ---
    // Step back/forward through the last HISTORY_LIMIT changes (UI gestures and
    // API calls alike). Returns false when there is nothing to undo/redo.
    undo() {
      return history.undo();
    },
    redo() {
      return history.redo();
    },

    // --- JSON ---
    exportJSON() {
      return exportJSON(model);
    },
    importJSON(text) {
      const pre = history.begin(); // snapshot before mutating; a failed import
      applyImportJSON(model, text); // validates first and throws untouched
      history.end(pre);
      render();
    },

    // The whole graph (or an explicit subset of node ids) as a one-page vector
    // PDF (Uint8Array) with at least 20px of clear space around it.
    exportPDF(nodeIds) {
      const ids = nodeIds == null
        ? new Set(model.nodes.map((nd) => nd.id))
        : nodeIds instanceof Set
          ? nodeIds
          : new Set(nodeIds);
      if (!ids.size) throw new Error('exportPDF: no nodes to export');
      return buildPDF(renderer.buildScene(model, ids));
    },

    // --- theme ---
    setDark(on) {
      container.classList.toggle('dark', on !== false);
    },

    // --- viewport ---
    get view() {
      return interactions.view;
    },
    panBy(dx, dy) {
      interactions.view.x += dx;
      interactions.view.y += dy;
      renderer.setView(interactions.view);
    },
    zoomTo(scale) {
      const r = renderer.svg.getBoundingClientRect();
      interactions.zoomAt(r.width / 2, r.height / 2, scale);
    },
    // Zoom so all content (nodes, groups, routed edges) fits the canvas,
    // centred with clear space around it.
    fitView() {
      interactions.fitView();
    },
    // Reset the viewport to the origin at 100%.
    resetView() {
      interactions.resetView();
    },

    getNodes: () => model.nodes,
    getEdges: () => model.edges,
    getGroups: () => model.groups || [],

    // add an item to the context menu (opens on double-click of empty canvas)
    addContextMenuItem(label, action) {
      interactions.addContextMenuItem(label, action);
    },

    destroy() {
      interactions.destroy();
      renderer.svg.remove();
      container.classList.remove('ng-graph', 'dark');
    },
  };
}
