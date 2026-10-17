import { useEffect, useRef } from "react";

import type { DrawingElement } from "../canvas/types";
import { getElementsBounds, renderCanvas } from "../canvas/renderer";

const PADDING = 16;

interface Props {
  elements: DrawingElement[];
}

export default function Thumbnail({ elements }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const bounds = getElementsBounds(elements);

      if (!bounds) {
        renderCanvas(canvas, []);
        return;
      }

      const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
      const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);

      // Fit the drawing inside the card, but never enlarge it.
      const scale = Math.min(
        (width - PADDING * 2) / contentWidth,
        (height - PADDING * 2) / contentHeight,
        1
      );

      const ink = getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas-ink")
        .trim();

      renderCanvas(canvas, elements, {
        ink,
        scale,
        offsetX: (width - contentWidth * scale) / 2 - bounds.minX * scale,
        offsetY: (height - contentHeight * scale) / 2 - bounds.minY * scale
      });
    };

    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);

    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", draw);

    return () => {
      observer.disconnect();
      scheme.removeEventListener("change", draw);
    };
  }, [elements]);

  return <canvas ref={canvasRef} className="thumbnail-canvas" aria-hidden="true" />;
}
