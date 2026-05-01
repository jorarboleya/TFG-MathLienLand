--Creación de las tablas de la base de datos de MathLienLand

--Users table
create table users (
  id            uuid primary key,
  name          text not null,
  email         text not null,
  role          text not null default 'student', -- 'student' | 'teacher'
  register_date timestamptz not null default now()
);

--Sessions table
create table sessions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  minigame  text not null,
  date      timestamptz not null default now(),
  duration  int 
);

--Answers table
create table answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  question_id text not null,
  correct     boolean not null,
  time        int not null,
  difficulty  int not null
);

-- PHASE 1: Teacher role
-- Run ALTER TABLE and CREATE TABLE statements from the SQL block in PLAN.md
-- (these are already applied in Supabase; kept here for documentation)

--Groups table
create table groups (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

--Group members table (students joined to a group)
create table group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique(group_id, student_id)
);

-- IDEA H: Achievements / Badges
-- Run this migration in the Supabase SQL editor before deploying.
create table achievements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  badge_type text not null,
  earned_at  timestamptz not null default now(),
  unique(user_id, badge_type)
);
alter table achievements enable row level security;
