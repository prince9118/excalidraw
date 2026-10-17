# Excalidraw Clone

A full-stack drawing app inspired by [Excalidraw](https://excalidraw.com/): a canvas whiteboard with accounts, autosaved drawings, and live sync between every tab or device where a drawing is open.

**Live:** https://excalidraw.princechaudhary.xyz
**Repository:** https://github.com/prince9118/excalidraw

---

## Features

- Shapes: rectangle, ellipse, line, arrow, freehand pencil, and text typed directly on the canvas
- Floating toolbar with keyboard shortcuts: `1`–`7` or `V` `R` `O` `L` `A` `P` `T`
- Select and drag elements to move them
- Delete the selected element (toolbar button, `Delete` or `Backspace`)
- Undo / redo (`Ctrl+Z`, `Ctrl+Shift+Z` or `Ctrl+Y`)
- Rename a drawing from its title in the top-left corner
- Autosave: changes are saved 800 ms after you stop editing, with a Saved / Saving / Unsaved indicator
- Live sync: open the same drawing in two tabs or on two devices and edits appear in both instantly
- Dashboard with a live thumbnail of every drawing
- Light and dark themes that follow your system setting, with sharp rendering on high-DPI screens
- Register (you're signed in right away) and log in
- Expired sessions send you back to the login page

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
│   │   │   ├── canvas/         # element types and canvas renderer
│   │   │   ├── components/     # ProtectedRoute
│   │   │   ├── pages/          # Login, Register, Dashboard, Whiteboard
│   │   │   └── services/       # REST client and WebSocket client
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
  type: "rectangle" | "ellipse" | "line" | "arrow" | "pencil" | "text";
  x: number;
  y: number;
  width?: number;      // rectangle, ellipse
  height?: number;
  points?: { x: number; y: number }[];  // line, arrow, pencil
  text?: string;       // text
  strokeColor?: string;
  strokeWidth?: number;
}
```

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
