export type ElementType =
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "pencil"
  | "text";

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

  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
}
