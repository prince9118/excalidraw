import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import type { DrawingElement } from "../canvas/types";
import Thumbnail from "../components/Thumbnail";
import { Logo, LogOutIcon, PlusIcon } from "../components/icons";

interface Drawing {
  id: string;
  name: string;
  elements: DrawingElement[];
  createdAt: string;
  updatedAt: string;
}

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60]
];

function timeAgo(date: string) {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000;

  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }

  return "just now";
}

export default function Dashboard() {
  const navigate = useNavigate();

  // null while the first load is in flight.
  const [drawings, setDrawings] = useState<Drawing[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api<{ success: boolean; data: Drawing[] }>("/api/drawings")
      .then((result) => {
        if (!cancelled) setDrawings(result.data);
      })
      .catch((error) => {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : "Could not load drawings");
        setDrawings([]);
      });

    api<{ success: boolean; data: { email: string } }>("/api/auth/me")
      .then((result) => {
        if (!cancelled) setEmail(result.data.email);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const createDrawing = async () => {
    setCreating(true);

    try {
      const result = await api<{ success: boolean; data: Drawing }>("/api/drawings", {
        method: "POST",
        body: JSON.stringify({ name: "Untitled", elements: [] })
      });

      navigate(`/drawing/${result.data.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create drawing");
      setCreating(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const newDrawingButton = (
    <button className="button primary" onClick={createDrawing} disabled={creating}>
      {creating ? <span className="spinner" aria-hidden="true" /> : <PlusIcon />}
      New drawing
    </button>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <Logo />

        <div className="header-actions">
          {email && (
            <span className="user-chip" title={email}>
              <span className="avatar" aria-hidden="true">
                {email[0].toUpperCase()}
              </span>
              <span className="user-email">{email}</span>
            </span>
          )}

          <button className="button ghost" onClick={logout}>
            <LogOutIcon />
            <span className="hide-sm">Log out</span>
          </button>
        </div>
      </header>

      <main className="dashboard">
        <div className="dashboard-head">
          <div>
            <h1>Your drawings</h1>
            <p className="muted">
              {drawings === null
                ? "Loading…"
                : `${drawings.length} ${drawings.length === 1 ? "drawing" : "drawings"}`}
            </p>
          </div>

          {newDrawingButton}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {drawings === null ? (
          <div className="drawing-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="drawing-card skeleton">
                <div className="drawing-thumb" />
                <div className="drawing-meta">
                  <span className="skeleton-line" />
                  <span className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : drawings.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-illustration" viewBox="0 0 120 80" aria-hidden="true">
              <rect x="8" y="14" width="46" height="34" rx="6" transform="rotate(-5 31 31)" />
              <circle cx="88" cy="30" r="18" />
              <path d="M14 66c16-10 30 6 46-2s28-8 46 0" />
            </svg>
            <h2>A blank canvas awaits</h2>
            <p className="muted">Create your first drawing to get started.</p>
            {newDrawingButton}
          </div>
        ) : (
          <div className="drawing-grid">
            {drawings.map((drawing) => (
              <button
                key={drawing.id}
                className="drawing-card"
                onClick={() => navigate(`/drawing/${drawing.id}`)}
              >
                <div className="drawing-thumb">
                  {drawing.elements.length > 0 ? (
                    <Thumbnail elements={drawing.elements} />
                  ) : (
                    <span className="thumb-empty">Empty</span>
                  )}
                </div>

                <div className="drawing-meta">
                  <h3>{drawing.name}</h3>
                  <span>Edited {timeAgo(drawing.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
