# MathLienLand

An educational math platform combining six Godot Engine minigames with AI-powered question generation, adaptive difficulty, and dashboards for students and teachers.

Built as a Final Degree Project (TFG) at the Faculty of Computer Science, Universidad Complutense de Madrid (FDI UCM).

**Live demo:** https://tfg-mathlienland.onrender.com

> The server runs on Render's free tier and goes to sleep after 15 minutes of inactivity. The first request after an idle period may take ~1 minute to respond while the server wakes up.

---

## Features

- **6 math minigames** (fractions, rule of three, divisibility, metric system, arithmetic, functions) exported to HTML5 from Godot 4
- **AI-powered question generation** for 4 of the 6 minigames using Google Gemini, with automatic mathematical validation
- **Adaptive difficulty** per student and per context (group session or private session), based on accuracy and response time
- **Student dashboard** with statistics, charts, AI-generated personalized analysis and an achievement system
- **Teacher dashboard** with student table, comparative charts, group and individual AI analysis, performance alerts and CSV export
- **113 automated tests** for the adaptive algorithm and the mathematical validator (`npm test`)

---

## Tech stack

| Layer | Technology |
|---|---|
| Server | Node.js + Express |
| Database | Supabase (PostgreSQL + RLS) |
| Minigames | Godot 4 (HTML5 / WebAssembly export) |
| AI | Google Gemini 2.5 Flash |
| Frontend | HTML + CSS + Vanilla JavaScript |
| Charts | Chart.js |
| Deployment | Render |
| Database keep-alive | GitHub Actions |

---

## Project structure

```
server.js                  # Main Express server
src/
  adaptive.js              # Adaptive difficulty algorithm
  validation.js            # Mathematical validator for AI-generated questions
public/
  auth.html                # Login and registration
  game.html                # Game page (Godot iframe)
  dashboard.html           # Student dashboard
  teacher-dashboard.html   # Teacher dashboard
  game/                    # Godot HTML5 build (WebAssembly)
  js/                      # Frontend logic
  css/                     # Styles
questions/                 # Gemini-generated question cache (JSON)
sql/                       # Supabase schema SQL scripts
tests/
  adaptive.test.js         # 59 tests for the adaptive algorithm
  validation.test.js       # 54 tests for the mathematical validator
```

---

## Local setup

### Requirements

- Node.js 18+
- A [Supabase](https://supabase.com) project with the schema applied (see `sql/`)
- An API key from [Google AI Studio](https://aistudio.google.com)

### Environment variables

Create a `.env` file in the project root:

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
GEMINI_API_KEY=<your-api-key>
```

### Run

```bash
npm install
npm start
```

### Test

```bash
npm test
```

---

## Minigames and AI compatibility

| Minigame | AI generation & adaptive difficulty |
|---|---|
| Fraction Race | No (image-based content) |
| Labyrinth of Rule of Three | Yes |
| Dividing Hills | Yes |
| Decimal System Meteors | Yes |
| Math Endless Runner | Yes |
| Function Memory | No (image-based content) |
