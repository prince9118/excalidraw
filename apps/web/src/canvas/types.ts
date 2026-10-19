export type ElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "line"
  | "arrow"
  | "pencil"
  | "text";

export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface Point {
  x: number;
  y: number;
}

export interface DrawingElement {
  id: string;
  type: ElementType;

  x: number;
  y: number;

  width?: number;
  height?: number;

  points?: Point[];

  text?: string;
  fontSize?: number;

  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  // 0–100; missing means fully opaque.
  opacity?: number;
}

// Style applied to new elements and edited from the style panel.
export type ElementStyle = Required<
  Pick<
    DrawingElement,
    | "strokeColor"
    | "backgroundColor"
    | "strokeWidth"
    | "strokeStyle"
    | "opacity"
    | "fontSize"
  >
>;
