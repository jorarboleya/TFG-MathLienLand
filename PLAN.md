# Plan TFG — MathLienLand Adaptativo

---

## Contexto del proyecto

**Alumno:** Jorge Arboleya (`jorarbol@ucm.es`)

**Objetivo del TFG:** Tomar el minijuego educativo MathLienLand (desarrollado en otro TFG, disponible en [github.com/NellyRL/MathLienLand](https://github.com/NellyRL/MathLienLand)) e integrarlo en una plataforma web con sistema de usuarios y generación de niveles adaptativos mediante IA.

**El juego original:** Está hecho con **Godot 4** en GDScript. Contiene 6 minijuegos matemáticos (fracciones, regla de tres, divisiones, sistema decimal, funciones y cálculo mental). Se puede exportar a HTML5, lo que permite incrustarlo en una página web mediante un iframe.

**Estado actual del proyecto (sesión 1 — 20/03/2026):**
- Web básica creada con tres páginas: `index.html` (inicio), `auth.html` (login/registro), `game.html` (juego)
- Supabase configurado con proyecto `MathLienLand`
- Base de datos PostgreSQL con tres tablas: `users`, `sessions`, `answers`
- Autenticación funcionando (login con email y contraseña)
- Políticas RLS creadas para las tres tablas
- Servidor Express creado (`server.js`) con las cabeceras COOP/COEP necesarias para Godot
- Archivos SQL del esquema guardados en `sql/`
- Pendiente: exportar el juego desde Godot (hay que hacerlo en otro ordenador)

**Para arrancar el servidor local:**
```bash
cd /Users/jorge.arboleya/Desktop/TFG-Info/TFG-MathLienLand
npm start
# Abre http://localhost:8080
```

---

## Stack tecnológico

| Qué | Con qué |
|---|---|
| Web frontend | HTML + CSS + JavaScript |
| Juego | Godot 4 exportado a HTML5 |
| Servidor local | Node.js + Express |
| Base de datos | PostgreSQL (vía Supabase) |
| Autenticación | Supabase Auth |
| IA adaptativa | API de Claude (Anthropic) |
| Despliegue final | Railway o Render (gratuito) |

---

## Estructura del proyecto

```
TFG-MathLienLand/
├── index.html          → página de inicio con botón de login
├── auth.html           → formulario de login y registro
├── game.html           → página del juego (requiere sesión activa)
├── server.js           → servidor Express con cabeceras COOP/COEP
├── package.json
├── js/
│   └── supabase.js     → configuración del cliente de Supabase
├── game/               → aquí van los archivos exportados de Godot
│   └── README.md       → instrucciones de exportación
├── sql/
│   ├── 01_tables.sql   → creación de tablas
│   ├── 02_rls_policies.sql → políticas de seguridad
│   └── 03_queries.sql  → consultas de rendimiento para la IA
└── PLAN.md
```

---

## Base de datos (Supabase + PostgreSQL)

**Proyecto Supabase:** MathLienLand
**URL:** `https://lrzwhweiyqmozstdyglv.supabase.co`

### Tablas

**`users`** — perfil del usuario, vinculado al uid de Supabase Auth
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | clave primaria, igual al uid de Auth |
| name | text | nombre del usuario |
| email | text | |
| register_date | timestamptz | se rellena automáticamente |

**`sessions`** — cada partida jugada
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | clave primaria |
| user_id | uuid | referencia a users.id |
| minigame | text | nombre del minijuego |
| date | timestamptz | se rellena automáticamente |
| duration | int | segundos, se rellena al terminar |

**`answers`** — cada pregunta respondida dentro de una sesión
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | clave primaria |
| session_id | uuid | referencia a sessions.id |
| question_id | text | identificador de la pregunta |
| correct | boolean | si la respuesta fue correcta |
| time | int | segundos en responder |
| difficulty | int | nivel de dificultad (1-5) |

> `time` y `difficulty` son los campos más importantes para la IA adaptativa. Hay que asegurarse de guardarlos desde el principio.

---

## Fase 1 — Integración del juego

**Estado: pendiente (falta la exportación de Godot)**

Godot HTML5 requiere las cabeceras HTTP `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: require-corp` para poder usar `SharedArrayBuffer`. Sin ellas el juego no arranca. El servidor Express ya está preparado para enviarlas.

**Pasos pendientes:**
1. Exportar el proyecto Godot a HTML5 en el otro ordenador
2. Copiar los archivos exportados en la carpeta `game/`
3. Arrancar con `npm start` y verificar que el juego carga en `game.html`
4. Ajustar el tamaño del contenedor si hace falta

**Cómo exportar desde Godot:**
- Project → Export → Web (HTML5)
- Exportar a la ruta `.../TFG-MathLienLand/game/index.html`

---

## Fase 2 — Usuarios y autenticación

**Estado: completado en lo esencial**

Login y registro funcionan. El nombre del usuario aparece en la cabecera de `game.html`. Al cerrar sesión redirige a `index.html`.

**Pendiente:**
- El registro desde el formulario web tiene un rate limit de Supabase en el tier gratuito (4 emails/hora). Para desarrollo, crear usuarios directamente desde **Authentication → Users → Add user** en el panel de Supabase.
- Cuando el juego esté integrado, añadir el código que guarda cada sesión y respuesta en la base de datos al terminar una partida.

---

## Fase 3 — IA adaptativa

**Estado: pendiente**

### Enfoque elegido: LLM mediante API de Claude

Un LLM (Large Language Model) es un modelo de IA ya entrenado que se usa a través de una API. No hay que entrenarlo ni conocer matemáticas de IA: solo se le manda un mensaje de texto y responde. En este caso se le pedirá que genere preguntas matemáticas adaptadas al perfil del usuario.

**Flujo:**
1. El usuario termina una partida → sus respuestas se guardan en Supabase
2. Al empezar una nueva partida → se consulta Supabase y se calcula un resumen de rendimiento (% aciertos por minijuego, tiempo medio, dificultad)
3. Ese resumen se envía a la API de Claude:
   > *"El usuario acierta el 35% de preguntas de fracciones de dificultad media y tarda 18 segundos de media. Genera 5 preguntas adaptadas en formato JSON."*
4. Claude devuelve las preguntas en JSON
5. El juego las carga en lugar de las predefinidas

**Lo más complejo de esta fase:** modificar el código Godot (GDScript) para que acepte preguntas externas. La comunicación entre el iframe del juego y la web se hace con `postMessage`, una API estándar de JavaScript. Antes de empezar esta fase hay que estudiar bien cómo están estructuradas las preguntas en el código original de Godot.

---

## Progreso general

| Tarea | Estado |
|---|---|
| Web básica (index, auth, game) | Hecho |
| Servidor Express con COOP/COEP | Hecho |
| Supabase: tablas y políticas RLS | Hecho |
| Login y registro funcionando | Hecho |
| Archivos SQL del esquema | Hecho |
| Exportar Godot a HTML5 | Pendiente (otro ordenador) |
| Integrar juego en game.html | Pendiente |
| Guardar sesiones y respuestas en Supabase | Pendiente |
| Consultas de rendimiento para la IA | Preparadas en sql/03_queries.sql |
| Integración con API de Claude | Pendiente |
| Modificar Godot para preguntas externas | Pendiente (lo más complejo) |
| Despliegue en producción | Pendiente (al final del TFG) |

---

## Próximos pasos recomendados

1. **Exportar Godot** desde el otro ordenador y verificar que el juego carga en la web
2. **Estudiar el código de Godot** para entender cómo están estructuradas las preguntas (esto es clave antes de la Fase 3)
3. **Implementar el guardado de sesiones y respuestas** en Supabase al terminar una partida
4. **Integrar la API de Claude** para generar preguntas adaptadas
5. **Modificar Godot** para recibir preguntas externas vía `postMessage`

---

## Notas

- Todo se desarrolla en local. El despliegue a producción se hace al final del TFG.
- La base de datos es PostgreSQL estándar — todo lo aprendido es transferible a cualquier entorno laboral.
- La API de Claude se puede sustituir por OpenAI GPT si se prefiere, el enfoque es idéntico.
- El rate limit del registro en Supabase free tier es 4 emails/hora. Para desarrollo, crear usuarios desde el panel de Supabase directamente.
