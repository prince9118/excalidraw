# Canvora

Canvora is a full-stack drawing app inspired by [Excalidraw](https://excalidraw.com/): a canvas whiteboard with accounts, autosaved drawings, and live sync between every tab or device where a drawing is open.

**Live:** https://excalidraw.princechaudhary.xyz
**Repository:** https://github.com/prince9118/excalidraw

---

## Features

### Drawing

- Shapes: rectangle, diamond, ellipse, line, arrow, freehand pencil, and text typed directly on the canvas
- Eraser: drag across shapes to fade them, release to delete them
- Hold `Shift` while drawing for perfect squares and circles, and lines snapped to 45°
- Style panel: stroke color, fill color (with a custom color picker), stroke width, solid / dashed / dotted lines, opacity, and font size for text
- New shapes use the last style you picked; selecting a shape lets you restyle it

### Editing

- Select and drag to move; drag corner handles to resize, or drag a line/arrow endpoint
- Double-click text to edit it, or double-click empty canvas to add text
- Copy, cut and paste (`Ctrl+C` / `X` / `V`), including between drawings; duplicate with `Ctrl+D`
- Nudge the selection with the arrow keys (`Shift` for bigger steps)
- Bring to front / send to back
- Undo / redo (`Ctrl+Z`, `Ctrl+Shift+Z` or `Ctrl+Y`); consecutive slider or nudge changes merge into one step

### Canvas

- Infinite canvas: scroll to pan, `Ctrl` + scroll or pinch to zoom around the cursor
- Pan with the Hand tool (`H`), `Space` + drag, or the middle mouse button
- Zoom controls: zoom in/out, reset to 100%, and zoom to fit (`Shift+1`)
- Export the drawing as a PNG, or copy it to the clipboard
- Clear the canvas (undoable)
- Press `?` for a list of every keyboard shortcut

### App

- Rename a drawing from its title in the top-left corner
- Autosave: changes are saved 800 ms after you stop editing, with a Saved / Saving / Unsaved indicator
- Live sync: open the same drawing in two tabs or on two devices and edits appear in both instantly
- Dashboard with a live thumbnail of every drawing, search, sorting, and duplicate / delete actions
- Light, dark or system theme, with sharp rendering on high-DPI screens
- Register (you're signed in right away) and log in
- Expired sessions send you back to the login page

### Keyboard shortcuts

| Tool      | Keys      | Tool    | Keys      |
|-----------|-----------|---------|-----------|
| Hand      | `H`       | Arrow   | `A` / `5` |
| Select    | `V` / `1` | Line    | `L` / `6` |
| Rectangle | `R` / `2` | Pencil  | `P` / `7` |
| Diamond   | `D` / `3` | Text    | `T` / `8` |
| Ellipse   | `O` / `4` | Eraser  | `E` / `0` |

---

## Architecture

```text
┌──────────────────────────────┐
│  Browser — React + Canvas    │
└──────┬────────────────┬──────┘
       │ REST (HTTPS)   │ WebSocket (/ws)
       ▼                ▼
┌──────────────────────────────┐
│  Node + Express API          │
│  ws server on the same port  │
└──────────────┬───────────────┘
               │ Prisma
               ▼
┌──────────────────────────────┐
│  PostgreSQL                  │
└──────────────────────────────┘
```

The frontend and API are served from one Azure VM behind Caddy. The old Vercel URL (`excalidraw-flame.vercel.app`) permanently redirects to the domain above.

---

## Tech Stack

| Layer    | Tools |
|----------|-------|
| Frontend | React 19, TypeScript, Vite, React Router, HTML5 Canvas, oxlint |
| Backend  | Node.js, Express 5, TypeScript, `ws`, JWT, bcrypt, Zod |
| Database | PostgreSQL, Prisma 7 (`@prisma/adapter-pg`) |

---

## Project Structure

```text
excalidraw/
├── apps/
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── canvas/         # element types, geometry (bounds, hit testing, resizing),
│   │   │   │                   # renderer and PNG export
│   │   │   ├── components/     # StylePanel, ShortcutsDialog, ThemeSwitcher, Thumbnail,
│   │   │   │                   # icons, AuthLayout, ProtectedRoute
│   │   │   ├── pages/          # Login, Register, Dashboard, Whiteboard
│   │   │   └── services/       # REST client, WebSocket client, theme
│   │   ├── vercel.json         # redirect from the old Vercel URL
│   │   └── vite.config.ts
│   │
│   └── server/                 # Express API + WebSocket server
│       ├── src/
│       │   ├── controllers/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── middleware/     # JWT auth
│       │   ├── types/          # Zod schemas
│       │   ├── websocket/      # rooms, auth, message relay
│       │   ├── lib/            # Prisma client, JWT helpers
│       │   ├── app.ts
│       │   └── server.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       └── prisma7.config.ts
└── README.md
```

---

## API

All drawing routes require `Authorization: Bearer <token>`.

| Method | Path                  | Description |
|--------|-----------------------|-------------|
| GET    | `/api/health`         | Health check |
| POST   | `/api/auth/register`  | Create an account (`email`, `password` of 8+ characters) |
| POST   | `/api/auth/login`     | Returns `{ token, user }`; the token is valid for 7 days |
| GET    | `/api/auth/me`        | Current user |
| GET    | `/api/drawings`       | List your drawings, newest first |
| POST   | `/api/drawings`       | Create a drawing: `{ "name": "Untitled", "elements": [] }` |
| GET    | `/api/drawings/:id`   | Get one drawing with its elements |
| PATCH  | `/api/drawings/:id`   | Update `name` and/or `elements` |
| DELETE | `/api/drawings/:id`   | Delete a drawing (204) |

### WebSocket

Connect to `/ws?token=<jwt>`, then join a drawing:

```json
{ "type": "drawing:join", "drawingId": "<id>" }
```

The server checks that you own the drawing, then relays these messages to the drawing's other open connections (never back to the sender):

| Message            | Payload |
|--------------------|---------|
| `element:create`   | `element` |
| `element:update`   | `elementId`, `element` |
| `element:delete`   | `elementId` |
| `elements:replace` | `elements` (sent on undo/redo) |

Persistence still goes through `PATCH /api/drawings/:id`; the socket only carries live updates.

---

## Data Model

```text
User     id, email (unique), passwordHash, createdAt, updatedAt
Drawing  id, userId → User (cascade delete), name, elements (JSON), createdAt, updatedAt
```

Each element in `elements` looks like:

```ts
{
  id: string;
  type: "rectangle" | "diamond" | "ellipse" | "line" | "arrow" | "pencil" | "text";
  x: number;
  y: number;
  width?: number;      // rectangle, diamond, ellipse
  height?: number;
  points?: { x: number; y: number }[];  // line, arrow, pencil
  text?: string;       // text (x, y is the baseline)
  fontSize?: number;   // text, default 20
  strokeColor?: string;      // "#000000" follows the theme's ink color
  backgroundColor?: string;  // fill for shapes, "transparent" for none
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  opacity?: number;    // 10–100, default 100
}
```

Every style field is optional, so drawings saved by older versions still load. The server stores `elements` as plain JSON, so new element fields need no backend or database changes.

---

## Local Development

### 1. Clone

```bash
git clone https://github.com/prince9118/excalidraw.git
cd excalidraw
```

### 2. Backend

```bash
cd apps/server
npm install
cp .env.example .env    # then fill in the values
```

`apps/server/.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require"
PORT=4000
JWT_SECRET="a-long-random-string"
FRONTEND_URL="http://localhost:5173"
```

Apply migrations and start the server:

```bash
npx prisma migrate deploy --config prisma7.config.ts
npm run dev
```

The API runs at `http://localhost:4000` and the WebSocket at `ws://localhost:4000/ws`.

### 3. Frontend

```bash
cd apps/web
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:4000
npm run dev
```

Open http://localhost:5173.

### Scripts

| App    | Command         | What it does |
|--------|-----------------|--------------|
| server | `npm run dev`   | Start with live reload (tsx) |
| server | `npm run build` | `prisma generate` + compile to `dist/` |
| server | `npm start`     | Run the compiled server |
| web    | `npm run dev`   | Vite dev server |
| web    | `npm run build` | Typecheck + production build to `dist/` |
| web    | `npm run lint`  | oxlint |

---

## Security Notes

- Passwords are hashed with bcrypt.
- Drawing routes and WebSocket rooms check that the drawing belongs to the logged-in user.
- Request bodies are validated with Zod.
- CORS only allows `FRONTEND_URL`.
- Keep real secrets in `.env`, which is git-ignored. `.env.example` must only hold placeholders.

Not yet implemented: rate limiting, refresh tokens, security headers.

---

## Contributing

Issues and pull requests are welcome. If you find the project useful, a ⭐ on GitHub is appreciated.
