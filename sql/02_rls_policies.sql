--Each user can only read and write their own data

--users
create policy "Users can read own data" on users
  for select using (auth.uid() = id);

create policy "Users can insert own data" on users
  for insert with check (auth.uid() = id);

create policy "Users can update own data" on users
  for update using (auth.uid() = id);

--sessions: students own their sessions; teachers can read sessions from their group members
create policy "Users can read own sessions" on sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own sessions" on sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own sessions" on sessions
  for update using (auth.uid() = user_id);

create policy "Teachers can read group sessions" on sessions
  for select using (
    group_id is not null and exists (
      select 1 from groups g where g.id = sessions.group_id and g.teacher_id = auth.uid()
    )
  );

--answers: students own their answers; teachers can read answers via group sessions
create policy "Users can read own answers" on answers
  for select using (
    auth.uid() = (select user_id from sessions where id = session_id)
  );

create policy "Users can insert own answers" on answers
  for insert with check (
    auth.uid() = (select user_id from sessions where id = session_id)
  );

create policy "Teachers can read group answers" on answers
  for select using (
    exists (
      select 1 from sessions s
      join groups g on g.id = s.group_id
      where s.id = answers.session_id and g.teacher_id = auth.uid()
    )
  );

--groups: teachers manage their own groups; students can read groups they belong to
create policy "Teachers can manage own groups" on groups
  for all using (auth.uid() = teacher_id);

create policy "Students can read joined groups" on groups
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = groups.id and gm.student_id = auth.uid()
    )
  );

--group_members: teachers manage members of their groups; students can read/insert their own memberships
create policy "Teachers can manage group members" on group_members
  for all using (
    exists (
      select 1 from groups g where g.id = group_members.group_id and g.teacher_id = auth.uid()
    )
  );

create policy "Students can read own memberships" on group_members
  for select using (auth.uid() = student_id);

create policy "Students can join groups" on group_members
  for insert with check (auth.uid() = student_id);

--achievements: students read/insert only their own badges; teachers can read badges for their students
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

--ai_summaries: each user reads/writes only their own cached summaries
create policy "Users can read own summaries" on ai_summaries
  for select using (auth.uid() = user_id);

create policy "Users can insert own summaries" on ai_summaries
  for insert with check (auth.uid() = user_id);

create policy "Users can update own summaries" on ai_summaries
  for update using (auth.uid() = user_id);
