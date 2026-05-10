# MathLienLand

Plataforma educativa de matemáticas que combina seis minijuegos desarrollados en Godot Engine con generación automática de preguntas mediante IA, dificultad adaptativa y paneles de seguimiento para alumnos y profesores.

Desarrollado como Trabajo de Fin de Grado en la Facultad de Informática de la Universidad Complutense de Madrid (FDI UCM).

**Demo en producción:** https://tfg-mathlienland.onrender.com

> El servidor usa el tier gratuito de Render y entra en reposo tras 15 minutos de inactividad. La primera petición puede tardar ~1 minuto en responderse mientras arranca.

---

## Funcionalidades

- **6 minijuegos** de matemáticas (fracciones, regla de tres, divisibilidad, sistema métrico, operaciones aritméticas, funciones) exportados a HTML5 desde Godot 4
- **Generación de preguntas con IA** para 4 de los 6 minijuegos usando Google Gemini, con validación matemática automática
- **Dificultad adaptativa** por alumno y por contexto (grupo o sesión privada), basada en precisión y tiempo de respuesta
- **Dashboard del alumno** con estadísticas, gráficas, análisis IA personalizado y sistema de logros
- **Dashboard del profesor** con tabla de alumnos, gráficas comparativas, análisis IA grupal e individual, alertas de rendimiento y exportación CSV
- **113 tests automatizados** para el algoritmo adaptativo y el validador matemático (`npm test`)

---

## Stack

| Capa | Tecnología |
|---|---|
| Servidor | Node.js + Express |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Minijuegos | Godot 4 (export HTML5 / WebAssembly) |
| IA | Google Gemini 2.5 Flash |
| Frontend | HTML + CSS + JavaScript (vanilla) |
| Gráficas | Chart.js |
| Despliegue | Render |
| Keep-alive BD | GitHub Actions |

---

## Estructura del proyecto

```
server.js              # Servidor Express principal
src/
  adaptive.js          # Algoritmo de dificultad adaptativa
  validation.js        # Validador matemático de preguntas generadas por IA
public/
  auth.html            # Registro e inicio de sesión
  game.html            # Página del juego (iframe con Godot)
  dashboard.html       # Panel del alumno
  teacher-dashboard.html  # Panel del profesor
  game/                # Build HTML5 de Godot (WebAssembly)
  js/                  # Lógica del frontend
  css/                 # Estilos
questions/             # Caché de preguntas generadas por Gemini (JSON)
sql/                   # Scripts SQL del esquema de Supabase
tests/
  adaptive.test.js     # 59 tests del algoritmo adaptativo
  validation.test.js   # 54 tests del validador matemático
```

---

## Configuración local

### Requisitos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) con el esquema aplicado (ver `sql/`)
- API key de [Google AI Studio](https://aistudio.google.com)

### Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
GEMINI_API_KEY=<tu-api-key>
```

### Arrancar

```bash
npm install
npm start
```

### Tests

```bash
npm test
```

---

## Minijuegos y compatibilidad con IA

| Minijuego | Generación IA | Dificultad adaptativa |
|---|---|---|
| Fraction Race | No (contenido en imágenes) | No |
| Labyrinth of Rule of Three | Sí | Sí |
| Dividing Hills | Sí | Sí |
| Decimal System Meteors | Sí | Sí |
| Math Endless Runner | Sí | Sí |
| Function Memory | No (contenido en imágenes) | No |
