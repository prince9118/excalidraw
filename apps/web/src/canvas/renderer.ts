import type { DrawingElement } from "./types";

export function renderCanvas(
  canvas: HTMLCanvasElement,
  elements: DrawingElement[]
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const element of elements) {
    ctx.strokeStyle = element.strokeColor || "#000000";

    ctx.lineWidth = element.strokeWidth || 2;

    ctx.fillStyle = element.backgroundColor || "transparent";

    switch (element.type) {
      case "rectangle": {
        const width = element.width || 0;

        const height = element.height || 0;

        ctx.strokeRect(element.x, element.y, width, height);

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

        const size = 10;

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
        ctx.font = "20px sans-serif";

        ctx.fillStyle = element.strokeColor || "#000000";

        ctx.fillText(element.text || "", element.x, element.y);

        break;
      }
    }
  }
}
