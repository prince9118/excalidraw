import type { DrawingElement, StrokeStyle } from "./types";
import {
  DEFAULT_FONT_SIZE,
  SELECTION_PADDING,
  getElementBounds,
  getElementsBounds,
  getHandles,
  isLinear,
  textFont,
} from "./geometry";

// Elements are created with a black stroke. When drawn with this color they
// use the theme's ink instead, so they stay visible on a dark canvas.
export const DEFAULT_STROKE = "#000000";

export const TRANSPARENT = "transparent";

export interface RenderOptions {
  ink?: string;
  // World → CSS pixel transform: screen = world * scale + offset.
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  // Filled behind the drawing (used for PNG export).
  background?: string;
  // Elements about to be erased, drawn faded.
  fadedIds?: ReadonlySet<string>;
}

function dashPattern(style: StrokeStyle | undefined, width: number) {
  if (style === "dashed") return [width * 4, width * 3 + 4];
  if (style === "dotted") return [0.1, width * 2.5 + 2];

  return [];
}

function resolveStroke(element: DrawingElement, ink: string) {
  return !element.strokeColor || element.strokeColor === DEFAULT_STROKE
    ? ink
    : element.strokeColor;
}

function hasFill(element: DrawingElement) {
  return !!element.backgroundColor && element.backgroundColor !== TRANSPARENT;
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  element: DrawingElement,
  ink: string
) {
  const stroke = resolveStroke(element, ink);
  const strokeWidth = element.strokeWidth || 2;

  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.setLineDash(dashPattern(element.strokeStyle, strokeWidth));

  if (hasFill(element)) {
    ctx.fillStyle = element.backgroundColor!;
  }

  const fillAndStroke = () => {
    if (hasFill(element)) ctx.fill();
    ctx.stroke();
  };

  switch (element.type) {
    case "rectangle": {
      const { minX, minY, maxX, maxY } = getElementBounds(element);
      const width = maxX - minX;
      const height = maxY - minY;
      const radius = Math.min(8, width / 4, height / 4);

      ctx.beginPath();
      ctx.roundRect(minX, minY, width, height, radius);
      fillAndStroke();

      break;
    }

    case "diamond": {
      const { minX, minY, maxX, maxY } = getElementBounds(element);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      ctx.beginPath();
      ctx.moveTo(cx, minY);
      ctx.lineTo(maxX, cy);
      ctx.lineTo(cx, maxY);
      ctx.lineTo(minX, cy);
      ctx.closePath();
      fillAndStroke();

      break;
    }

    case "ellipse": {
      const { minX, minY, maxX, maxY } = getElementBounds(element);

      ctx.beginPath();
      ctx.ellipse(
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        (maxX - minX) / 2,
        (maxY - minY) / 2,
        0,
        0,
        Math.PI * 2
      );
      fillAndStroke();

      break;
    }

    case "line": {
      const points = element.points || [];

      if (points.length < 2) break;

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }

      ctx.stroke();

      break;
    }

    case "pencil": {
      const points = element.points || [];

      if (points.length === 0) break;

      // Pencil strokes are always solid.
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      if (points.length === 1) {
        // A single click still leaves a dot.
        ctx.lineTo(points[0].x + 0.01, points[0].y);
      }

      // Curve through the midpoints for a smoother line.
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;

        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }

      if (points.length > 1) {
        const last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);
      }

      ctx.stroke();

      break;
    }

    case "arrow": {
      const points = element.points || [];

      if (points.length < 2) break;

      const start = points[0];
      const end = points[points.length - 1];

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const size = 10 + strokeWidth * 2;

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(
        end.x - size * Math.cos(angle - Math.PI / 6),
        end.y - size * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(
        end.x - size * Math.cos(angle + Math.PI / 6),
        end.y - size * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();

      break;
    }

    case "text": {
      ctx.font = textFont(element.fontSize ?? DEFAULT_FONT_SIZE);
      ctx.fillStyle = stroke;
      ctx.fillText(element.text || "", element.x, element.y);

      break;
    }
  }
}

function prepareContext(
  canvas: HTMLCanvasElement,
  { scale = 1, offsetX = 0, offsetY = 0 }: RenderOptions
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  // The canvas backing store is sized in device pixels for sharp lines on
  // high-DPI screens; everything below is drawn in CSS pixels.
  const dpr = window.devicePixelRatio || 1;

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offsetX * dpr, offsetY * dpr);

  return ctx;
}

export function renderCanvas(
  canvas: HTMLCanvasElement,
  elements: DrawingElement[],
  options: RenderOptions = {}
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  prepareContext(canvas, options);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const ink = options.ink ?? DEFAULT_STROKE;

  for (const element of elements) {
    const faded = options.fadedIds?.has(element.id);

    ctx.globalAlpha = ((element.opacity ?? 100) / 100) * (faded ? 0.25 : 1);

    drawElement(ctx, element, ink);
  }

  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

// Dashed outline plus resize handles, drawn on top of an already-rendered canvas.
export function renderSelection(
  canvas: HTMLCanvasElement,
  element: DrawingElement,
  color: string,
  surface: string,
  options: RenderOptions = {}
) {
  const ctx = prepareContext(canvas, options);

  if (!ctx) return;

  const zoom = options.scale ?? 1;
  const pad = SELECTION_PADDING / zoom;
  const handles = getHandles(element, zoom);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / zoom;

  // Lines and arrows show only their endpoint handles.
  const showOutline = !(isLinear(element) && handles.length > 0);

  if (showOutline) {
    const { minX, minY, maxX, maxY } = getElementBounds(element);

    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.roundRect(
      minX - pad,
      minY - pad,
      maxX - minX + pad * 2,
      maxY - minY + pad * 2,
      6 / zoom
    );
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.fillStyle = surface;

  const size = 9 / zoom;

  for (const handle of handles) {
    ctx.beginPath();
    ctx.roundRect(handle.x - size / 2, handle.y - size / 2, size, size, 2 / zoom);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/*
 * PNG export
 */

export function exportToBlob(
  elements: DrawingElement[],
  { ink, background, padding = 32, pixelRatio = 2 }: {
    ink: string;
    background: string;
    padding?: number;
    pixelRatio?: number;
  }
) {
  const bounds = getElementsBounds(elements);

  if (!bounds) return Promise.resolve(null);

  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;

  const canvas = document.createElement("canvas");

  canvas.width = Math.ceil(width * pixelRatio);
  canvas.height = Math.ceil(height * pixelRatio);

  // renderCanvas scales by devicePixelRatio, so fold that into the scale.
  const scale = pixelRatio / (window.devicePixelRatio || 1);

  renderCanvas(canvas, elements, {
    ink,
    background,
    scale,
    offsetX: (padding - bounds.minX) * scale,
    offsetY: (padding - bounds.minY) * scale,
  });

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}
