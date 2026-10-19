import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../services/api";
import type { DrawingElement } from "../canvas/types";
import Thumbnail from "../components/Thumbnail";
import { ThemeToggleButton } from "../components/ThemeSwitcher";
import {
  CloseIcon,
  CopyIcon,
  Logo,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "../components/icons";

interface Drawing {
  id: string;
  name: string;
  elements: DrawingElement[];
  createdAt: string;
  updatedAt: string;
}

type SortOrder = "updated" | "created" | "name";

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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("updated");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // The drawing a duplicate/delete request is in flight for.
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const visibleDrawings = useMemo(() => {
    if (!drawings) return null;

    const needle = query.trim().toLowerCase();

    const filtered = needle
      ? drawings.filter((drawing) => drawing.name.toLowerCase().includes(needle))
      : drawings;

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);

      const key = sort === "created" ? "createdAt" : "updatedAt";

      return new Date(b[key]).getTime() - new Date(a[key]).getTime();
    });
  }, [drawings, query, sort]);

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

  const duplicateDrawing = async (drawing: Drawing) => {
    setBusyId(drawing.id);
    setError("");

    try {
      const result = await api<{ success: boolean; data: Drawing }>("/api/drawings", {
        method: "POST",
        body: JSON.stringify({
          name: `${drawing.name} (copy)`.slice(0, 100),
          elements: drawing.elements
        })
      });

      setDrawings((prev) => (prev ? [result.data, ...prev] : [result.data]));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not duplicate drawing");
    } finally {
      setBusyId(null);
    }
  };

  const deleteDrawing = async (drawing: Drawing) => {
    setBusyId(drawing.id);
    setError("");

    try {
      await api(`/api/drawings/${drawing.id}`, { method: "DELETE" });

      setDrawings((prev) => prev?.filter((d) => d.id !== drawing.id) ?? prev);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete drawing");
    } finally {
      setBusyId(null);
      setConfirmingId(null);
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
          <ThemeToggleButton />

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

        {drawings !== null && drawings.length > 0 && (
          <div className="dashboard-controls">
            <label className="search-field">
              <SearchIcon />
              <input
                type="search"
                placeholder="Search drawings"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search drawings"
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <CloseIcon />
                </button>
              )}
            </label>

            <select
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOrder)}
              aria-label="Sort drawings"
            >
              <option value="updated">Last edited</option>
              <option value="created">Newest first</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {visibleDrawings === null ? (
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
        ) : drawings?.length === 0 ? (
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
        ) : visibleDrawings.length === 0 ? (
          <div className="empty-state compact">
            <h2>No matches</h2>
            <p className="muted">No drawings match “{query.trim()}”.</p>
            <button className="button ghost" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        ) : (
          <div className="drawing-grid">
            {visibleDrawings.map((drawing) => (
              <article
                key={drawing.id}
                className={`drawing-card${busyId === drawing.id ? " busy" : ""}`}
              >
                <Link to={`/drawing/${drawing.id}`} className="card-link">
                  <div className="drawing-thumb">
                    {drawing.elements.length > 0 ? (
                      <Thumbnail elements={drawing.elements} />
                    ) : (
                      <span className="thumb-empty">Empty</span>
                    )}
                  </div>

                  <div className="drawing-meta">
                    <h3>{drawing.name}</h3>
                    <span>
                      Edited {timeAgo(drawing.updatedAt)}
                      {drawing.elements.length > 0 &&
                        ` · ${drawing.elements.length} ${drawing.elements.length === 1 ? "shape" : "shapes"}`}
                    </span>
                  </div>
                </Link>

                <div className="card-actions">
                  <button
                    className="icon-button"
                    onClick={() => duplicateDrawing(drawing)}
                    disabled={busyId !== null}
                    aria-label={`Duplicate ${drawing.name}`}
                    title="Duplicate"
                  >
                    <CopyIcon />
                  </button>

                  <button
                    className="icon-button danger"
                    onClick={() => setConfirmingId(drawing.id)}
                    disabled={busyId !== null}
                    aria-label={`Delete ${drawing.name}`}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>

                {confirmingId === drawing.id && (
                  <div className="card-confirm" role="alertdialog" aria-label="Confirm delete">
                    <p>
                      Delete <strong>{drawing.name}</strong>?
                      <span>This can’t be undone.</span>
                    </p>

                    <div className="card-confirm-actions">
                      <button
                        className="button ghost"
                        onClick={() => setConfirmingId(null)}
                        disabled={busyId === drawing.id}
                        autoFocus
                      >
                        Cancel
                      </button>

                      <button
                        className="button danger"
                        onClick={() => deleteDrawing(drawing)}
                        disabled={busyId === drawing.id}
                      >
                        {busyId === drawing.id && (
                          <span className="spinner" aria-hidden="true" />
                        )}
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
