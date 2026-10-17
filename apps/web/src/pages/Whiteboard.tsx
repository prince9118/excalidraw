import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Link, useParams } from "react-router-dom";

import { api } from "../services/api";

import type {
  DrawingElement,
  ElementType,
} from "../canvas/types";

import { renderCanvas, TEXT_FONT } from "../canvas/renderer";

import { DrawingWebSocket } from "../services/websocket";

import {
  ArrowIcon,
  ArrowLeftIcon,
  CheckIcon,
  EllipseIcon,
  LineIcon,
  PencilIcon,
  RectangleIcon,
  RedoIcon,
  SelectIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
} from "../components/icons";

type Tool = ElementType | "select";

interface ToolOption {
  tool: Tool;
  label: string;
  // Number shortcut shown on the button; `letter` also selects it.
  shortcut: string;
  letter: string;
  icon: ReactNode;
}

const TOOLS: ToolOption[] = [
  { tool: "select", label: "Select", shortcut: "1", letter: "v", icon: <SelectIcon /> },
  { tool: "rectangle", label: "Rectangle", shortcut: "2", letter: "r", icon: <RectangleIcon /> },
  { tool: "ellipse", label: "Ellipse", shortcut: "3", letter: "o", icon: <EllipseIcon /> },
  { tool: "line", label: "Line", shortcut: "4", letter: "l", icon: <LineIcon /> },
  { tool: "arrow", label: "Arrow", shortcut: "5", letter: "a", icon: <ArrowIcon /> },
  { tool: "pencil", label: "Pencil", shortcut: "6", letter: "p", icon: <PencilIcon /> },
  { tool: "text", label: "Text", shortcut: "7", letter: "t", icon: <TextIcon /> },
];

interface TextDraft {
  x: number;
  y: number;
  value: string;
}

interface CanvasColors {
  ink: string;
  accent: string;
}

function readCanvasColors(): CanvasColors {
  const style = getComputedStyle(document.documentElement);

  return {
    ink: style.getPropertyValue("--canvas-ink").trim() || "#1e1e1e",
    accent: style.getPropertyValue("--accent").trim() || "#6965db",
  };
}

export default function Whiteboard() {
  const { id } = useParams();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const websocketRef = useRef<DrawingWebSocket | null>(null);

  const saveTimeoutRef = useRef<number | null>(null);

  const drawingRef = useRef<DrawingElement | null>(null);

  const isDrawing = useRef(false);

  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const dragStartElementsRef = useRef<DrawingElement[] | null>(null);

  const cancelTextRef = useRef(false);

  const savedNameRef = useRef("");

  const [elements, setElements] = useState<DrawingElement[]>([]);

  const [tool, setTool] = useState<Tool>("select");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [history, setHistory] = useState<DrawingElement[][]>([]);

  const [future, setFuture] = useState<DrawingElement[][]>([]);

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

  const [name, setName] = useState("");

  const [loaded, setLoaded] = useState(false);

  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);

  const [colors, setColors] = useState(readCanvasColors);

  // Bumped on resize so the render effect redraws the resized canvas.
  const [viewport, setViewport] = useState(0);

  /*
   * Canvas size (device pixels for sharp lines on high-DPI screens)
   */

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);

      setViewport((v) => v + 1);
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  /*
   * Theme colors for the canvas
   */

  useEffect(() => {
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => setColors(readCanvasColors());

    scheme.addEventListener("change", handleChange);

    return () => {
      scheme.removeEventListener("change", handleChange);
    };
  }, []);

  /*
   * Render
   */

  useEffect(() => {
    if (!canvasRef.current) return;

    renderCanvas(canvasRef.current, elements, { ink: colors.ink });

    if (selectedId) {
      drawSelectionBox(canvasRef.current, selectedId, elements, colors.accent);
    }
  }, [elements, selectedId, colors, viewport]);

  /*
   * Load drawing
   */

  useEffect(() => {
    if (!id) return;

    const loadDrawing = async () => {
      try {
        const result = await api<{
          success: boolean;
          data: {
            name: string;
            elements: DrawingElement[];
          };
        }>(`/api/drawings/${id}`);

        setElements(result.data.elements);

        setName(result.data.name);

        savedNameRef.current = result.data.name;
      } catch (error) {
        console.error("Failed to load drawing:", error);
      } finally {
        setLoaded(true);
      }
    };

    loadDrawing();
  }, [id]);

  /*
   * WebSocket
   */

  useEffect(() => {
    if (!id) return;

    const websocket = new DrawingWebSocket();

    websocketRef.current = websocket;

    websocket.connect();

    websocket.send({
      type: "drawing:join",
      drawingId: id,
    });

    // Remote changes are already saved by the client that made
    // them, so they don't mark this tab as unsaved or touch undo.
    const unsubscribe = websocket.subscribe((message) => {
      if (!("drawingId" in message) || message.drawingId !== id) {
        return;
      }

      switch (message.type) {
        case "element:create": {
          const element = message.element;

          if (!isDrawingElement(element)) return;

          setElements((prev) =>
            prev.some((e) => e.id === element.id) ? prev : [...prev, element]
          );

          break;
        }

        case "element:update": {
          const element = message.element;

          if (!isDrawingElement(element)) return;

          setElements((prev) => prev.map((e) => (e.id === element.id ? element : e)));

          break;
        }

        case "element:delete": {
          setElements((prev) => prev.filter((e) => e.id !== message.elementId));

          setSelectedId((prev) => (prev === message.elementId ? null : prev));

          break;
        }

        case "elements:replace": {
          if (
            !Array.isArray(message.elements) ||
            !message.elements.every(isDrawingElement)
          ) {
            return;
          }

          setElements(message.elements as DrawingElement[]);

          break;
        }
      }
    });

    return () => {
      unsubscribe();
      websocket.disconnect();
    };
  }, [id]);

  /*
   * History helper
   */

  const updateElements = (next: DrawingElement[]) => {
    setHistory((prev) => [...prev, elements]);

    setFuture([]);

    setElements(next);
    setSaveStatus("unsaved");
  };

  /*
   * Autosave
   */

  useEffect(() => {
    if (!id) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    if (saveStatus !== "unsaved") {
      return;
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      setSaveStatus("saving");

      try {
        await api(`/api/drawings/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            elements,
          }),
        });

        // Edits made while the request was in flight leave the
        // status as "unsaved" so they get saved on the next pass.
        setSaveStatus((prev) => (prev === "saving" ? "saved" : prev));
      } catch (error) {
        console.error("Autosave failed:", error);

        setSaveStatus("unsaved");
      }
    }, 800);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [elements, id, saveStatus]);

  /*
   * Rename
   */

  const commitName = async () => {
    const trimmed = name.trim();

    if (!trimmed || trimmed === savedNameRef.current) {
      setName(savedNameRef.current);
      return;
    }

    setName(trimmed);

    try {
      await api(`/api/drawings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });

      savedNameRef.current = trimmed;
    } catch (error) {
      console.error("Rename failed:", error);

      setName(savedNameRef.current);
    }
  };

  /*
   * Mouse position
   */

  const getPoint = (event: React.PointerEvent) => {
    const canvas = canvasRef.current!;

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  /*
   * Hit testing
   */

  const findElementAtPoint = (point: { x: number; y: number }) => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];

      if (element.type === "rectangle" || element.type === "ellipse") {
        const width = element.width || 0;

        const height = element.height || 0;

        const minX = Math.min(element.x, element.x + width);

        const maxX = Math.max(element.x, element.x + width);

        const minY = Math.min(element.y, element.y + height);

        const maxY = Math.max(element.y, element.y + height);

        if (
          point.x >= minX &&
          point.x <= maxX &&
          point.y >= minY &&
          point.y <= maxY
        ) {
          return element;
        }
      }

      if (element.type === "text") {
        if (
          point.x >= element.x &&
          point.x <= element.x + 150 &&
          point.y <= element.y &&
          point.y >= element.y - 30
        ) {
          return element;
        }
      }

      if (
        element.type === "line" ||
        element.type === "arrow" ||
        element.type === "pencil"
      ) {
        const points = element.points || [];

        for (const p of points) {
          const distance = Math.hypot(point.x - p.x, point.y - p.y);

          if (distance < 10) {
            return element;
          }
        }
      }
    }

    return null;
  };

  /*
   * Text
   */

  const commitText = () => {
    const draft = textDraft;

    setTextDraft(null);

    if (cancelTextRef.current) {
      cancelTextRef.current = false;
      return;
    }

    const text = draft?.value.trim();

    if (!draft || !text) return;

    const element: DrawingElement = {
      id: crypto.randomUUID(),
      type: "text",
      x: draft.x,
      y: draft.y,
      text,
      strokeColor: "#000000",
      strokeWidth: 2,
    };

    updateElements([...elements, element]);

    websocketRef.current?.send({
      type: "element:create",
      drawingId: id as string,
      element,
    });
  };

  /*
   * Pointer down
   */

  const pointerDown = (event: React.PointerEvent) => {
    const point = getPoint(event);

    /*
     * SELECT
     */

    if (tool === "select") {
      const element = findElementAtPoint(point);

      if (!element) {
        setSelectedId(null);
        return;
      }

      setSelectedId(element.id);

      dragOffsetRef.current = {
        x: point.x - element.x,
        y: point.y - element.y,
      };

      dragStartElementsRef.current = elements;

      isDrawing.current = true;

      return;
    }

    /*
     * TEXT
     */

    if (tool === "text") {
      // Keep focus from moving to the canvas so the new input keeps it.
      event.preventDefault();

      setTextDraft({ x: point.x, y: point.y, value: "" });

      return;
    }

    /*
     * DRAWING
     */

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

    drawingRef.current = element;

    setHistory((prev) => [...prev, elements]);

    setFuture([]);

    setElements((prev) => [...prev, element]);

    setSaveStatus("unsaved");
  };

  /*
   * Pointer move
   */

  const pointerMove = (event: React.PointerEvent) => {
    if (!isDrawing.current) {
      return;
    }

    const point = getPoint(event);

    /*
     * MOVE SELECTED ELEMENT
     */

    if (tool === "select" && selectedId) {
      const next = elements.map((element) => {
        if (element.id !== selectedId) {
          return element;
        }

        const dx = point.x - dragOffsetRef.current.x;

        const dy = point.y - dragOffsetRef.current.y;

        const offsetX = dx - element.x;

        const offsetY = dy - element.y;

        return {
          ...element,
          x: dx,
          y: dy,
          points: element.points?.map((p) => ({
            x: p.x + offsetX,
            y: p.y + offsetY,
          })),
        };
      });

      setElements(next);
      setSaveStatus("unsaved");

      return;
    }

    /*
     * DRAW
     */

    const current = drawingRef.current;

    if (!current) return;

    if (current.type === "rectangle" || current.type === "ellipse") {
      current.width = point.x - current.x;

      current.height = point.y - current.y;
    }

    if (current.type === "line" || current.type === "arrow") {
      current.points = [
        {
          x: current.x,
          y: current.y,
        },
        point,
      ];
    }

    if (current.type === "pencil") {
      current.points = [...(current.points || []), point];
    }

    // Match by id: a remote element may have been appended
    // after the one being drawn.
    setElements((prev) =>
      prev.map((element) => (element.id === current.id ? { ...current } : element))
    );

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

    if (tool === "select" && selectedId) {
      const before = dragStartElementsRef.current;

      dragStartElementsRef.current = null;

      // A click without a drag changes nothing.
      if (!before || before === elements) {
        return;
      }

      setHistory((prev) => [...prev, before]);

      setFuture([]);

      websocketRef.current?.send({
        type: "element:update",
        drawingId: id as string,
        elementId: selectedId,
        element: elements.find((element) => element.id === selectedId),
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
        element: drawingRef.current,
      });
    }

    drawingRef.current = null;
  };

  /*
   * Delete
   */

  const deleteSelected = () => {
    if (!selectedId) return;

    const next = elements.filter((element) => element.id !== selectedId);

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

    const previous = history[history.length - 1];

    setHistory(history.slice(0, -1));

    setFuture((prev) => [...prev, elements]);

    setElements(previous);
    setSaveStatus("unsaved");

    websocketRef.current?.send({
      type: "elements:replace",
      drawingId: id as string,
      elements: previous,
    });
  };

  /*
   * Redo
   */

  const redo = () => {
    if (future.length === 0) {
      return;
    }

    const next = future[future.length - 1];

    setFuture(future.slice(0, -1));

    setHistory((prev) => [...prev, elements]);

    setElements(next);
    setSaveStatus("unsaved");

    websocketRef.current?.send({
      type: "elements:replace",
      drawingId: id as string,
      elements: next,
    });
  };

  /*
   * Keyboard shortcuts
   */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;

      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;

      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelected();
      }

      if (event.key === "Escape") {
        setSelectedId(null);
      }

      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }

      if (!modifier && !event.altKey) {
        const key = event.key.toLowerCase();

        const option = TOOLS.find((t) => t.shortcut === key || t.letter === key);

        if (option) {
          setTool(option.tool);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  return (
    <div className="board" data-tool={tool}>
      <canvas
        ref={canvasRef}
        className="board-canvas"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />

      {textDraft && (
        <input
          autoFocus
          className="text-draft"
          style={{
            left: textDraft.x,
            top: textDraft.y - 19,
            font: TEXT_FONT,
            color: colors.ink,
          }}
          value={textDraft.value}
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }

            if (e.key === "Escape") {
              cancelTextRef.current = true;
              e.currentTarget.blur();
            }
          }}
          aria-label="Text"
          placeholder="Type…"
        />
      )}

      {loaded && elements.length === 0 && !textDraft && (
        <p className="board-hint">
          Pick a tool and start drawing
          <small>Press 1–7 to switch tools</small>
        </p>
      )}

      <header className="board-top">
        <div className="island board-title">
          <Link
            to="/dashboard"
            className="icon-button"
            aria-label="Back to drawings"
            title="Back to drawings"
          >
            <ArrowLeftIcon />
          </Link>

          <input
            className="name-input"
            value={name}
            maxLength={100}
            aria-label="Drawing name"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }

              if (e.key === "Escape") {
                setName(savedNameRef.current);
                e.currentTarget.blur();
              }
            }}
          />
        </div>

        <div className="island toolbar" role="toolbar" aria-label="Tools">
          {TOOLS.map((option) => (
            <button
              key={option.tool}
              className={`tool-button${tool === option.tool ? " active" : ""}`}
              aria-pressed={tool === option.tool}
              aria-label={option.label}
              title={`${option.label} — ${option.letter.toUpperCase()} or ${option.shortcut}`}
              onClick={() => setTool(option.tool)}
            >
              {option.icon}
              <span className="tool-key">{option.shortcut}</span>
            </button>
          ))}
        </div>

        <div className={`island save-status ${saveStatus}`} role="status">
          {saveStatus === "saved" && (
            <>
              <CheckIcon />
              Saved
            </>
          )}

          {saveStatus === "saving" && (
            <>
              <span className="spinner" aria-hidden="true" />
              Saving…
            </>
          )}

          {saveStatus === "unsaved" && (
            <>
              <span className="status-dot" aria-hidden="true" />
              Unsaved
            </>
          )}
        </div>
      </header>

      <footer className="board-bottom">
        <div className="island">
          <button
            className="icon-button"
            onClick={undo}
            disabled={history.length === 0}
            aria-label="Undo"
            title="Undo — Ctrl+Z"
          >
            <UndoIcon />
          </button>

          <button
            className="icon-button"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Redo"
            title="Redo — Ctrl+Shift+Z"
          >
            <RedoIcon />
          </button>
        </div>

        {selectedId && (
          <div className="island">
            <button
              className="icon-button danger"
              onClick={deleteSelected}
              aria-label="Delete selected"
              title="Delete — Del"
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

/*
 * Validate elements received over the WebSocket
 */

function isDrawingElement(value: unknown): value is DrawingElement {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const element = value as Record<string, unknown>;

  return (
    typeof element.id === "string" &&
    typeof element.type === "string" &&
    typeof element.x === "number" &&
    typeof element.y === "number"
  );
}

/*
 * Draw selection rectangle
 */

function drawSelectionBox(
  canvas: HTMLCanvasElement,
  selectedId: string,
  elements: DrawingElement[],
  color: string
) {
  const element = elements.find((item) => item.id === selectedId);

  if (!element) return;

  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  let x = element.x;
  let y = element.y;
  let width = element.width || 100;
  let height = element.height || 30;

  if (element.type === "text") {
    ctx.font = TEXT_FONT;

    width = ctx.measureText(element.text || "").width;
    height = 24;
    y = element.y - 19;
  }

  if (
    element.type === "line" ||
    element.type === "arrow" ||
    element.type === "pencil"
  ) {
    const points = element.points || [];

    if (points.length === 0) {
      return;
    }

    const xs = points.map((p) => p.x);

    const ys = points.map((p) => p.y);

    x = Math.min(...xs);
    y = Math.min(...ys);
    width = Math.max(...xs) - x;
    height = Math.max(...ys) - y;
  }

  // Normalize shapes drawn up or to the left (negative width/height).
  if (width < 0) {
    x += width;
    width = -width;
  }

  if (height < 0) {
    y += height;
    height = -height;
  }

  ctx.save();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);

  ctx.beginPath();
  ctx.roundRect(x - 6, y - 6, width + 12, height + 12, 6);
  ctx.stroke();

  ctx.restore();
}
