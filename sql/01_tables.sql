-- ============================================================
-- 01_tables.sql
-- Creación de las tablas de la base de datos de MathLienLand
-- ============================================================

-- Tabla de perfiles de usuario
-- Complementa la autenticación de Supabase Auth.
-- El campo id coincide con el uid que genera Supabase al registrarse.
create table users (
  id            uuid primary key,
  name          text not null,
  email         text not null,
  register_date timestamptz not null default now()
);

-- Tabla de sesiones de juego
-- Cada vez que un usuario juega a un minijuego se crea una sesión.
create table sessions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  minigame  text not null,
  date      timestamptz not null default now(),
  duration  int  -- duración en segundos, se rellena al terminar la sesión
);

-- Tabla de respuestas individuales
-- Cada pregunta respondida dentro de una sesión genera una fila.
-- Estos datos son los que usará la IA para adaptar los niveles.
create table answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  question_id text not null,
  correct     boolean not null,
  time        int not null,  -- segundos que tardó en responder
  difficulty  int not null   -- nivel de dificultad de la pregunta (1-5)
);
