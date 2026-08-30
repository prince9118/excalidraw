import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useParams } from "react-router-dom";

import { api } from "../services/api";

import type {
  DrawingElement,
  ElementType,
} from "../canvas/types";

import { renderCanvas } from "../canvas/renderer";

export default function Whiteboard() {
  const { id } = useParams();

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const [elements, setElements] =
    useState<DrawingElement[]>([]);

  const [tool, setTool] =
    useState<ElementType>("rectangle");

  const drawingRef =
    useRef<DrawingElement | null>(null);

  const isDrawing =
    useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    canvasRef.current.width =
      window.innerWidth;

    canvasRef.current.height =
      window.innerHeight - 60;
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    renderCanvas(
      canvasRef.current,
      elements
    );
  }, [elements]);

  useEffect(() => {
    if (!id) return;

    const loadDrawing = async () => {
      try {
        const result = await api<{
          success: boolean;
          data: {
            elements: DrawingElement[];
          };
        }>(`/api/drawings/${id}`);

        setElements(
          result.data.elements
        );
      } catch (error) {
        console.error(error);
      }
    };

    loadDrawing();
  }, [id]);

  const getPoint = (
    event: React.PointerEvent
  ) => {
    const canvas =
      canvasRef.current!;

    const rect =
      canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const pointerDown = (
    event: React.PointerEvent
  ) => {
    const point = getPoint(event);

    isDrawing.current = true;

    const element: DrawingElement = {
      id: crypto.randomUUID(),
      type: tool,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      points: [point],
      strokeColor: "#000000",
      strokeWidth: 2,
    };

    if (tool === "text") {
      const text =
        window.prompt("Enter text");

      if (text) {
        element.text = text;

        setElements((prev) => [
          ...prev,
          element,
        ]);
      }

      isDrawing.current = false;

      return;
    }

    drawingRef.current = element;

    setElements((prev) => [
      ...prev,
      element,
    ]);
  };

  const pointerMove = (
    event: React.PointerEvent
  ) => {
    if (!isDrawing.current) return;

    const point = getPoint(event);

    const current =
      drawingRef.current;

    if (!current) return;

    if (
      current.type === "rectangle" ||
      current.type === "ellipse"
    ) {
      current.width =
        point.x - current.x;

      current.height =
        point.y - current.y;
    }

    if (
      current.type === "line" ||
      current.type === "arrow"
    ) {
      current.points = [
        {
          x: current.x,
          y: current.y,
        },
        point,
      ];
    }

    if (current.type === "pencil") {
      current.points = [
        ...(current.points || []),
        point,
      ];
    }

    setElements((prev) => [
      ...prev.slice(0, -1),
      {
        ...current,
      },
    ]);
  };

  const pointerUp = () => {
    isDrawing.current = false;
    drawingRef.current = null;
  };

  const save = async () => {
    if (!id) return;

    await api(
      `/api/drawings/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          elements,
        }),
      }
    );

    alert("Saved");
  };

  return (
    <div className="whiteboard">
      <div className="toolbar">
        <button
          onClick={() =>
            setTool("rectangle")
          }
        >
          Rectangle
        </button>

        <button
          onClick={() =>
            setTool("ellipse")
          }
        >
          Ellipse
        </button>

        <button
          onClick={() =>
            setTool("line")
          }
        >
          Line
        </button>

        <button
          onClick={() =>
            setTool("arrow")
          }
        >
          Arrow
        </button>

        <button
          onClick={() =>
            setTool("pencil")
          }
        >
          Pencil
        </button>

        <button
          onClick={() =>
            setTool("text")
          }
        >
          Text
        </button>

        <button
          onClick={save}
        >
          Save
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />
    </div>
  );
}