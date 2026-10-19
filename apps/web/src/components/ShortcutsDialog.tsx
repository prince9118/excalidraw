import { useEffect } from "react";

import { CloseIcon } from "./icons";

const GROUPS: { title: string; items: [string, string[]][] }[] = [
  {
    title: "Tools",
    items: [
      ["Select", ["V", "1"]],
      ["Hand (pan)", ["H"]],
      ["Rectangle", ["R", "2"]],
      ["Diamond", ["D", "3"]],
      ["Ellipse", ["O", "4"]],
      ["Arrow", ["A", "5"]],
      ["Line", ["L", "6"]],
      ["Pencil", ["P", "7"]],
      ["Text", ["T", "8"]],
      ["Eraser", ["E", "0"]],
    ],
  },
  {
    title: "Editing",
    items: [
      ["Undo", ["Ctrl", "Z"]],
      ["Redo", ["Ctrl", "Shift", "Z"]],
      ["Copy / Cut / Paste", ["Ctrl", "C / X / V"]],
      ["Duplicate", ["Ctrl", "D"]],
      ["Delete", ["Del"]],
      ["Nudge", ["Arrows"]],
      ["Bring to front", ["Ctrl", "Shift", "]"]],
      ["Send to back", ["Ctrl", "Shift", "["]],
      ["Edit text", ["Double-click"]],
      ["Square / 45° lines", ["Shift", "drag"]],
    ],
  },
  {
    title: "View",
    items: [
      ["Pan", ["Space", "drag"]],
      ["Scroll canvas", ["Wheel"]],
      ["Zoom", ["Ctrl", "Wheel"]],
      ["Zoom in / out", ["Ctrl", "+ / −"]],
      ["Reset zoom", ["Ctrl", "0"]],
      ["Zoom to fit", ["Shift", "1"]],
      ["Shortcuts", ["?"]],
    ],
  },
];

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    // Capture phase so the board's own Escape handling doesn't also run.
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onPointerDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="dialog-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close" autoFocus>
            <CloseIcon />
          </button>
        </header>

        <div className="shortcut-groups">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.items.map(([label, keys]) => (
                  <div key={label} className="shortcut-row">
                    <dt>{label}</dt>
                    <dd>
                      {keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
