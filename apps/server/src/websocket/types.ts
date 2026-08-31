export type DrawingMessage =
  | {
      type: "drawing:join";
      drawingId: string;
    }
  | {
      type: "element:create";
      drawingId: string;
      element: unknown;
    }
  | {
      type: "element:update";
      drawingId: string;
      elementId: string;
      element?: unknown;
    }
  | {
      type: "element:delete";
      drawingId: string;
      elementId: string;
    };
