import type { DrawingElement, Point } from "./types";

export const DEFAULT_FONT_SIZE = 20;

export function textFont(size: number = DEFAULT_FONT_SIZE) {
  return `500 ${size}px Inter, system-ui, sans-serif`;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

let measureContext: CanvasRenderingContext2D | null = null;

export function measureText(text: string, fontSize: number) {
  measureContext ??= document.createElement("canvas").getContext("2d");

  if (!measureContext) return text.length * fontSize * 0.55;

  measureContext.font = textFont(fontSize);

  return measureContext.measureText(text).width;
}

export function isLinear(element: DrawingElement) {
  return (
    element.type === "line" ||
    element.type === "arrow" ||
    element.type === "pencil"
  );
}

export function isBoxShape(element: DrawingElement) {
  return (
    element.type === "rectangle" ||
    element.type === "diamond" ||
    element.type === "ellipse"
  );
}

// Text is positioned by its baseline at (x, y).
export function getElementBounds(element: DrawingElement): Bounds {
  if (element.type === "text") {
    const size = element.fontSize ?? DEFAULT_FONT_SIZE;

    return {
      minX: element.x,
      minY: element.y - size,
      maxX: element.x + measureText(element.text ?? "", size),
      maxY: element.y + size * 0.3,
    };
  }

  if (isLinear(element)) {
    const points = element.points?.length ? element.points : [element];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY };
  }

  // Shapes drawn up or to the left have a negative width/height.
  const x2 = element.x + (element.width || 0);
  const y2 = element.y + (element.height || 0);

  return {
    minX: Math.min(element.x, x2),
    minY: Math.min(element.y, y2),
    maxX: Math.max(element.x, x2),
    maxY: Math.max(element.y, y2),
  };
}

export function getElementsBounds(elements: DrawingElement[]): Bounds | null {
  if (elements.length === 0) return null;

  const bounds = elements.map(getElementBounds);

  return {
    minX: Math.min(...bounds.map((b) => b.minX)),
    minY: Math.min(...bounds.map((b) => b.minY)),
    maxX: Math.max(...bounds.map((b) => b.maxX)),
    maxY: Math.max(...bounds.map((b) => b.maxY)),
  };
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));

  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// `tolerance` is in world units, so callers divide by zoom.
export function hitTest(element: DrawingElement, point: Point, tolerance: number) {
  if (isLinear(element)) {
    const points = element.points ?? [];
    const reach = tolerance + (element.strokeWidth ?? 2) / 2;

    if (points.length === 1) {
      return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= reach;
    }

    for (let i = 1; i < points.length; i++) {
      if (distanceToSegment(point, points[i - 1], points[i]) <= reach) {
        return true;
      }
    }

    return false;
  }

  const { minX, minY, maxX, maxY } = getElementBounds(element);

  return (
    point.x >= minX - tolerance &&
    point.x <= maxX + tolerance &&
    point.y >= minY - tolerance &&
    point.y <= maxY + tolerance
  );
}

export function getElementAtPoint(
  elements: DrawingElement[],
  point: Point,
  tolerance: number
) {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTest(elements[i], point, tolerance)) return elements[i];
  }

  return null;
}

/*
 * Resize handles
 */

export type Handle = "nw" | "ne" | "sw" | "se" | "start" | "end";

// Padding between an element and its selection outline, in screen pixels.
export const SELECTION_PADDING = 6;

export function getHandles(element: DrawingElement, zoom: number) {
  if (element.type === "line" || element.type === "arrow") {
    const points = element.points ?? [];

    if (points.length < 2) return [];

    return [
      { handle: "start" as Handle, ...points[0] },
      { handle: "end" as Handle, ...points[points.length - 1] },
    ];
  }

  if (!isBoxShape(element)) return [];

  const pad = SELECTION_PADDING / zoom;
  const { minX, minY, maxX, maxY } = getElementBounds(element);

  return [
    { handle: "nw" as Handle, x: minX - pad, y: minY - pad },
    { handle: "ne" as Handle, x: maxX + pad, y: minY - pad },
    { handle: "sw" as Handle, x: minX - pad, y: maxY + pad },
    { handle: "se" as Handle, x: maxX + pad, y: maxY + pad },
  ];
}

export function getHandleAtPoint(
  element: DrawingElement,
  point: Point,
  zoom: number
) {
  const reach = 8 / zoom;

  return (
    getHandles(element, zoom).find(
      (h) => Math.abs(h.x - point.x) <= reach && Math.abs(h.y - point.y) <= reach
    )?.handle ?? null
  );
}

// The point a handle moves: an endpoint, or the shape corner it sits next to.
export function getHandleTarget(element: DrawingElement, handle: Handle): Point {
  if (handle === "start" || handle === "end") {
    const points = element.points ?? [element];

    return points[handle === "start" ? 0 : points.length - 1];
  }

  const { minX, minY, maxX, maxY } = getElementBounds(element);

  return {
    x: handle === "nw" || handle === "sw" ? minX : maxX,
    y: handle === "nw" || handle === "ne" ? minY : maxY,
  };
}

// Returns a copy of `original` resized by dragging `handle` to `point`.
export function resizeElement(
  original: DrawingElement,
  handle: Handle,
  point: Point
): DrawingElement {
  if (handle === "start" || handle === "end") {
    const points = [...(original.points ?? [])];

    points[handle === "start" ? 0 : points.length - 1] = point;

    return { ...original, x: points[0].x, y: points[0].y, points };
  }

  const { minX, minY, maxX, maxY } = getElementBounds(original);

  // The corner opposite the dragged handle stays put.
  const anchorX = handle === "nw" || handle === "sw" ? maxX : minX;
  const anchorY = handle === "nw" || handle === "ne" ? maxY : minY;

  return {
    ...original,
    x: Math.min(anchorX, point.x),
    y: Math.min(anchorY, point.y),
    width: Math.abs(point.x - anchorX),
    height: Math.abs(point.y - anchorY),
  };
}

export function translateElement(
  element: DrawingElement,
  dx: number,
  dy: number
): DrawingElement {
  return {
    ...element,
    x: element.x + dx,
    y: element.y + dy,
    points: element.points?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  };
}

// Shift-constrained drawing: squares/circles and 45° lines.
export function constrainPoint(origin: Point, point: Point, linear: boolean): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;

  if (linear) {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);

    return {
      x: origin.x + Math.cos(angle) * length,
      y: origin.y + Math.sin(angle) * length,
    };
  }

  const size = Math.max(Math.abs(dx), Math.abs(dy));

  return {
    x: origin.x + Math.sign(dx || 1) * size,
    y: origin.y + Math.sign(dy || 1) * size,
  };
}
