-- ============================================================
-- 02_rls_policies.sql
-- Políticas de seguridad Row Level Security (RLS)
-- Cada usuario solo puede leer y escribir sus propios datos.
-- ============================================================

-- users
create policy "Users can read own data" on users
  for select using (auth.uid() = id);

create policy "Users can insert own data" on users
  for insert with check (auth.uid() = id);

create policy "Users can update own data" on users
  for update using (auth.uid() = id);

-- sessions
create policy "Users can read own sessions" on sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own sessions" on sessions
  for insert with check (auth.uid() = user_id);

-- answers
create policy "Users can read own answers" on answers
  for select using (
    auth.uid() = (select user_id from sessions where id = session_id)
  );

create policy "Users can insert own answers" on answers
  for insert with check (
    auth.uid() = (select user_id from sessions where id = session_id)
  );
