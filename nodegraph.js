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
//   { nodes: [{ id, label, x, y, params: [{ id, name }] }],
//     edges: [{ id, source: { node, param }, target: { node, param },
//              label, labelT, points: [{ x, y }] }] }
// Every parameter has both an input port (left) and an output port (right).
// Edges are orthogonal (90°) polylines: source port → corners → target port.
// An empty `points` array means the renderer picks a default Z-route.
// `label` is the edge's single label; `labelT` (0..1) is where it sits along it.

let seq = 0;
const uid = (prefix) => `${prefix}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createModel() {
  return { nodes: [], edges: [], groups: [] };
}

export function findNode(model, id) {
  return model.nodes.find((n) => n.id === id);
}

function findParam(node, paramId) {
  return node && node.params.find((p) => p.id === paramId);
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
  if (!node) return;
  const c = typeof color === 'string' ? color.trim().toLowerCase() : null;
  if (!c) {
    delete node.color;
    return;
  }
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c)) node.color = c;
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

// --- edges ---

// source/target are refs: { node: nodeId, param: paramId }
export function connect(model, source, target) {
  const sp = findParam(findNode(model, source.node), source.param);
  const tp = findParam(findNode(model, target.node), target.param);
  if (!sp || !tp) throw new Error('Unknown port');
  if (source.node === target.node && source.param === target.param) {
    throw new Error('Cannot connect a port to itself');
  }
  const dup = model.edges.some(
    (e) =>
      e.source.node === source.node &&
      e.source.param === source.param &&
      e.target.node === target.node &&
      e.target.param === target.param
  );
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
  const edge = model.edges.find((e) => e.id === id);
  if (edge) edge.label = label;
}

// Set where the label sits along the edge, as a fraction of total length (0..1).
export function setEdgeLabelT(model, id, t) {
  const edge = model.edges.find((e) => e.id === id);
  if (edge) edge.labelT = Math.min(1, Math.max(0, t));
}

// Replace an edge's manual waypoints (graph coordinates).
// An empty array restores the automatic route.
export function setEdgePoints(model, id, points) {
  const edge = model.edges.find((e) => e.id === id);
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
export function removeGroup(model, id) {
  if (!model.groups) return;
  model.groups = model.groups.filter((g) => g.id !== id);
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
  if (!group) return;
  const c = typeof color === 'string' ? color.trim().toLowerCase() : null;
  if (!c) {
    delete group.color;
    return;
  }
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c)) group.color = c;
}

// Set a group's rectangle (graph coords). Width/height are floored at 1.
export function setGroupRect(model, id, { x, y, w, h } = {}) {
  const group = findGroup(model, id);
  if (!group) return;
  if (Number.isFinite(Number(x))) group.x = Number(x);
  if (Number.isFinite(Number(y))) group.y = Number(y);
  if (Number.isFinite(Number(w))) group.w = Math.max(1, Number(w));
  if (Number.isFinite(Number(h))) group.h = Math.max(1, Number(h));
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
      ...(typeof n.color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(n.color.trim())
        ? { color: n.color.trim().toLowerCase() }
        : {}),
    });
  }
  const paramIds = new Set(model.nodes.flatMap((n) => n.params.map((p) => p.id)));
  for (const e of data.edges) {
    if (!e.source || !e.target || !paramIds.has(e.source.param) || !paramIds.has(e.target.param)) {
      throw new Error('Invalid graph JSON: edge references unknown port');
    }
    model.edges.push({
      id: e.id ?? uid('e'),
      source: { ...e.source },
      target: { ...e.target },
      label: e.label ?? '',
      labelT: Number.isFinite(Number(e.labelT)) ? Math.min(1, Math.max(0, Number(e.labelT))) : 0.5,
      points: Array.isArray(e.points) ? e.points.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [],
    });
  }
  // groups are optional (older files have none); malformed entries are skipped
  for (const g of Array.isArray(data.groups) ? data.groups : []) {
    if (!g || !Number.isFinite(Number(g.w)) || !Number.isFinite(Number(g.h))) continue;
    model.groups.push({
      id: g.id ?? uid('g'),
      label: g.label ?? 'Group',
      x: Number(g.x) || 0,
      y: Number(g.y) || 0,
      w: Math.max(1, Number(g.w)),
      h: Math.max(1, Number(g.h)),
      ...(typeof g.color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(g.color.trim())
        ? { color: g.color.trim().toLowerCase() }
        : {}),
    });
  }
  return model;
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
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (target <= d || i === pts.length - 1) {
      const u = d ? Math.min(1, Math.max(0, target / d)) : 0;
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
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
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
    this.nodesLayer = el('g', { class: 'ng-nodes' }, this.viewport);
    // visible edges drawn ABOVE the nodes so a connector is never hidden by a
    // node's outline; they are pointer-events:none (see .ng-edge in the CSS),
    // clicks land on the hit paths in edgesHitLayer below
    this.edgesLayer = el('g', { class: 'ng-edges' }, this.viewport);
    // edge labels + segment grips, drawn above everything so they stay grabbable
    this.overlayLayer = el('g', { class: 'ng-overlay' }, this.viewport);
    this.tempPath = el('path', { class: 'ng-edge ng-temp', style: 'display:none' }, this.viewport);
  }

  setView({ x, y, scale }) {
    this.viewport.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
  }

  render(model, selectedEdgeId, selectedNodeIds, selectedGroupIds) {
    const selNodes = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds ? [selectedNodeIds] : []);
    const selGroups = selectedGroupIds instanceof Set ? selectedGroupIds : new Set(selectedGroupIds ? [selectedGroupIds] : []);
    this.marqueeLayer.textContent = '';
    this.groupsLayer.textContent = '';
    this.edgesHitLayer.textContent = '';
    this.segHitLayer.textContent = '';
    this.nodesLayer.textContent = '';
    this.edgesLayer.textContent = '';
    this.overlayLayer.textContent = '';
    for (const group of model.groups || []) this.#renderGroup(group, selGroups.has(group.id));
    const obstacles = nodeRects(model);
    for (const edge of model.edges) this.#renderEdge(edge, model, edge.id === selectedEdgeId, obstacles);
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
    };

    // PDF has no alpha, so a translucent group fill is composited over the page
    // background into an opaque equivalent before it is written.
    const toRgb = (v) => {
      const s = String(v || '').trim();
      let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i.exec(s);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
      m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
      if (m) {
        const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
      }
      return { r: 0, g: 0, b: 0, a: 1 };
    };
    const mixOn = (bg, fg, alpha) => {
      const b = toRgb(bg), c = toRgb(fg);
      const a = alpha == null ? c.a : alpha;
      const ch = (x, y) => Math.round(x * (1 - a) + y * a);
      const hex = (v) => v.toString(16).padStart(2, '0');
      return `#${hex(ch(b.r, c.r))}${hex(ch(b.g, c.g))}${hex(ch(b.b, c.b))}`;
    };

    const scene = { margin: 20, background: colors.bg, rects: [], circles: [], paths: [], texts: [] };
    const nodes = model.nodes.filter((nd) => ids.has(nd.id));
    const edges = model.edges.filter((e) => ids.has(e.source.node) && ids.has(e.target.node));

    // groups first — they render underneath the nodes. A group is included when
    // it contains at least one exported node (centre-based membership), so a
    // subset export still frames its members without stray empty boxes.
    for (const group of model.groups || []) {
      if (!nodesInGroup(model, group).some((nid) => ids.has(nid))) continue;
      const accent = normalizeColor(group.color);
      const fill = accent ? mixOn(colors.bg, accent, 0.1) : mixOn(colors.bg, colors.groupFill);
      const border = accent || colors.groupBorder;
      // outer border + inset inner line = the solid double border (see CSS)
      scene.rects.push({ x: group.x, y: group.y, w: group.w, h: group.h, r: 8, fill, stroke: border, strokeWidth: 1.5 });
      scene.rects.push({ x: group.x + 3, y: group.y + 3, w: Math.max(0, group.w - 6), h: Math.max(0, group.h - 6), r: 5, stroke: border, strokeWidth: 1 });
      scene.texts.push({ x: group.x + 10, y: group.y + GROUP_LABEL_H - 7, text: group.label || 'Group', size: 12, bold: true, fill: colors.muted });
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
      const sn = model.nodes.find((nd) => nd.id === edge.source.node);
      const tn = model.nodes.find((nd) => nd.id === edge.target.node);
      const sp = sn && sn.params.find((p) => p.id === edge.source.param);
      const tp = tn && tn.params.find((p) => p.id === edge.target.param);
      if (!sn || !tn || !sp || !tp) continue;
      const pts = edgePoints(portPos(sn, sp, 'out'), portPos(tn, tp, 'in'), edge.points, nodeRects(model));
      scene.paths.push({ pts, stroke: colors.edge, strokeWidth: 2, dash: EDGE_DASH });
      if (edge.label) {
        const pos = polylinePointAt(pts, edge.labelT);
        // halo matches the on-screen `paint-order: stroke` outline, so the
        // label stays readable where it crosses the (dashed) edge
        scene.texts.push({ x: pos.x, y: pos.y - 6, text: edge.label, size: 10, fill: colors.text, anchor: 'middle', stroke: colors.bg, strokeWidth: 3 });
      }
    }
    return scene;
  }

  #renderEdge(edge, model, selected, obstacles = null) {
    const sn = model.nodes.find((n) => n.id === edge.source.node);
    const tn = model.nodes.find((n) => n.id === edge.target.node);
    const sp = sn && sn.params.find((p) => p.id === edge.source.param);
    const tp = tn && tn.params.find((p) => p.id === edge.target.param);
    if (!sn || !tn || !sp || !tp) return; // defensive; model keeps edges in sync

    const a = portPos(sn, sp, 'out');
    const b = portPos(tn, tp, 'in');
    const pts = edgePoints(a, b, edge.points, obstacles);
    const d = polylinePath(pts);
    // invisible wide path in the hit layer (below the nodes) so thin edges are
    // easy to click without stealing clicks from nodes/ports they pass over
    el('path', { d, class: 'ng-edge-hit', 'data-edge': edge.id }, this.edgesHitLayer);
    el('path', {
      d, class: 'ng-edge' + (selected ? ' ng-selected' : ''),
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
    const accent = normalizeColor(group.color);
    const style = accent
      ? `--ng-group-fill:${hexToRgba(accent, 0.10)};--ng-group-border:${accent}`
      : undefined;
    const g = el('g', { class: 'ng-group' + (selected ? ' ng-selected' : ''), style, 'data-group': group.id }, this.groupsLayer);
    // The body rect carries the fill + outer border and is the drag handle
    // (data-group). It lives in the bottom layer, so nodes/edges drawn above
    // still win their own clicks and only the group's empty area selects it.
    el('rect', {
      x: group.x, y: group.y, width: group.w, height: group.h, rx: 8,
      class: 'ng-group-rect', 'data-group': group.id,
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
    }, g);
    label.textContent = group.label || 'Group';
    if (selected) {
      el('rect', {
        x: group.x, y: group.y, width: group.w, height: group.h, rx: 8,
        class: 'ng-group-outline', 'pointer-events': 'none',
      }, this.overlayLayer);
      // resize grip, bottom-right corner (drag to resize; snaps to grid)
      el('rect', {
        x: group.x + group.w - 4, y: group.y + group.h - 4, width: 8, height: 8, rx: 2,
        class: 'ng-group-resize', 'data-resize-group': group.id, 'data-group': group.id,
      }, this.overlayLayer);
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
      const row = el('g', { class: 'ng-param', 'data-param': param.id }, g);
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

function setupInteractions(model, renderer, render) {
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

  const editNode = (node) => {
    const p = graphToScreen(node.x + 6, node.y + 2);
    openEditor({ sx: p.x, sy: p.y, w: (180 - 56) * view.scale, text: node.label, onCommit: (v) => (node.label = v.trim() || node.label) });
  };

  const editParam = (node, param) => {
    const p = graphToScreen(node.x + 10, node.y + 28 + node.params.indexOf(param) * 24 + 1);
    openEditor({ sx: p.x, sy: p.y, w: (180 - 40) * view.scale, text: param.name, onCommit: (v) => (param.name = v.trim() || param.name) });
  };

  const editGroup = (group) => {
    const p = graphToScreen(group.x + 8, group.y + 2);
    openEditor({
      sx: p.x,
      sy: p.y,
      w: Math.max(80, Math.min(group.w, 240)) * view.scale,
      text: group.label || '',
      onCommit: (v) => setGroupLabel(model, group.id, v.trim() || 'Group'),
    });
  };

  // Translate a group by (dx, dy) and carry every node whose centre lies inside
  // it. Nodes snap to the grid individually (like a normal node drag), so the
  // group's own position is the snapped top-left and members keep their offset.
  // Waypoints glued to a moved node's port follow it (see adjustPointsForMove).
  const moveGroupBy = (group, dx, dy) => {
    const ids = nodesInGroup(model, group);
    const movedSet = new Set(ids);
    const prevEnds = new Map();
    for (const edge of model.edges) {
      if (!edge.points.length) continue;
      if (!movedSet.has(edge.source.node) && !movedSet.has(edge.target.node)) continue;
      const ends = edgeEnds(edge);
      if (ends) prevEnds.set(edge.id, { a: { ...ends.a }, b: { ...ends.b } });
    }
    group.x = snapToGrid(group.x + dx);
    group.y = snapToGrid(group.y + dy);
    for (const id of ids) {
      const node = model.nodes.find((n) => n.id === id);
      if (node) {
        node.x = snapToGrid(node.x + dx);
        node.y = snapToGrid(node.y + dy);
      }
    }
    for (const edge of model.edges) {
      const prev = prevEnds.get(edge.id);
      if (!prev) continue;
      const ends = edgeEnds(edge);
      if (!ends) continue;
      setEdgePoints(model, edge.id, adjustPointsForMove(edge.points, ends.a, ends.b, prev.a, prev.b));
    }
  };

  // Port endpoints (graph coords) for an edge, or null if a node/param is gone.
  const edgeEnds = (edge) => {
    const sn = model.nodes.find((n) => n.id === edge.source.node);
    const sp = sn && sn.params.find((p) => p.id === edge.source.param);
    const tn = model.nodes.find((n) => n.id === edge.target.node);
    const tp = tn && tn.params.find((p) => p.id === edge.target.param);
    return sn && sp && tn && tp ? { a: portPos(sn, sp, 'out'), b: portPos(tn, tp, 'in') } : null;
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
      const ends = edgeEnds(edge);
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
      onCommit: (v) => setEdgeLabel(model, edge.id, v.trim()),
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
    if (selEdge) removeEdge(model, selEdge);
    for (const id of selNodes) removeNode(model, id);
    for (const id of selGroups) removeGroup(model, id);
    selNodes.clear();
    selGroups.clear();
    selEdge = null;
    render();
  };

  const exportJson = async () => {
    const json = exportJSON(model);
    const name = 'graph.json';
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        return toast('Graph saved');
      }
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      toast('Graph downloaded');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
      toast('Save failed');
    }
  };

  const importJson = async () => {
    try {
      let text;
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        text = await (await handle.getFile()).text();
      } else {
        text = await new Promise((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json';
          input.onchange = () => (input.files[0] ? input.files[0].text().then(resolve) : reject(new Error('AbortError')));
          input.click();
        });
      }
      applyImportJSON(model, text);
      selNodes.clear();
      selEdge = null;
      render();
      toast('Graph imported');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
      toast('Invalid graph file');
    }
  };

  // Export the whole graph as a one-page vector PDF with ≥20px of clear space
  // around it. Always available: double-clicking empty canvas clears the
  // selection before the menu opens, so a selection-only export would be
  // unreachable from here.
  const exportPdf = async () => {
    if (!model.nodes.length) return toast('Nothing to export');
    try {
      const bytes = buildPDF(renderer.buildScene(model, model.nodes.map((n) => n.id)));
      const name = 'graph.pdf';
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return toast('PDF saved');
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      toast('PDF downloaded');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
      toast('PDF export failed');
    }
  };

  const openMenu = (clientX, clientY, graphPoint) => {
    closeMenu();
    closeEditor();
    const cr = container.getBoundingClientRect();
    const items = [
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
    ];
    if (selNodes.size || selEdge || selGroups.size) {
      const n = selNodes.size + (selEdge ? 1 : 0) + selGroups.size;
      items.push({ label: `Delete selection (${n})`, danger: true, action: deleteSelection });
    }
    // rename a selected group
    if (selGroups.size === 1) {
      const gid = [...selGroups][0];
      const group = (model.groups || []).find((g) => g.id === gid);
      if (group) items.push({ label: 'Rename group', action: () => editGroup(group) });
    }
    // tint the selected group(s) — same palette as nodes; the colour washes
    // the group's fill and paints its double border
    if (selGroups.size) {
      const gids = [...selGroups];
      const setGroupColorAll = (c) => {
        for (const id of gids) setGroupColor(model, id, c);
        render();
      };
      items.push({
        label: 'Group colour',
        submenu: [
          ...NODE_COLORS.map((c) => ({
            label: c.name,
            swatch: c.value,
            action: () => setGroupColorAll(c.value),
          })),
          { label: 'Default', action: () => setGroupColorAll(null) },
        ],
      });
    }
    // colour the selected node(s) — shown whenever at least one node is selected
    if (selNodes.size) {
      const ids = [...selNodes];
      const setColor = (c) => {
        for (const id of ids) setNodeColor(model, id, c);
        render();
      };
      items.push({
        label: 'Node colour',
        submenu: [
          ...NODE_COLORS.map((c) => ({
            label: c.name,
            swatch: c.value,
            action: () => setColor(c.value),
          })),
          { label: 'Default', action: () => setColor(null) },
        ],
      });
    }
    items.push(
      {
        label: 'Export / Import',
        submenu: [
          { label: 'Export as PDF…', action: exportPdf },
          { label: 'Export JSON…', action: exportJson },
          { label: 'Import JSON…', action: importJson },
        ],
      },
      {
        label: 'Fit view',
        action: () => {
          view.x = 0;
          view.y = 0;
          view.scale = 1;
          renderer.setView(view);
        },
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
          btn.addEventListener('mouseenter', () => {
            // flip to the left when the submenu would spill outside the canvas
            sub.classList.remove('ng-menu-submenu-left');
            sub.style.display = 'flex';
            const sr = sub.getBoundingClientRect();
            if (sr.right > cr.right - 4) sub.classList.add('ng-menu-submenu-left');
          });
          wrap.addEventListener('mouseleave', () => {
            if (!wrap.classList.contains('ng-open')) sub.style.display = '';
          });
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            wrap.classList.toggle('ng-open');
            sub.style.display = wrap.classList.contains('ng-open') ? 'flex' : '';
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

    // group resize grip (bottom-right corner of a selected group) → resize it.
    // Checked early: the grip lives in the top overlay layer, above the nodes.
    const gripG = closest(e, 'data-resize-group');
    if (gripG) {
      const group = (model.groups || []).find((g) => g.id === gripG.dataset.resizeGroup);
      if (!group) return;
      const p = screenToGraph(e.clientX, e.clientY);
      drag = { kind: 'resize-group', id: group.id, baseW: group.w, baseH: group.h, ox: p.x, oy: p.y };
      return;
    }

    // edge label → an empty label (the "+ label" hint) starts a new label with a
    // single click; an existing label drags along the edge, double-click edits it
    const lbl = closest(e, 'data-edgelabel');
    if (lbl) {
      const edge = model.edges.find((ed) => ed.id === lbl.dataset.edgelabel);
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
      drag = { kind: 'label', edgeId: edge.id };
      return;
    }

    // segment handle of the selected edge → slide that straight run
    const seg = closest(e, 'data-seg');
    if (seg) {
      const edge = model.edges.find((ed) => ed.id === seg.dataset.edge);
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
      };
      return;
    }

    const port = closest(e, 'data-port');
    if (port) {
      const node = model.nodes.find((n) => n.id === port.dataset.node);
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

    const nodeG = closest(e, 'data-node');
    if (nodeG) {
      const node = model.nodes.find((n) => n.id === nodeG.dataset.node);
      if (!node) return;
      closeMenu();
      const p = screenToGraph(e.clientX, e.clientY);

      // width handle on the right edge of a selected node → resize it
      if (closest(e, 'data-resize')) {
        drag = { kind: 'resize', id: node.id, base: nodeWidth(node), ox: p.x };
        return;
      }

      if (e.shiftKey) {
        // shift-click toggles membership; a drag afterwards moves the group
        if (selNodes.has(node.id)) selNodes.delete(node.id);
        else selNodes.add(node.id);
        selEdge = null;
        render();
        drag = { kind: 'maybe-node', id: node.id, ox: p.x, oy: p.y };
        return;
      }
      if (!selNodes.has(node.id)) select(node.id, null);
      else closeEditor();
      // dragging one node of a multi-selection moves the whole selection
      const ids = [...selNodes];
      drag = {
        kind: 'node',
        ids,
        dx: p.x,
        dy: p.y,
        origins: new Map(ids.map((id) => {
          const n = model.nodes.find((m) => m.id === id);
          return [id, { x: n.x, y: n.y }];
        })),
      };
      return;
    }

    const edgeEl = closest(e, 'data-edge');
    if (edgeEl) {
      closeMenu();
      select(null, edgeEl.dataset.edge);
      return;
    }

    // group box body (bottom layer) → select + drag it. Reached only when the
    // pointer is over the group's empty area: a node, port, edge or handle above
    // it would have matched first. Dragging moves the group and every node whose
    // centre is inside it.
    const groupG = closest(e, 'data-group');
    if (groupG) {
      const group = (model.groups || []).find((g) => g.id === groupG.dataset.group);
      if (!group) return;
      closeMenu();
      const p = screenToGraph(e.clientX, e.clientY);
      if (e.shiftKey) {
        if (selGroups.has(group.id)) selGroups.delete(group.id);
        else selGroups.add(group.id);
        selEdge = null;
        render();
        drag = { kind: 'maybe-group', id: group.id, ox: p.x, oy: p.y };
        return;
      }
      if (!selGroups.has(group.id)) select(null, null, group.id);
      else closeEditor();
      drag = { kind: 'group', id: group.id, ox: p.x, oy: p.y };
      return;
    }

    // empty canvas → clear selection and start a rectangular (marquee) selection
    closeEditor();
    closeMenu();
    const base = e.shiftKey ? new Set(selNodes) : new Set();
    if (!e.shiftKey && (selNodes.size || selEdge || selGroups.size)) select(null, null);
    const p = screenToGraph(e.clientX, e.clientY);
    drag = { kind: 'marquee', ox: p.x, oy: p.y, shift: e.shiftKey, base };
  });

  const rectHits = (x, y, w, h, node) => {
    const nh = nodeHeight(node);
    return x < node.x + nodeWidth(node) && x + w > node.x && y < node.y + nh && y + h > node.y;
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      view.x = drag.vx + (e.clientX - drag.sx);
      view.y = drag.vy + (e.clientY - drag.sy);
      renderer.setView(view);
    } else if (drag.kind === 'maybe-node') {
      const p = screenToGraph(e.clientX, e.clientY);
      if (Math.hypot(p.x - drag.ox, p.y - drag.oy) < 3) return;
      if (!selNodes.has(drag.id)) selNodes.add(drag.id);
      startNodeDrag(p);
    } else if (drag.kind === 'maybe-group') {
      const p = screenToGraph(e.clientX, e.clientY);
      if (Math.hypot(p.x - drag.ox, p.y - drag.oy) < 3) return;
      if (!selGroups.has(drag.id)) selGroups.add(drag.id);
      drag = { kind: 'group', id: drag.id, ox: p.x, oy: p.y };
    } else if (drag.kind === 'group') {
      const group = (model.groups || []).find((g) => g.id === drag.id);
      if (!group) return;
      const p = screenToGraph(e.clientX, e.clientY);
      // move the group by the snapped delta so both it and its members land on
      // grid lines (recomputed from the group's current, already-snapped origin)
      const dx = snapToGrid(p.x - drag.ox);
      const dy = snapToGrid(p.y - drag.oy);
      if (dx || dy) {
        moveGroupBy(group, dx, dy);
        drag.ox += dx;
        drag.oy += dy;
        render();
      }
    } else if (drag.kind === 'resize-group') {
      const group = (model.groups || []).find((g) => g.id === drag.id);
      if (!group) return;
      const p = screenToGraph(e.clientX, e.clientY);
      const w = Math.max(GROUP_MIN, snapToGrid(drag.baseW + (p.x - drag.ox)));
      const h = Math.max(GROUP_MIN, snapToGrid(drag.baseH + (p.y - drag.oy)));
      setGroupRect(model, group.id, { w, h });
      render();
    } else if (drag.kind === 'node') {
      const p = screenToGraph(e.clientX, e.clientY);
      // nodes snap to the background grid: each node's own position lands on a
      // grid line (not just the cursor delta), so off-grid nodes snap in too
      const sx = p.x - drag.dx;
      const sy = p.y - drag.dy;
      // Waypoints are absolute, so remember where the ports of any connected
      // edge were before this step — afterwards the waypoint runs adjacent to
      // those ports translate with them (otherwise moving a node detaches the
      // route and the renderer bridges the gap by spawning extra segments).
      const moved = new Set(drag.ids);
      const prevEnds = new Map();
      for (const edge of model.edges) {
        if (!moved.has(edge.source.node) && !moved.has(edge.target.node)) continue;
        const ends = edgeEnds(edge);
        if (ends && edge.points.length) prevEnds.set(edge.id, { a: { ...ends.a }, b: { ...ends.b } });
      }
      for (const id of drag.ids) {
        const node = model.nodes.find((n) => n.id === id);
        const o = drag.origins.get(id);
        if (node && o) {
          node.x = snapToGrid(o.x + sx);
          node.y = snapToGrid(o.y + sy);
        }
      }
      for (const edge of model.edges) {
        const prev = prevEnds.get(edge.id);
        if (!prev) continue;
        const ends = edgeEnds(edge);
        if (!ends) continue;
        const next = adjustPointsForMove(edge.points, ends.a, ends.b, prev.a, prev.b);
        setEdgePoints(model, edge.id, next);
      }
      render();
    } else if (drag.kind === 'resize') {
      const node = model.nodes.find((n) => n.id === drag.id);
      if (!node) return;
      const p = screenToGraph(e.clientX, e.clientY);
      // the new width snaps to the grid so the right edge stays on a grid line
      const w = snapToGrid(drag.base + (p.x - drag.ox));
      if (nodeWidth(node) !== w) {
        setNodeWidth(model, node.id, w);
        render();
      }
    } else if (drag.kind === 'connect') {
      const p = screenToGraph(e.clientX, e.clientY);
      // draw the rubber band out of the port you grabbed, into the cursor
      const from = drag.originPort === 'out' ? drag.origin : p;
      const to = drag.originPort === 'out' ? p : drag.origin;
      renderer.tempPath.setAttribute('d', edgePath(from, to));
    } else if (drag.kind === 'segment') {
      const edge = model.edges.find((ed) => ed.id === drag.edgeId);
      if (!edge) return;
      const ends = edgeEnds(edge);
      if (!ends) return;
      const p = screenToGraph(e.clientX, e.clientY);
      const next = moveSegment(ends.a, ends.b, drag.base, drag.index, Math.round(p.x - drag.ox), Math.round(p.y - drag.oy), nodeRects(model), true);
      setEdgePoints(model, edge.id, next);
      render();
    } else if (drag.kind === 'label') {
      const edge = model.edges.find((ed) => ed.id === drag.edgeId);
      if (!edge) return;
      const ends = edgeEnds(edge);
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
      selNodes.clear();
      for (const id of hit) selNodes.add(id);
      selEdge = null;
      selGroups.clear();
      render();
      renderer.drawMarquee(x, y, w, h);
    }
  };

  const startNodeDrag = (p) => {
    const ids = [...selNodes];
    drag = {
      kind: 'node',
      ids,
      dx: p.x,
      dy: p.y,
      origins: new Map(ids.map((id) => {
        const n = model.nodes.find((m) => m.id === id);
        return [id, { x: n.x, y: n.y }];
      })),
    };
  };

  const onPointerUp = (e) => {
    if (!drag) return;
    svg.classList.remove('ng-panning');
    if (drag.kind === 'connect') {
      renderer.tempPath.style.display = 'none';
      // hit-test the cursor point (works regardless of event retargeting)
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const port = under && under.closest ? under.closest('[data-port]') : null;
      if (port && svg.contains(port)) {
        const target = { node: port.dataset.node, param: port.dataset.param };
        // allow dragging in either direction — orient out → in automatically
        const [src, dst] = drag.originPort === 'out' ? [drag.source, target] : [target, drag.source];
        if (port.dataset.port === drag.originPort) {
          toast('Connect an output port to an input port');
        } else {
          try {
            connect(model, src, dst);
          } catch (err) {
            toast(err.message);
          }
        }
      }
      render();
    } else if (drag.kind === 'marquee') {
      renderer.drawMarquee(0, 0, 0, 0);
      render();
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

  // right-click → context menu. Selects whatever is under the cursor first so
  // node-scoped items (Node colour, Delete) apply to it; empty canvas clears.
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const nodeG = closest(e, 'data-node');
    const edgeEl = closest(e, 'data-edge');
    const groupG = closest(e, 'data-group');
    if (nodeG) select(nodeG.dataset.node, null);
    else if (edgeEl) select(null, edgeEl.dataset.edge);
    else if (groupG) select(null, null, groupG.dataset.group);
    else if (selNodes.size || selEdge || selGroups.size) select(null, null);
    openMenu(e.clientX, e.clientY, screenToGraph(e.clientX, e.clientY));
  });

  // --- wheel zoom, anchored at cursor ---
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      view.x = px - ((px - view.x) / view.scale) * scale;
      view.y = py - ((py - view.y) / view.scale) * scale;
      view.scale = scale;
      renderer.setView(view);
      closeEditor(); // editor position would be stale after zoom
    },
    { passive: false }
  );

  // --- double click: edit edge / node / param label, or open the context menu ---
  svg.addEventListener('dblclick', (e) => {
    if (closest(e, 'data-role')) return; // buttons handled by click

    // double-click a segment handle → collapse that straight run
    const seg = closest(e, 'data-seg');
    if (seg) {
      const edge = model.edges.find((ed) => ed.id === seg.dataset.edge);
      if (edge) {
        const ends = edgeEnds(edge);
        if (ends) {
          setEdgePoints(model, edge.id, removeSegment(ends.a, ends.b, edge.points, Number(seg.dataset.seg), nodeRects(model)));
          render();
        }
      }
      return;
    }

    // double-click an edge label / hint → edit the label
    const lbl = closest(e, 'data-edgelabel');
    if (lbl) {
      const edge = model.edges.find((ed) => ed.id === lbl.dataset.edgelabel);
      if (edge) editLabel(edge, lbl);
      return;
    }

    const edgeEl = closest(e, 'data-edge');
    if (edgeEl) {
      const edge = model.edges.find((ed) => ed.id === edgeEl.dataset.edge);
      if (edge) {
        select(null, edge.id);
        editLabel(edge, null);
      }
      return;
    }

    const nodeG = closest(e, 'data-node');
    if (nodeG) {
      const node = model.nodes.find((n) => n.id === nodeG.dataset.node);
      if (!node) return;
      select(node.id, null);
      const paramG = e.target.closest('[data-param]');
      const param = paramG && node.params.find((p) => p.id === paramG.dataset.param);
      if (param) editParam(node, param);
      else editNode(node);
      return;
    }

    // double-click a group (its body or label) → rename it
    const groupG = closest(e, 'data-group');
    if (groupG) {
      const group = (model.groups || []).find((g) => g.id === groupG.dataset.group);
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
        const node = model.nodes.find((n) => n.id === nodeId);
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
    getSelectedEdge: () => selEdge,
    getSelectedNodes: () => selNodes,
    getSelectedGroups: () => selGroups,
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
  const s = String(value || '').trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const [r, g, b] = m[1].split('').map((h) => parseInt(h + h, 16) / 255);
    return `${f(r)} ${f(g)} ${f(b)}`;
  }
  m = /^#([0-9a-f]{6})/i.exec(s);
  if (m) {
    const n = m[1].slice(0, 6);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    return `${f(r)} ${f(g)} ${f(b)}`;
  }
  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  if (m) return `${f(m[1] / 255)} ${f(m[2] / 255)} ${f(m[3] / 255)}`;
  return '0 0 0';
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
  const P = (px, py) => `${t.x(px)} ${t.y(py)}`;
  const C = (a, b, c, d, e, g) =>
    `${t.x(a)} ${t.y(b)} ${t.x(c)} ${t.y(d)} ${t.x(e)} ${t.y(g)} c`;
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
  const P = (px, py) => `${t.x(px)} ${t.y(py)}`;
  const C = (a, b, c, d, e, g) =>
    `${t.x(a)} ${t.y(b)} ${t.x(c)} ${t.y(d)} ${t.x(e)} ${t.y(g)} c`;
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
  const P = (x, y) => `${t.x(x)} ${t.y(y)}`;
  return (
    `${P(b.x, b.y)} m ${P(bx + px * half, by + py * half)} l ` +
    `${P(bx - px * half, by - py * half)} l h `
  );
}

// Bounding box over every drawable (grown by half the stroke widths so the
// margin is clear space even from stroke edges), so the page can be framed
// tightly.
function sceneBounds(scene) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let maxStroke = 0;
  const grow = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
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
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  const pad = maxStroke / 2;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
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

  for (const r of scene.rects || []) {
    if (r.fill) ops.push(`${colorOps(r.fill)} rg `);
    if (r.stroke) ops.push(`${colorOps(r.stroke)} RG ${f(r.strokeWidth || 1)} w `);
    ops.push(rectPath(t, n(r.x), n(r.y), n(r.w), n(r.h), r.r));
    ops.push(r.fill && r.stroke ? 'B ' : r.fill ? 'f ' : 'S ');
  }

  for (const c of scene.circles || []) {
    if (c.fill) ops.push(`${colorOps(c.fill)} rg `);
    if (c.stroke) ops.push(`${colorOps(c.stroke)} RG ${f(c.strokeWidth || 1)} w `);
    ops.push(circlePath(t, n(c.x), n(c.y), n(c.r)));
    ops.push(c.fill && c.stroke ? 'B ' : c.fill ? 'f ' : 'S ');
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
  const render = () =>
    renderer.render(model, interactions.getSelectedEdge(), interactions.getSelectedNodes(), interactions.getSelectedGroups());
  const interactions = setupInteractions(model, renderer, render);

  // Waypoints are stored in absolute graph coords, so any API that moves a
  // port (moveNode, add/removeParam) must translate the waypoint runs glued to
  // it — otherwise the route detaches and the renderer bridges the gap by
  // spawning extra segments. Snapshot the ports of affected edges, mutate,
  // then shift.
  const portOf = (ref, side) => {
    const node = findNode(model, ref.node);
    const param = node && node.params.find((p) => p.id === ref.param);
    return node && param ? portPos(node, param, side) : null;
  };
  const followPorts = (nodeIds, mutate) => {
    const moved = new Set(nodeIds);
    const prev = new Map();
    for (const edge of model.edges) {
      if (!edge.points.length) continue;
      if (!moved.has(edge.source.node) && !moved.has(edge.target.node)) continue;
      prev.set(edge.id, { a: portOf(edge.source, 'out'), b: portOf(edge.target, 'in') });
    }
    const result = mutate();
    for (const edge of model.edges) {
      const p = prev.get(edge.id);
      if (!p || !p.a || !p.b) continue;
      const a = portOf(edge.source, 'out');
      const b = portOf(edge.target, 'in');
      if (a && b) edge.points = adjustPointsForMove(edge.points, a, b, p.a, p.b);
    }
    return result;
  };

  return {
    // --- nodes ---
    addNode(opts) {
      const node = addNode(model, opts);
      render();
      return node;
    },
    removeNode(id) {
      removeNode(model, id);
      render();
    },
    setNodeLabel(id, label) {
      setNodeLabel(model, id, label);
      render();
    },
    moveNode(id, x, y) {
      followPorts([id], () => moveNode(model, id, x, y));
      render();
    },
    setNodeWidth(id, width) {
      followPorts([id], () => setNodeWidth(model, id, width));
      render();
    },
    setNodeColor(id, color) {
      setNodeColor(model, id, color);
      render();
    },

    // --- groups ---
    // A labelled rectangle drawn underneath the nodes. Membership is geometric:
    // a node belongs to the group while its centre is inside the box, so moving
    // a group carries its members along (relatively) and resizing reveals or
    // hides nodes without ever deleting them.
    addGroup(opts) {
      const group = addGroup(model, opts);
      render();
      return group;
    },
    removeGroup(id) {
      removeGroup(model, id);
      render();
    },
    setGroupLabel(id, label) {
      setGroupLabel(model, id, label);
      render();
    },
    setGroupColor(id, color) {
      setGroupColor(model, id, color);
      render();
    },
    setGroupRect(id, rect) {
      setGroupRect(model, id, rect);
      render();
    },
    // Move the group to (x, y) and translate every member node by the same delta.
    moveGroup(id, x, y) {
      const group = findGroup(model, id);
      if (!group) return;
      const dx = x - group.x;
      const dy = y - group.y;
      const ids = nodesInGroup(model, group);
      followPorts(ids, () => {
        setGroupRect(model, id, { x, y });
        for (const nid of ids) {
          const n = findNode(model, nid);
          if (n) moveNode(model, nid, n.x + dx, n.y + dy);
        }
      });
      render();
    },
    // Node ids currently inside the given group (or an empty array).
    groupMembers(id) {
      const group = findGroup(model, id);
      return group ? nodesInGroup(model, group) : [];
    },

    // --- parameters ---
    addParam(nodeId, opts) {
      const param = followPorts([nodeId], () => addParam(model, nodeId, opts));
      render();
      return param;
    },
    removeParam(nodeId, paramId) {
      followPorts([nodeId], () => removeParam(model, nodeId, paramId));
      render();
    },

    // --- edges ---
    connect(source, target) {
      const edge = connect(model, source, target);
      render();
      return edge;
    },
    removeEdge(id) {
      removeEdge(model, id);
      render();
    },
    setEdgeLabel(id, label) {
      setEdgeLabel(model, id, label);
      render();
    },
    setEdgeLabelT(id, t) {
      setEdgeLabelT(model, id, t);
      render();
    },

    // --- JSON ---
    exportJSON() {
      return exportJSON(model);
    },
    importJSON(text) {
      applyImportJSON(model, text); // validates first; throws before touching state
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
      const px = r.width / 2;
      const py = r.height / 2;
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      interactions.view.x = px - ((px - interactions.view.x) / interactions.view.scale) * s;
      interactions.view.y = py - ((py - interactions.view.y) / interactions.view.scale) * s;
      interactions.view.scale = s;
      renderer.setView(interactions.view);
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
