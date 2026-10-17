import type { DrawingElement } from "./types";

// Elements are created with a black stroke. When drawn with this color they
// use the theme's ink instead, so they stay visible on a dark canvas.
const DEFAULT_STROKE = "#000000";

export const TEXT_FONT = "500 20px Inter, system-ui, sans-serif";

export interface RenderOptions {
  ink?: string;
  // World → CSS pixel transform, used for thumbnails.
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export function renderCanvas(
  canvas: HTMLCanvasElement,
  elements: DrawingElement[],
  { ink = DEFAULT_STROKE, scale = 1, offsetX = 0, offsetY = 0 }: RenderOptions = {}
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  // The canvas backing store is sized in device pixels for sharp lines on
  // high-DPI screens; everything below is drawn in CSS pixels.
  const dpr = window.devicePixelRatio || 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offsetX * dpr, offsetY * dpr);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const element of elements) {
    const stroke =
      !element.strokeColor || element.strokeColor === DEFAULT_STROKE
        ? ink
        : element.strokeColor;

    ctx.strokeStyle = stroke;

    ctx.lineWidth = element.strokeWidth || 2;

    ctx.fillStyle = element.backgroundColor || "transparent";

    switch (element.type) {
      case "rectangle": {
        const width = element.width || 0;

        const height = element.height || 0;

        ctx.beginPath();

        ctx.roundRect(element.x, element.y, width, height, 6);

        ctx.stroke();

        break;
      }

      case "ellipse": {
        const width = element.width || 0;

        const height = element.height || 0;

        ctx.beginPath();

        ctx.ellipse(
          element.x + width / 2,
          element.y + height / 2,
          Math.abs(width / 2),
          Math.abs(height / 2),
          0,
          0,
          Math.PI * 2
        );

        ctx.stroke();

        break;
      }

      case "line":
      case "pencil": {
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

        const size = 12;

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
        ctx.font = TEXT_FONT;

        ctx.fillStyle = stroke;

        ctx.fillText(element.text || "", element.x, element.y);

        break;
      }
    }
  }
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Approximate bounding box of all elements, used to fit thumbnails.
export function getElementsBounds(elements: DrawingElement[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const element of elements) {
    if (element.type === "text") {
      include(element.x, element.y - 20);
      include(element.x + (element.text?.length ?? 0) * 11, element.y + 4);
    } else if (
      element.type === "line" ||
      element.type === "arrow" ||
      element.type === "pencil"
    ) {
      for (const point of element.points ?? []) include(point.x, point.y);
    } else {
      include(element.x, element.y);
      include(element.x + (element.width || 0), element.y + (element.height || 0));
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
