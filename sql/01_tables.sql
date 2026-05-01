--Creación de las tablas de la base de datos de MathLienLand

--Users table
create table users (
  id            uuid primary key,
  name          text not null,
  email         text not null,
  role          text not null default 'student', -- 'student' | 'teacher'
  register_date timestamptz not null default now()
);
alter table users enable row level security;

--Groups table (must come before sessions so group_id FK resolves)
create table groups (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  eso_level  smallint not null default 2 -- 1 = 1st ESO (difficulty 3), 2 = 2nd ESO (difficulty 5)
);
alter table groups enable row level security;

--Sessions table
create table sessions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  minigame  text not null,
  date      timestamptz not null default now(),
  duration  int,
  group_id  uuid references groups(id) on delete set null
);
alter table sessions enable row level security;

--Answers table
create table answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  question_id text not null,
  correct     boolean not null,
  time        int not null check (time >= 0),
  difficulty  int not null check (difficulty >= 1 and difficulty <= 10)
);
alter table answers enable row level security;

--Group members table (students joined to a group)
create table group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique(group_id, student_id)
);
alter table group_members enable row level security;

--Achievements / Badges
create table achievements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  badge_type text not null,
  earned_at  timestamptz not null default now(),
  unique(user_id, badge_type)
);
alter table achievements enable row level security;

-- AI Summaries cache (student self-view and teacher analysis)
create table ai_summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  summary_type text not null,  -- 'student' | 'group-<groupId>' | 'student-<studentId>-<groupId>'
  content      text not null,
  generated_at timestamptz not null default now(),
  unique(user_id, summary_type)
);
alter table ai_summaries enable row level security;
