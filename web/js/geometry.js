// Page geometry. Everything placed on a page is stored in PDF user space
// (points, origin at the bottom left of the unrotated page), so it survives
// zooming and rotating and can be written into the PDF unchanged.

// Text layout shared by the editor preview and the PDF writer.
export const LINE = 1.3; // line height, in font sizes
export const ASCENT = 1.0; // first baseline below the top of the box, in font sizes

// Same maths as pdf.js PageViewport, so overlays line up with rendered pages.
export function viewport(view, scale, rotation) {
  const [x0, y0, x1, y1] = view;
  const cx = (x1 + x0) / 2;
  const cy = (y1 + y0) / 2;
  const r = ((rotation % 360) + 360) % 360;
  let a = 1, b = 0, c = 0, d = -1;
  if (r === 90) { a = 0; b = 1; c = 1; d = 0; }
  else if (r === 180) { a = -1; b = 0; c = 0; d = 1; }
  else if (r === 270) { a = 0; b = -1; c = -1; d = 0; }
  let ox, oy, width, height;
  if (a === 0) {
    ox = Math.abs(cy - y0) * scale; oy = Math.abs(cx - x0) * scale;
    width = Math.abs(y1 - y0) * scale; height = Math.abs(x1 - x0) * scale;
  } else {
    ox = Math.abs(cx - x0) * scale; oy = Math.abs(cy - y0) * scale;
    width = Math.abs(x1 - x0) * scale; height = Math.abs(y1 - y0) * scale;
  }
  const t = [a * scale, b * scale, c * scale, d * scale, ox - a * scale * cx - c * scale * cy, oy - b * scale * cx - d * scale * cy];
  const det = t[0] * t[3] - t[1] * t[2];
  return {
    width, height, scale, rotation: r, transform: t,
    toView: (x, y) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]],
    toUser: (px, py) => {
      const x = px - t[4], y = py - t[5];
      return [(t[3] * x - t[2] * y) / det, (-t[1] * x + t[0] * y) / det];
    }
  };
}

// Affine matrices as [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f.
export function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

export const dirs = (deg) => {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return { u: [cos, sin], v: [-sin, cos] };
};

// A boxed item (text, rectangle, image, mark) has an anchor (x, y) at the
// corner that is bottom left on screen, a size (w, h) and a rotation in
// degrees counter-clockwise in user space. Local coordinates (s, t) run right
// and down from the top-left corner, like SVG.
export function localToUser(it) {
  const { u, v } = dirs(it.rot || 0);
  return [u[0], u[1], -v[0], -v[1], it.x + it.h * v[0], it.y + it.h * v[1]];
}

export function pointAt(it, s, t) {
  const m = localToUser(it);
  return [m[0] * s + m[2] * t + m[4], m[1] * s + m[3] * t + m[5]];
}

export function corners(it) {
  return [pointAt(it, 0, 0), pointAt(it, it.w, 0), pointAt(it, it.w, it.h), pointAt(it, 0, it.h)];
}

// Screen-space bounding box of any item.
export function viewBounds(it, vp) {
  const pts = it.type === 'ink' ? it.pts : corners(it);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    const [x, y] = vp.toView(p[0], p[1]);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = it.type === 'ink' ? (it.width * vp.scale) / 2 : 0;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

// Builds a boxed item from a rectangle drawn on screen.
export function boxFromView(vp, vx, vy, vw, vh, extra) {
  const [x, y] = vp.toUser(vx, vy + vh);
  return { x, y, w: vw / vp.scale, h: vh / vp.scale, rot: vp.rotation, ...extra };
}

// Moves an item by a screen-space delta.
export function moveBy(it, vp, dx, dy) {
  const [ax, ay] = vp.toUser(0, 0);
  const [bx, by] = vp.toUser(dx, dy);
  const ux = bx - ax, uy = by - ay;
  if (it.type === 'ink') it.pts = it.pts.map(([x, y]) => [x + ux, y + uy]);
  else { it.x += ux; it.y += uy; }
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Tick and cross marks, drawn in a unit box.
export const MARKS = {
  check: [[[0.12, 0.55], [0.4, 0.82], [0.9, 0.18]]],
  cross: [[[0.15, 0.15], [0.85, 0.85]], [[0.85, 0.15], [0.15, 0.85]]],
  dot: null
};
