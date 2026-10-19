import type { ReactNode } from "react";

import type { ElementStyle, ElementType, StrokeStyle } from "../canvas/types";
import { DEFAULT_STROKE, TRANSPARENT } from "../canvas/renderer";
import {
  BringFrontIcon,
  CopyIcon,
  SendBackIcon,
  TrashIcon,
} from "./icons";

const STROKE_COLORS = [DEFAULT_STROKE, "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5"];

const BACKGROUND_COLORS = [TRANSPARENT, "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99", "#eebefa"];

const STROKE_WIDTHS = [
  { value: 1, label: "Thin" },
  { value: 2, label: "Bold" },
  { value: 4, label: "Extra bold" },
];

const STROKE_STYLES: { value: StrokeStyle; label: string; dash?: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed", dash: "5 4" },
  { value: "dotted", label: "Dotted", dash: "0.5 4" },
];

const FONT_SIZES = [
  { value: 16, label: "S" },
  { value: 20, label: "M" },
  { value: 28, label: "L" },
  { value: 36, label: "XL" },
];

const COLOR_NAMES: Record<string, string> = {
  [DEFAULT_STROKE]: "Ink",
  [TRANSPARENT]: "Transparent",
  "#e03131": "Red",
  "#2f9e44": "Green",
  "#1971c2": "Blue",
  "#f08c00": "Orange",
  "#9c36b5": "Purple",
  "#ffc9c9": "Light red",
  "#b2f2bb": "Light green",
  "#a5d8ff": "Light blue",
  "#ffec99": "Light yellow",
  "#eebefa": "Light purple",
};

interface Props {
  type: ElementType;
  style: ElementStyle;
  onChange: (patch: Partial<ElementStyle>) => void;
  // Present when editing a selected element rather than the next one.
  selection?: {
    onDuplicate: () => void;
    onDelete: () => void;
    onBringToFront: () => void;
    onSendToBack: () => void;
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="panel-section">
      <legend>{title}</legend>
      <div className="panel-row">{children}</div>
    </fieldset>
  );
}

function ColorRow({
  colors,
  value,
  onPick,
}: {
  colors: string[];
  value: string;
  onPick: (color: string) => void;
}) {
  const isCustom = !colors.includes(value);

  return (
    <>
      {colors.map((color) => (
        <button
          key={color}
          className={`swatch${value === color ? " active" : ""}${color === TRANSPARENT ? " transparent" : ""}`}
          style={
            color === DEFAULT_STROKE
              ? { background: "var(--canvas-ink)" }
              : color === TRANSPARENT
                ? undefined
                : { background: color }
          }
          aria-label={COLOR_NAMES[color] ?? color}
          aria-pressed={value === color}
          title={COLOR_NAMES[color] ?? color}
          onClick={() => onPick(color)}
        />
      ))}

      <label
        className={`swatch custom${isCustom ? " active" : ""}`}
        style={isCustom ? { background: value } : undefined}
        title="Custom color"
      >
        <input
          type="color"
          value={isCustom ? value : "#868e96"}
          onChange={(e) => onPick(e.target.value)}
          aria-label="Custom color"
        />
      </label>
    </>
  );
}

export default function StylePanel({ type, style, onChange, selection }: Props) {
  const isText = type === "text";
  const hasFill = type === "rectangle" || type === "diamond" || type === "ellipse";
  const hasDash = !isText && type !== "pencil";

  return (
    <aside className="island style-panel" aria-label="Style">
      <Section title={isText ? "Color" : "Stroke"}>
        <ColorRow
          colors={STROKE_COLORS}
          value={style.strokeColor}
          onPick={(strokeColor) => onChange({ strokeColor })}
        />
      </Section>

      {hasFill && (
        <Section title="Background">
          <ColorRow
            colors={BACKGROUND_COLORS}
            value={style.backgroundColor}
            onPick={(backgroundColor) => onChange({ backgroundColor })}
          />
        </Section>
      )}

      {!isText && (
        <Section title="Stroke width">
          {STROKE_WIDTHS.map((option) => (
            <button
              key={option.value}
              className={`option-button${style.strokeWidth === option.value ? " active" : ""}`}
              aria-pressed={style.strokeWidth === option.value}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange({ strokeWidth: option.value })}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                <path
                  d="M4 11h14"
                  stroke="currentColor"
                  strokeWidth={option.value * 1.25 + 0.5}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ))}
        </Section>
      )}

      {hasDash && (
        <Section title="Stroke style">
          {STROKE_STYLES.map((option) => (
            <button
              key={option.value}
              className={`option-button${style.strokeStyle === option.value ? " active" : ""}`}
              aria-pressed={style.strokeStyle === option.value}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange({ strokeStyle: option.value })}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                <path
                  d="M3 11h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={option.dash}
                />
              </svg>
            </button>
          ))}
        </Section>
      )}

      {isText && (
        <Section title="Font size">
          {FONT_SIZES.map((option) => (
            <button
              key={option.value}
              className={`option-button text${style.fontSize === option.value ? " active" : ""}`}
              aria-pressed={style.fontSize === option.value}
              title={`${option.value}px`}
              onClick={() => onChange({ fontSize: option.value })}
            >
              {option.label}
            </button>
          ))}
        </Section>
      )}

      <Section title="Opacity">
        <input
          className="range"
          type="range"
          min={10}
          max={100}
          step={10}
          value={style.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          aria-label="Opacity"
        />
        <output className="range-value">{style.opacity}</output>
      </Section>

      {selection && (
        <Section title="Actions">
          <button
            className="option-button"
            onClick={selection.onSendToBack}
            aria-label="Send to back"
            title="Send to back — Ctrl+Shift+["
          >
            <SendBackIcon />
          </button>
          <button
            className="option-button"
            onClick={selection.onBringToFront}
            aria-label="Bring to front"
            title="Bring to front — Ctrl+Shift+]"
          >
            <BringFrontIcon />
          </button>
          <button
            className="option-button"
            onClick={selection.onDuplicate}
            aria-label="Duplicate"
            title="Duplicate — Ctrl+D"
          >
            <CopyIcon />
          </button>
          <button
            className="option-button danger"
            onClick={selection.onDelete}
            aria-label="Delete"
            title="Delete — Del"
          >
            <TrashIcon />
          </button>
        </Section>
      )}
    </aside>
  );
}
