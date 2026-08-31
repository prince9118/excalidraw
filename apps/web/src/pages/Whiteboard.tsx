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

import { DrawingWebSocket } from "../services/websocket";

type Tool = ElementType | "select";

export default function Whiteboard() {
  const { id } = useParams();

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const websocketRef =
    useRef<DrawingWebSocket | null>(null);

  const saveTimeoutRef =
    useRef<number | null>(null);

  const drawingRef =
    useRef<DrawingElement | null>(null);

  const isDrawing =
    useRef(false);

  const dragOffsetRef =
    useRef({ x: 0, y: 0 });

  const [elements, setElements] =
    useState<DrawingElement[]>([]);

  const [tool, setTool] =
    useState<Tool>("select");

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [history, setHistory] =
    useState<DrawingElement[][]>([]);

  const [future, setFuture] =
    useState<DrawingElement[][]>([]);

  const [saveStatus, setSaveStatus] =
    useState<
      "saved" | "saving" | "unsaved"
    >("saved");

  /*
   * Canvas size
   */

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height =
      window.innerHeight - 60;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height =
        window.innerHeight - 60;

      renderCanvas(canvas, elements);
    };

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, [elements]);

  /*
   * Render
   */

  useEffect(() => {
    if (!canvasRef.current) return;

    renderCanvas(
      canvasRef.current,
      elements
    );

    if (selectedId) {
      drawSelectionBox(
        canvasRef.current,
        selectedId,
        elements
      );
    }
  }, [elements, selectedId]);

  /*
   * Load drawing
   */

  useEffect(() => {
    if (!id) return;

    const loadDrawing = async () => {
      try {
        const result =
          await api<{
            success: boolean;
            data: {
              elements: DrawingElement[];
            };
          }>(
            `/api/drawings/${id}`
          );

        setElements(
          result.data.elements
        );
      } catch (error) {
        console.error(
          "Failed to load drawing:",
          error
        );
      }
    };

    loadDrawing();
  }, [id]);

  /*
   * WebSocket
   */

  useEffect(() => {
    if (!id) return;

    const websocket =
      new DrawingWebSocket();

    websocketRef.current =
      websocket;

    websocket.connect();

    websocket.send({
      type: "drawing:join",
      drawingId: id,
    });

    const unsubscribe =
      websocket.subscribe((message) => {
        console.log("WS:", message);
      });

    return () => {
      unsubscribe();
      websocket.disconnect();
    };
  }, [id]);

  /*
   * History helper
   */

  const updateElements = (
    next: DrawingElement[],
    saveHistory = true
  ) => {
    if (saveHistory) {
      setHistory((prev) => [
        ...prev,
        elements,
      ]);

      setFuture([]);
    }

    setElements(next);
    setSaveStatus("unsaved");
  };

  /*
   * Autosave
   */

  useEffect(() => {
    if (!id) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(
        saveTimeoutRef.current
      );
    }

    if (saveStatus !== "unsaved") {
      return;
    }

    setSaveStatus("saving");

    saveTimeoutRef.current =
      window.setTimeout(async () => {
        try {
          await api(
            `/api/drawings/${id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                elements,
              }),
            }
          );

          setSaveStatus("saved");
        } catch (error) {
          console.error(
            "Autosave failed:",
            error
          );

          setSaveStatus("unsaved");
        }
      }, 800);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(
          saveTimeoutRef.current
        );
      }
    };
  }, [elements, id, saveStatus]);

  /*
   * Mouse position
   */

  const getPoint = (
    event: React.PointerEvent
  ) => {
    const canvas =
      canvasRef.current!;

    const rect =
      canvas.getBoundingClientRect();

    return {
      x:
        event.clientX -
        rect.left,
      y:
        event.clientY -
        rect.top,
    };
  };

  /*
   * Hit testing
   */

  const findElementAtPoint = (
    point: {
      x: number;
      y: number;
    }
  ) => {
    for (
      let i = elements.length - 1;
      i >= 0;
      i--
    ) {
      const element =
        elements[i];

      if (
        element.type ===
          "rectangle" ||
        element.type === "ellipse"
      ) {
        const width =
          element.width || 0;

        const height =
          element.height || 0;

        const minX = Math.min(
          element.x,
          element.x + width
        );

        const maxX = Math.max(
          element.x,
          element.x + width
        );

        const minY = Math.min(
          element.y,
          element.y + height
        );

        const maxY = Math.max(
          element.y,
          element.y + height
        );

        if (
          point.x >= minX &&
          point.x <= maxX &&
          point.y >= minY &&
          point.y <= maxY
        ) {
          return element;
        }
      }

      if (
        element.type ===
          "text"
      ) {
        if (
          point.x >= element.x &&
          point.x <=
            element.x + 150 &&
          point.y <= element.y &&
          point.y >=
            element.y - 30
        ) {
          return element;
        }
      }

      if (
        element.type ===
          "line" ||
        element.type === "arrow" ||
        element.type === "pencil"
      ) {
        const points =
          element.points || [];

        for (const p of points) {
          const distance =
            Math.hypot(
              point.x - p.x,
              point.y - p.y
            );

          if (distance < 10) {
            return element;
          }
        }
      }
    }

    return null;
  };
  const commitElements = (
    next: DrawingElement[]
  ) => {
    setHistory((prev) => [
      ...prev,
      elements,
    ]);

    setFuture([]);

    setElements(next);

    setSaveStatus("unsaved");
  };

  /*
   * Pointer down
   */

  const pointerDown = (
    event: React.PointerEvent
  ) => {
    const point =
      getPoint(event);

    /*
     * SELECT
     */

    if (tool === "select") {
      const element =
        findElementAtPoint(point);

      if (!element) {
        setSelectedId(null);
        return;
      }

      setSelectedId(element.id);

      dragOffsetRef.current = {
        x: point.x - element.x,
        y: point.y - element.y,
      };

      isDrawing.current = true;

      return;
    }

    /*
     * TEXT
     */

    if (tool === "text") {
      const text =
        window.prompt(
          "Enter text"
        );

      if (!text) return;

      const element: DrawingElement =
        {
          id: crypto.randomUUID(),
          type: "text",
          x: point.x,
          y: point.y,
          text,
          strokeColor:
            "#000000",
          strokeWidth: 2,
        };

     commitElements([
        ...elements,
        element,
      ]);

      websocketRef.current?.send({
        type: "element:create",
        drawingId: id as string,
        element,
      });

      return;
    }

    /*
     * DRAWING
     */

    isDrawing.current = true;

    const element: DrawingElement =
      {
        id: crypto.randomUUID(),
        type: tool,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        points: [point],
        strokeColor:
          "#000000",
        strokeWidth: 2,
      };

    drawingRef.current =
      element;

    setElements((prev) => [
      ...prev,
      element,
    ]);

    setSaveStatus("unsaved");
  };

  /*
   * Pointer move
   */

  const pointerMove = (
    event: React.PointerEvent
  ) => {
    if (!isDrawing.current) {
      return;
    }

    const point =
      getPoint(event);

    /*
     * MOVE SELECTED ELEMENT
     */

    if (
      tool === "select" &&
      selectedId
    ) {
      const next =
        elements.map(
          (element) => {
            if (
              element.id !==
              selectedId
            ) {
              return element;
            }

            const dx =
              point.x -
              dragOffsetRef.current
                .x;

            const dy =
              point.y -
              dragOffsetRef.current
                .y;

            const offsetX =
              dx - element.x;

            const offsetY =
              dy - element.y;

            return {
              ...element,
              x: dx,
              y: dy,
              points:
                element.points?.map(
                  (p) => ({
                    x:
                      p.x +
                      offsetX,
                    y:
                      p.y +
                      offsetY,
                  })
                ),
            };
          }
        );

      setElements(next);
      setSaveStatus("unsaved");

      return;
    }

    /*
     * DRAW
     */

    const current =
      drawingRef.current;

    if (!current) return;

    if (
      current.type ===
        "rectangle" ||
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

    if (
      current.type === "pencil"
    ) {
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

    setSaveStatus("unsaved");
  };

  /*
   * Pointer up
   */

  const pointerUp = () => {
    if (!isDrawing.current) {
      return;
    }

    isDrawing.current = false;

    /*
     * Selected element moved
     */

    if (
      tool === "select" &&
      selectedId
    ) {
      websocketRef.current?.send({
        type: "element:update",
        drawingId: id as string,
        elementId: selectedId,
      });

      return;
    }

    /*
     * New element
     */

    if (drawingRef.current) {
      websocketRef.current?.send({
        type: "element:create",
        drawingId: id as string,
        element:
          drawingRef.current,
      });
    }

    drawingRef.current = null;
  };

  /*
   * Delete
   */

  const deleteSelected = () => {
    if (!selectedId) return;

    const next =
      elements.filter(
        (element) =>
          element.id !==
          selectedId
      );

    updateElements(next);

    websocketRef.current?.send({
      type: "element:delete",
      drawingId: id as string,
      elementId: selectedId,
    });

    setSelectedId(null);
  };

  /*
   * Undo
   */

  const undo = () => {
    if (history.length === 0) {
      return;
    }

    const previous =
      history[
        history.length - 1
      ];

    setHistory(
      history.slice(0, -1)
    );

    setFuture((prev) => [
      ...prev,
      elements,
    ]);

    setElements(previous);
    setSaveStatus("unsaved");
  };

  /*
   * Redo
   */

  const redo = () => {
    if (future.length === 0) {
      return;
    }

    const next =
      future[
        future.length - 1
      ];

    setFuture(
      future.slice(0, -1)
    );

    setHistory((prev) => [
      ...prev,
      elements,
    ]);

    setElements(next);
    setSaveStatus("unsaved");
  };

  /*
   * Keyboard shortcuts
   */

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      const target =
        event.target as HTMLElement;

      if (
        target.tagName === "INPUT" ||
        target.tagName ===
          "TEXTAREA"
      ) {
        return;
      }

      if (
        event.key === "Delete" ||
        event.key === "Backspace"
      ) {
        deleteSelected();
      }

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() ===
          "z"
      ) {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() ===
          "y"
      ) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  });

  return (
    <div className="whiteboard">
      <div className="toolbar">
        <button
          className={
            tool === "select"
              ? "active"
              : ""
          }
          onClick={() =>
            setTool("select")
          }
        >
          Select
        </button>

        <button
          className={
            tool === "rectangle"
              ? "active"
              : ""
          }
          onClick={() =>
            setTool("rectangle")
          }
        >
          Rectangle
        </button>

        <button
          className={
            tool === "ellipse"
              ? "active"
              : ""
          }
          onClick={() =>
            setTool("ellipse")
          }
        >
          Ellipse
        </button>

        <button
          className={
            tool === "line"
              ? "active"
              : ""
          }
          onClick={() =>
            setTool("line")
          }
        >
          Line
        </button>

        <button
          className={
            tool === "arrow"
              ? "active"
              : ""
          }
          onClick={() =>
            setTool("arrow")
          }
        >
          Arrow
        </button>

        <button
          className={
            tool === "pencil"
              ? "active"
              : ""
          }
          onClick={() =>
            setTool("pencil")
          }
        >
          Pencil
        </button>

        <button
          className={
            tool === "text"
              ? "active"
              : ""
          }
          onClick={() =>
            setTool("text")
          }
        >
          Text
        </button>

        <button
          onClick={undo}
          disabled={
            history.length === 0
          }
        >
          Undo
        </button>

        <button
          onClick={redo}
          disabled={
            future.length === 0
          }
        >
          Redo
        </button>

        <button
          onClick={deleteSelected}
          disabled={
            !selectedId
          }
        >
          Delete
        </button>

        <span className="save-status">
          {saveStatus === "saving" &&
            "Saving..."}

          {saveStatus === "saved" &&
            "Saved"}

          {saveStatus === "unsaved" &&
            "Unsaved changes"}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={
          pointerDown
        }
        onPointerMove={
          pointerMove
        }
        onPointerUp={pointerUp}
        onPointerCancel={
          pointerUp
        }
      />
    </div>
  );
}

/*
 * Draw selection rectangle
 */

function drawSelectionBox(
  canvas: HTMLCanvasElement,
  selectedId: string,
  elements: DrawingElement[]
) {
  const element =
    elements.find(
      (item) =>
        item.id === selectedId
    );

  if (!element) return;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) return;

  let width =
    element.width || 100;

  let height =
    element.height || 30;

  if (
    element.type ===
      "line" ||
    element.type ===
      "arrow" ||
    element.type ===
      "pencil"
  ) {
    const points =
      element.points || [];

    if (points.length === 0) {
      return;
    }

    const xs =
      points.map((p) => p.x);

    const ys =
      points.map((p) => p.y);

    const minX =
      Math.min(...xs);

    const maxX =
      Math.max(...xs);

    const minY =
      Math.min(...ys);

    const maxY =
     Math.max(...ys);

   const selectionX = minX;
    const selectionY = minY;

    width = maxX - minX;
    height = maxY - minY;

    ctx.save();

    ctx.strokeStyle = "#1971c2";
    ctx.setLineDash([5, 5]);

    ctx.strokeRect(
      selectionX - 5,
      selectionY - 5,
      width + 10,
      height + 10
    );

    ctx.restore();

    return;
  }

  ctx.save();

  ctx.strokeStyle =
    "#1971c2";

  ctx.setLineDash([5, 5]);

  ctx.strokeRect(
    element.x - 5,
    element.y - 5,
    width + 10,
    height + 10
  );

  ctx.restore();
}
