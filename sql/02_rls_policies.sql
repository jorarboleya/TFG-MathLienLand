--Each user can only read and write their own data
--users
create policy "Users can read own data" on users
  for select using (auth.uid() = id);

create policy "Users can insert own data" on users
  for insert with check (auth.uid() = id);

create policy "Users can update own data" on users
  for update using (auth.uid() = id);

--sessions
create policy "Users can read own sessions" on sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own sessions" on sessions
  for insert with check (auth.uid() = user_id);

--answers
create policy "Users can read own answers" on answers
  for select using (
    auth.uid() = (select user_id from sessions where id = session_id)
  );

create policy "Users can insert own answers" on answers
  for insert with check (
    auth.uid() = (select user_id from sessions where id = session_id)
  );

-- IDEA H: Achievements
-- Students read/insert only their own badges.
-- Teachers can read badges for students in their groups.
create policy "Users can read own achievements" on achievements
  for select using (auth.uid() = user_id);

create policy "Users can insert own achievements" on achievements
  for insert with check (auth.uid() = user_id);

create policy "Teachers can read group achievements" on achievements
  for select using (
    exists (
      select 1 from group_members gm
      join groups g on g.id = gm.group_id
      where gm.student_id = achievements.user_id
        and g.teacher_id = auth.uid()
    )
  );
