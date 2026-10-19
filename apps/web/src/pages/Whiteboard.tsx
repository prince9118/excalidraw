import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Link, useParams } from "react-router-dom";

import { api } from "../services/api";

import type {
  DrawingElement,
  ElementStyle,
  ElementType,
  Point,
} from "../canvas/types";

import {
  DEFAULT_STROKE,
  TRANSPARENT,
  exportToBlob,
  renderCanvas,
  renderSelection,
} from "../canvas/renderer";

import {
  DEFAULT_FONT_SIZE,
  constrainPoint,
  getElementAtPoint,
  getElementBounds,
  getElementsBounds,
  getHandleAtPoint,
  getHandleTarget,
  isBoxShape,
  measureText,
  resizeElement,
  textFont,
  translateElement,
  type Handle,
} from "../canvas/geometry";

import { DrawingWebSocket, type WebSocketMessage } from "../services/websocket";

import { useTheme } from "../services/theme";

import StylePanel from "../components/StylePanel";
import ShortcutsDialog from "../components/ShortcutsDialog";
import { ThemeSwitcher } from "../components/ThemeSwitcher";

import {
  ArrowIcon,
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  DiamondIcon,
  DownloadIcon,
  EllipseIcon,
  EraserIcon,
  FitIcon,
  HandIcon,
  KeyboardIcon,
  LineIcon,
  MenuIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RectangleIcon,
  RedoIcon,
  SelectIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
} from "../components/icons";

type Tool = ElementType | "select" | "hand" | "eraser";

interface ToolOption {
  tool: Tool;
  label: string;
  // Number shortcut shown on the button; `letter` also selects it.
  shortcut?: string;
  letter: string;
  icon: ReactNode;
}

const TOOLS: ToolOption[] = [
  { tool: "hand", label: "Hand", letter: "h", icon: <HandIcon /> },
  { tool: "select", label: "Select", shortcut: "1", letter: "v", icon: <SelectIcon /> },
  { tool: "rectangle", label: "Rectangle", shortcut: "2", letter: "r", icon: <RectangleIcon /> },
  { tool: "diamond", label: "Diamond", shortcut: "3", letter: "d", icon: <DiamondIcon /> },
  { tool: "ellipse", label: "Ellipse", shortcut: "4", letter: "o", icon: <EllipseIcon /> },
  { tool: "arrow", label: "Arrow", shortcut: "5", letter: "a", icon: <ArrowIcon /> },
  { tool: "line", label: "Line", shortcut: "6", letter: "l", icon: <LineIcon /> },
  { tool: "pencil", label: "Pencil", shortcut: "7", letter: "p", icon: <PencilIcon /> },
  { tool: "text", label: "Text", shortcut: "8", letter: "t", icon: <TextIcon /> },
  { tool: "eraser", label: "Eraser", shortcut: "0", letter: "e", icon: <EraserIcon /> },
];

const DEFAULT_STYLE: ElementStyle = {
  strokeColor: DEFAULT_STROKE,
  backgroundColor: TRANSPARENT,
  strokeWidth: 2,
  strokeStyle: "solid",
  opacity: 100,
  fontSize: DEFAULT_FONT_SIZE,
};

const STYLE_KEYS = Object.keys(DEFAULT_STYLE) as (keyof ElementStyle)[];

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const HISTORY_LIMIT = 100;
const GRID_SIZE = 22;
const CLIPBOARD_KEY = "canvora-clipboard";

// screen = world * zoom + (x, y)
interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface TextDraft {
  // World position of the text baseline.
  x: number;
  y: number;
  value: string;
  // Set when editing an existing text element.
  editingId?: string;
}

type Interaction =
  | { kind: "draw"; element: DrawingElement; origin: Point }
  | { kind: "move"; id: string; start: Point; original: DrawingElement; before: DrawingElement[] }
  | {
      kind: "resize";
      id: string;
      handle: Handle;
      // Pointer → dragged corner, so grabbing a handle doesn't make it jump.
      grab: Point;
      original: DrawingElement;
      before: DrawingElement[];
    }
  | { kind: "pan"; start: Point; camera: Camera }
  | { kind: "erase" };

interface CanvasColors {
  ink: string;
  accent: string;
  surface: string;
  background: string;
}

// `theme` is only a cache key: the colors come from the CSS variables,
// which are already updated when it changes.
function readCanvasColors(_theme: string): CanvasColors {
  const style = getComputedStyle(document.documentElement);

  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    ink: read("--canvas-ink", "#1e1e1e"),
    accent: read("--accent", "#6965db"),
    surface: read("--surface", "#ffffff"),
    background: read("--canvas-bg", "#ffffff"),
  };
}

const HANDLE_CURSORS: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  start: "move",
  end: "move",
};

function pickStyle(element: DrawingElement): ElementStyle {
  return {
    strokeColor: element.strokeColor ?? DEFAULT_STYLE.strokeColor,
    backgroundColor: element.backgroundColor ?? DEFAULT_STYLE.backgroundColor,
    strokeWidth: element.strokeWidth ?? DEFAULT_STYLE.strokeWidth,
    strokeStyle: element.strokeStyle ?? DEFAULT_STYLE.strokeStyle,
    opacity: element.opacity ?? DEFAULT_STYLE.opacity,
    fontSize: element.fontSize ?? DEFAULT_STYLE.fontSize,
  };
}

export default function Whiteboard() {
  const { id } = useParams();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const websocketRef = useRef<DrawingWebSocket | null>(null);

  const saveTimeoutRef = useRef<number | null>(null);

  const interactionRef = useRef<Interaction | null>(null);

  const erasingRef = useRef<Set<string>>(new Set());

  const textDraftRef = useRef<TextDraft | null>(null);

  const cancelTextRef = useRef(false);

  const savedNameRef = useRef("");

  const lastPointerRef = useRef<Point | null>(null);

  // Consecutive edits with the same key (e.g. dragging the opacity
  // slider or holding an arrow key) share a single undo step.
  const coalesceKeyRef = useRef<string | null>(null);

  const toastTimeoutRef = useRef<number | null>(null);

  const [elements, setElements] = useState<DrawingElement[]>([]);

  const [tool, setTool] = useState<Tool>("select");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [history, setHistory] = useState<DrawingElement[][]>([]);

  const [future, setFuture] = useState<DrawingElement[][]>([]);

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

  const [name, setName] = useState("");

  const [loaded, setLoaded] = useState(false);

  const [textDraft, setTextDraftState] = useState<TextDraft | null>(null);

  const [style, setStyle] = useState<ElementStyle>(DEFAULT_STYLE);

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });

  const [erasing, setErasing] = useState<ReadonlySet<string>>(new Set());

  const [spaceHeld, setSpaceHeld] = useState(false);

  const [panning, setPanning] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const { resolved: theme } = useTheme();

  // The theme's CSS variables are already applied when `theme` changes.
  const colors = useMemo(() => readCanvasColors(theme), [theme]);

  // Bumped on resize so the render effect redraws the resized canvas.
  const [viewport, setViewport] = useState(0);

  const selectedElement = selectedId
    ? elements.find((element) => element.id === selectedId) ?? null
    : null;

  const setTextDraft = (draft: TextDraft | null) => {
    textDraftRef.current = draft;
    setTextDraftState(draft);
  };

  const showToast = useCallback((message: string) => {
    setToast(message);

    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);

    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const send = (message: WebSocketMessage) => {
    websocketRef.current?.send(message);
  };

  const sendUpdate = (element: DrawingElement) => {
    send({
      type: "element:update",
      drawingId: id as string,
      elementId: element.id,
      element,
    });
  };

  const sendReplace = (next: DrawingElement[]) => {
    send({
      type: "elements:replace",
      drawingId: id as string,
      elements: next,
    });
  };

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
   * Render
   */

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const transform = { scale: camera.zoom, offsetX: camera.x, offsetY: camera.y };

    // The text being edited is shown by the input instead.
    const visible = textDraft?.editingId
      ? elements.filter((element) => element.id !== textDraft.editingId)
      : elements;

    renderCanvas(canvas, visible, { ink: colors.ink, fadedIds: erasing, ...transform });

    if (selectedElement && !textDraft) {
      renderSelection(canvas, selectedElement, colors.accent, colors.surface, transform);
    }
  }, [elements, selectedElement, colors, viewport, camera, erasing, textDraft]);

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
   * History helpers
   */

  const pushHistory = (snapshot: DrawingElement[]) => {
    setHistory((prev) => [...prev, snapshot].slice(-HISTORY_LIMIT));

    setFuture([]);
  };

  const updateElements = (next: DrawingElement[], coalesceKey: string | null = null) => {
    if (coalesceKey === null || coalesceKey !== coalesceKeyRef.current) {
      pushHistory(elements);
    }

    coalesceKeyRef.current = coalesceKey;

    setElements(next);
    setSaveStatus("unsaved");
  };

  const replaceElement = (next: DrawingElement, coalesceKey: string | null = null) => {
    updateElements(
      elements.map((element) => (element.id === next.id ? next : element)),
      coalesceKey
    );

    sendUpdate(next);
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
   * Coordinates
   */

  const getScreenPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const toWorld = (screen: Point, cam = camera): Point => ({
    x: (screen.x - cam.x) / cam.zoom,
    y: (screen.y - cam.y) / cam.zoom,
  });

  const hitTolerance = 6 / camera.zoom;

  /*
   * Zoom
   */

  const zoomAt = useCallback((factor: number, screen?: Point) => {
    setCamera((cam) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));

      const anchor = screen ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };

      // Keep the world point under the anchor fixed.
      return {
        zoom,
        x: anchor.x - ((anchor.x - cam.x) * zoom) / cam.zoom,
        y: anchor.y - ((anchor.y - cam.y) * zoom) / cam.zoom,
      };
    });
  }, []);

  const resetZoom = () => zoomAt(1 / camera.zoom);

  const zoomToFit = () => {
    const bounds = getElementsBounds(elements);

    if (!bounds) {
      setCamera({ x: 0, y: 0, zoom: 1 });
      return;
    }

    const padding = 96;
    const width = Math.max(bounds.maxX - bounds.minX, 1);
    const height = Math.max(bounds.maxY - bounds.minY, 1);

    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (window.innerWidth - padding * 2) / width,
          (window.innerHeight - padding * 2) / height,
          1
        )
      )
    );

    setCamera({
      zoom,
      x: window.innerWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom,
      y: window.innerHeight / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom,
    });
  };

  // Wheel scrolls the canvas; Ctrl/⌘+wheel (and trackpad pinch) zooms.
  // Attached natively because React's wheel listener is passive.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      if (event.ctrlKey || event.metaKey) {
        const rect = canvas.getBoundingClientRect();

        // Clamped so a mouse-wheel notch (~100) zooms ~28% while a
        // trackpad pinch (small deltas) stays smooth.
        const delta = Math.max(-25, Math.min(25, event.deltaY));

        zoomAt(Math.exp(-delta * 0.01), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });

        return;
      }

      const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;

      setCamera((cam) => ({ ...cam, x: cam.x - dx, y: cam.y - dy }));
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [zoomAt]);

  /*
   * Text
   */

  const commitText = () => {
    const draft = textDraftRef.current;

    // Blur and an outside click can both commit; only the first counts.
    if (!draft) return;

    setTextDraft(null);

    if (cancelTextRef.current) {
      cancelTextRef.current = false;
      return;
    }

    const text = draft.value.trim();

    if (draft.editingId) {
      const original = elements.find((element) => element.id === draft.editingId);

      if (!original || original.text === text) return;

      if (!text) {
        updateElements(elements.filter((element) => element.id !== original.id));

        send({ type: "element:delete", drawingId: id as string, elementId: original.id });

        return;
      }

      replaceElement({ ...original, text });

      return;
    }

    if (!text) return;

    const element: DrawingElement = {
      id: crypto.randomUUID(),
      type: "text",
      x: draft.x,
      y: draft.y,
      text,
      strokeColor: style.strokeColor,
      fontSize: style.fontSize,
      opacity: style.opacity,
    };

    updateElements([...elements, element]);

    send({ type: "element:create", drawingId: id as string, element });
  };

  const startTextAt = (world: Point) => {
    setSelectedId(null);
    setTextDraft({ x: world.x, y: world.y, value: "" });
  };

  const editText = (element: DrawingElement) => {
    setSelectedId(element.id);
    setTextDraft({ x: element.x, y: element.y, value: element.text ?? "", editingId: element.id });
  };

  /*
   * Pointer down
   */

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (textDraftRef.current) {
      commitText();
      return;
    }

    setMenuOpen(false);

    const screen = getScreenPoint(event);
    const point = toWorld(screen);

    /*
     * PAN — hand tool, space+drag or middle mouse button
     */

    if (tool === "hand" || spaceHeld || event.button === 1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      interactionRef.current = { kind: "pan", start: screen, camera };
      setPanning(true);

      return;
    }

    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    /*
     * SELECT
     */

    if (tool === "select") {
      if (selectedElement) {
        const handle = getHandleAtPoint(selectedElement, point, camera.zoom);

        if (handle) {
          const corner = getHandleTarget(selectedElement, handle);

          interactionRef.current = {
            kind: "resize",
            id: selectedElement.id,
            handle,
            grab: { x: corner.x - point.x, y: corner.y - point.y },
            original: selectedElement,
            before: elements,
          };

          return;
        }
      }

      const element = getElementAtPoint(elements, point, hitTolerance);

      if (!element) {
        setSelectedId(null);
        return;
      }

      setSelectedId(element.id);

      interactionRef.current = {
        kind: "move",
        id: element.id,
        start: point,
        original: element,
        before: elements,
      };

      return;
    }

    /*
     * TEXT
     */

    if (tool === "text") {
      // Keep focus from moving to the canvas so the new input keeps it.
      event.preventDefault();

      const existing = getElementAtPoint(elements, point, hitTolerance);

      if (existing?.type === "text") {
        editText(existing);
      } else {
        startTextAt(point);
      }

      return;
    }

    /*
     * ERASER
     */

    if (tool === "eraser") {
      interactionRef.current = { kind: "erase" };
      erasingRef.current = new Set();

      eraseAt(point);

      return;
    }

    /*
     * DRAWING
     */

    const element: DrawingElement = {
      id: crypto.randomUUID(),
      type: tool,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      points: [point],
      strokeColor: style.strokeColor,
      backgroundColor: isBoxShape({ type: tool } as DrawingElement)
        ? style.backgroundColor
        : TRANSPARENT,
      strokeWidth: style.strokeWidth,
      strokeStyle: style.strokeStyle,
      opacity: style.opacity,
    };

    interactionRef.current = { kind: "draw", element, origin: point };

    setSelectedId(null);

    pushHistory(elements);
    coalesceKeyRef.current = null;

    setElements((prev) => [...prev, element]);

    setSaveStatus("unsaved");
  };

  const eraseAt = (point: Point) => {
    const hit = getElementAtPoint(
      elements.filter((element) => !erasingRef.current.has(element.id)),
      point,
      hitTolerance * 1.5
    );

    if (!hit) return;

    erasingRef.current.add(hit.id);
    setErasing(new Set(erasingRef.current));
  };

  /*
   * Pointer move
   */

  const updateHoverCursor = (point: Point) => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    let cursor = "";

    if (tool === "select" && !spaceHeld) {
      const handle = selectedElement && getHandleAtPoint(selectedElement, point, camera.zoom);

      if (handle) {
        cursor = HANDLE_CURSORS[handle];
      } else if (getElementAtPoint(elements, point, hitTolerance)) {
        cursor = "move";
      }
    }

    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const screen = getScreenPoint(event);
    const point = toWorld(screen);

    lastPointerRef.current = point;

    const interaction = interactionRef.current;

    if (!interaction) {
      updateHoverCursor(point);
      return;
    }

    switch (interaction.kind) {
      case "pan": {
        setCamera({
          ...interaction.camera,
          x: interaction.camera.x + screen.x - interaction.start.x,
          y: interaction.camera.y + screen.y - interaction.start.y,
        });

        return;
      }

      case "move": {
        const moved = translateElement(
          interaction.original,
          point.x - interaction.start.x,
          point.y - interaction.start.y
        );

        setElements((prev) => prev.map((e) => (e.id === interaction.id ? moved : e)));
        setSaveStatus("unsaved");

        return;
      }

      case "resize": {
        const resized = resizeElement(interaction.original, interaction.handle, {
          x: point.x + interaction.grab.x,
          y: point.y + interaction.grab.y,
        });

        setElements((prev) => prev.map((e) => (e.id === interaction.id ? resized : e)));
        setSaveStatus("unsaved");

        return;
      }

      case "erase": {
        eraseAt(point);

        return;
      }

      case "draw": {
        const current = interaction.element;
        const { origin } = interaction;

        const target = event.shiftKey
          ? constrainPoint(origin, point, current.type === "line" || current.type === "arrow")
          : point;

        let next: DrawingElement;

        if (isBoxShape(current)) {
          next = { ...current, width: target.x - origin.x, height: target.y - origin.y };
        } else if (current.type === "pencil") {
          next = { ...current, points: [...(current.points || []), point] };
        } else {
          next = { ...current, points: [origin, target] };
        }

        interaction.element = next;

        // Match by id: a remote element may have been appended
        // after the one being drawn.
        setElements((prev) => prev.map((e) => (e.id === next.id ? next : e)));

        setSaveStatus("unsaved");

        return;
      }
    }
  };

  /*
   * Pointer up
   */

  const pointerUp = () => {
    const interaction = interactionRef.current;

    interactionRef.current = null;

    if (!interaction) return;

    switch (interaction.kind) {
      case "pan": {
        setPanning(false);

        return;
      }

      case "move":
      case "resize": {
        const current = elements.find((e) => e.id === interaction.id);

        // A click without a drag changes nothing.
        if (!current || current === interaction.original) return;

        pushHistory(interaction.before);
        coalesceKeyRef.current = null;

        sendUpdate(current);

        return;
      }

      case "erase": {
        const ids = erasingRef.current;

        erasingRef.current = new Set();
        setErasing(new Set());

        if (ids.size === 0) return;

        updateElements(elements.filter((element) => !ids.has(element.id)));

        for (const elementId of ids) {
          send({ type: "element:delete", drawingId: id as string, elementId });
        }

        if (selectedId && ids.has(selectedId)) setSelectedId(null);

        return;
      }

      case "draw": {
        let element = interaction.element;

        const bounds = getElementBounds(element);
        const tiny =
          bounds.maxX - bounds.minX < 2 / camera.zoom &&
          bounds.maxY - bounds.minY < 2 / camera.zoom;

        // A click with a shape or line tool leaves nothing behind.
        if (tiny && element.type !== "pencil") {
          setElements((prev) => prev.filter((e) => e.id !== element.id));
          setHistory((prev) => prev.slice(0, -1));

          return;
        }

        if (isBoxShape(element)) {
          // Store shapes with a positive width/height.
          element = {
            ...element,
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
          };

          const normalized = element;

          setElements((prev) => prev.map((e) => (e.id === normalized.id ? normalized : e)));
        }

        send({ type: "element:create", drawingId: id as string, element });

        return;
      }
    }
  };

  const doubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "select") return;

    const point = toWorld(getScreenPoint(event));
    const element = getElementAtPoint(elements, point, hitTolerance);

    if (!element) {
      startTextAt(point);
    } else if (element.type === "text") {
      editText(element);
    }
  };

  /*
   * Selection actions
   */

  const deleteSelected = () => {
    if (!selectedId) return;

    updateElements(elements.filter((element) => element.id !== selectedId));

    send({ type: "element:delete", drawingId: id as string, elementId: selectedId });

    setSelectedId(null);
  };

  const insertElement = (element: DrawingElement) => {
    updateElements([...elements, element]);

    send({ type: "element:create", drawingId: id as string, element });

    setSelectedId(element.id);
    setTool("select");
  };

  const duplicateSelected = () => {
    if (!selectedElement) return;

    insertElement({
      ...translateElement(selectedElement, 16, 16),
      id: crypto.randomUUID(),
    });
  };

  const copySelected = () => {
    if (!selectedElement) return false;

    // Stored in localStorage so it can be pasted into another drawing.
    try {
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(selectedElement));
    } catch {
      return false;
    }

    return true;
  };

  const paste = () => {
    let element: unknown;

    try {
      element = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) ?? "null");
    } catch {
      return;
    }

    if (!isDrawingElement(element)) return;

    // Center the pasted element on the pointer, or the screen center.
    const target =
      lastPointerRef.current ??
      toWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    const bounds = getElementBounds(element);

    insertElement({
      ...translateElement(
        element,
        target.x - (bounds.minX + bounds.maxX) / 2,
        target.y - (bounds.minY + bounds.maxY) / 2
      ),
      id: crypto.randomUUID(),
    });
  };

  const reorderSelected = (toFront: boolean) => {
    if (!selectedElement) return;

    const rest = elements.filter((element) => element.id !== selectedElement.id);
    const next = toFront ? [...rest, selectedElement] : [selectedElement, ...rest];

    if (next.every((element, i) => element === elements[i])) return;

    updateElements(next);
    sendReplace(next);
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (!selectedElement) return;

    replaceElement(translateElement(selectedElement, dx, dy), `nudge:${selectedElement.id}`);
  };

  /*
   * Style
   */

  const panelType: ElementType | null = selectedElement
    ? selectedElement.type
    : tool === "select" || tool === "hand" || tool === "eraser"
      ? null
      : tool;

  const panelStyle = selectedElement ? pickStyle(selectedElement) : style;

  const applyStyle = (patch: Partial<ElementStyle>) => {
    setStyle((prev) => ({ ...prev, ...patch }));

    if (!selectedElement) return;

    const key = Object.keys(patch).filter((k) => STYLE_KEYS.includes(k as keyof ElementStyle));

    replaceElement({ ...selectedElement, ...patch }, `style:${selectedElement.id}:${key.join()}`);
  };

  /*
   * Undo / redo
   */

  const undo = () => {
    if (history.length === 0) {
      return;
    }

    const previous = history[history.length - 1];

    setHistory(history.slice(0, -1));

    setFuture((prev) => [...prev, elements]);

    coalesceKeyRef.current = null;

    setElements(previous);
    setSaveStatus("unsaved");

    if (selectedId && !previous.some((element) => element.id === selectedId)) {
      setSelectedId(null);
    }

    sendReplace(previous);
  };

  const redo = () => {
    if (future.length === 0) {
      return;
    }

    const next = future[future.length - 1];

    setFuture(future.slice(0, -1));

    setHistory((prev) => [...prev, elements]);

    coalesceKeyRef.current = null;

    setElements(next);
    setSaveStatus("unsaved");

    if (selectedId && !next.some((element) => element.id === selectedId)) {
      setSelectedId(null);
    }

    sendReplace(next);
  };

  /*
   * Menu actions
   */

  const exportPng = async (toClipboard: boolean) => {
    setMenuOpen(false);

    if (elements.length === 0) {
      showToast("Nothing to export yet");
      return;
    }

    const blob = await exportToBlob(elements, {
      ink: colors.ink,
      background: colors.background,
    });

    if (!blob) return;

    if (toClipboard) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);

        showToast("Copied PNG to clipboard");
      } catch {
        showToast("Your browser blocked clipboard access");
      }

      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${(name.trim() || "drawing").replace(/[\\/:*?"<>|]/g, "-")}.png`;
    link.click();

    URL.revokeObjectURL(url);

    showToast("Exported PNG");
  };

  const clearCanvas = () => {
    setMenuOpen(false);

    if (elements.length === 0) return;

    updateElements([]);
    sendReplace([]);
    setSelectedId(null);

    showToast("Canvas cleared — press Ctrl+Z to undo");
  };

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  const closeHelp = useCallback(() => setHelpOpen(false), []);

  /*
   * Keyboard shortcuts
   */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target as HTMLElement)) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (event.key === " ") {
        // Stop the page from scrolling and buttons from activating.
        event.preventDefault();

        if (!event.repeat) setSpaceHeld(true);

        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelected();
        return;
      }

      if (event.key === "Escape") {
        setSelectedId(null);
        setMenuOpen(false);
        return;
      }

      if (event.key === "?") {
        setHelpOpen(true);
        return;
      }

      if (event.key.startsWith("Arrow") && selectedElement) {
        event.preventDefault();

        const step = (event.shiftKey ? 10 : 1) / camera.zoom;

        nudgeSelected(
          event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
          event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0
        );

        return;
      }

      if (event.shiftKey && !modifier && event.code === "Digit1") {
        event.preventDefault();
        zoomToFit();
        return;
      }

      if (modifier) {
        if (key === "z") {
          event.preventDefault();

          if (event.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (key === "y") {
          event.preventDefault();
          redo();
        } else if (key === "d") {
          event.preventDefault();
          duplicateSelected();
        } else if (key === "c") {
          copySelected();
        } else if (key === "x") {
          if (copySelected()) deleteSelected();
        } else if (key === "v") {
          paste();
        } else if (key === "=" || key === "+") {
          event.preventDefault();
          zoomAt(1.2);
        } else if (key === "-") {
          event.preventDefault();
          zoomAt(1 / 1.2);
        } else if (key === "0") {
          event.preventDefault();
          resetZoom();
        } else if (event.shiftKey && event.code === "BracketRight") {
          event.preventDefault();
          reorderSelected(true);
        } else if (event.shiftKey && event.code === "BracketLeft") {
          event.preventDefault();
          reorderSelected(false);
        }

        return;
      }

      if (!event.altKey && !event.shiftKey) {
        const option = TOOLS.find((t) => t.shortcut === key || t.letter === key);

        if (option) {
          setTool(option.tool);

          if (option.tool !== "select") setSelectedId(null);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") setSpaceHeld(false);
    };

    // Releasing space in another window would leave it stuck down.
    const handleBlur = () => setSpaceHeld(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  });

  /*
   * Render
   */

  const gridSize = GRID_SIZE * camera.zoom * (camera.zoom < 0.5 ? 2 : 1);

  const draftFontSize = textDraft?.editingId
    ? elements.find((e) => e.id === textDraft.editingId)?.fontSize ?? DEFAULT_FONT_SIZE
    : style.fontSize;

  const draftColor = (() => {
    const color = textDraft?.editingId
      ? elements.find((e) => e.id === textDraft.editingId)?.strokeColor
      : style.strokeColor;

    return !color || color === DEFAULT_STROKE ? colors.ink : color;
  })();

  return (
    <div
      className="board"
      data-tool={tool}
      data-panning={panning ? "active" : spaceHeld ? "ready" : undefined}
      style={{
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        className="board-canvas"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onPointerLeave={() => {
          if (!interactionRef.current) lastPointerRef.current = null;
        }}
        onDoubleClick={doubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />

      {textDraft && (
        <input
          autoFocus
          className="text-draft"
          style={{
            left: textDraft.x * camera.zoom + camera.x,
            top: (textDraft.y - draftFontSize * 1.05) * camera.zoom + camera.y,
            font: textFont(draftFontSize * camera.zoom),
            height: draftFontSize * 1.3 * camera.zoom,
            width: Math.max(120, (measureText(textDraft.value, draftFontSize) + 24) * camera.zoom),
            color: draftColor,
          }}
          value={textDraft.value}
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onBlur={commitText}
          onFocus={(e) => e.currentTarget.select()}
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
          <small>
            Press <kbd>R</kbd> for a rectangle, <kbd>P</kbd> to sketch, or <kbd>?</kbd> for
            all shortcuts
          </small>
        </p>
      )}

      <header className="board-top">
        <div className="island board-title" ref={menuRef}>
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

          <button
            className={`icon-button${menuOpen ? " active" : ""}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Menu"
          >
            <MenuIcon />
          </button>

          {menuOpen && (
            <div className="menu" role="menu">
              <button role="menuitem" className="menu-item" onClick={() => exportPng(false)}>
                <DownloadIcon />
                Export as PNG
              </button>

              <button role="menuitem" className="menu-item" onClick={() => exportPng(true)}>
                <CopyIcon />
                Copy PNG to clipboard
              </button>

              <button
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setHelpOpen(true);
                }}
              >
                <KeyboardIcon />
                Keyboard shortcuts
                <kbd className="menu-kbd">?</kbd>
              </button>

              <button
                role="menuitem"
                className="menu-item danger"
                onClick={clearCanvas}
                disabled={elements.length === 0}
              >
                <TrashIcon />
                Clear canvas
              </button>

              <div className="menu-divider" />

              <div className="menu-label">Theme</div>
              <ThemeSwitcher />
            </div>
          )}
        </div>

        <div className="island toolbar" role="toolbar" aria-label="Tools">
          {TOOLS.map((option) => (
            <button
              key={option.tool}
              className={`tool-button${tool === option.tool ? " active" : ""}${option.tool === "hand" ? " divided" : ""}`}
              aria-pressed={tool === option.tool}
              aria-label={option.label}
              title={`${option.label} — ${option.letter.toUpperCase()}${option.shortcut ? ` or ${option.shortcut}` : ""}`}
              onClick={() => {
                setTool(option.tool);

                if (option.tool !== "select") setSelectedId(null);
              }}
            >
              {option.icon}
              <span className="tool-key">{option.shortcut ?? option.letter.toUpperCase()}</span>
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

      {panelType && !textDraft?.editingId && (
        <StylePanel
          key={selectedElement ? "selection" : "tool"}
          type={panelType}
          style={panelStyle}
          onChange={applyStyle}
          selection={
            selectedElement
              ? {
                  onDuplicate: duplicateSelected,
                  onDelete: deleteSelected,
                  onBringToFront: () => reorderSelected(true),
                  onSendToBack: () => reorderSelected(false),
                }
              : undefined
          }
        />
      )}

      <footer className="board-bottom">
        <div className="island">
          <button
            className="icon-button"
            onClick={() => zoomAt(1 / 1.2)}
            disabled={camera.zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            title="Zoom out — Ctrl+−"
          >
            <MinusIcon />
          </button>

          <button
            className="zoom-value"
            onClick={resetZoom}
            aria-label="Reset zoom"
            title="Reset zoom — Ctrl+0"
          >
            {Math.round(camera.zoom * 100)}%
          </button>

          <button
            className="icon-button"
            onClick={() => zoomAt(1.2)}
            disabled={camera.zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            title="Zoom in — Ctrl++"
          >
            <PlusIcon />
          </button>

          <button
            className="icon-button"
            onClick={zoomToFit}
            aria-label="Zoom to fit"
            title="Zoom to fit — Shift+1"
          >
            <FitIcon />
          </button>
        </div>

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
      </footer>

      <button
        className="island help-button"
        onClick={() => setHelpOpen(true)}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts — ?"
      >
        ?
      </button>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {helpOpen && <ShortcutsDialog onClose={closeHelp} />}
    </div>
  );
}

// Shortcuts are skipped while typing, but not after using a slider,
// swatch or color picker in the style panel.
const NON_TEXT_INPUTS = new Set(["range", "color", "checkbox", "radio", "button"]);

function isTypingTarget(target: HTMLElement) {
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);

  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
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
