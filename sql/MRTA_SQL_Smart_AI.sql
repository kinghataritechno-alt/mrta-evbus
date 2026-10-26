-- MRTA Shuttle EV · Smart AI (ผู้ช่วยในแอพ) · นับจำนวนข้อความต่อคนต่อวัน เพื่อคุมค่าใช้จ่าย AI
-- จัดทำ 27 ต.ค. 2569 · รันใน Supabase SQL Editor หลังไฟล์ MRTA_SQL_Manager_Agent.sql
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  messages int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage for select to authenticated using (user_id = auth.uid() or app.is_manager());

-- เพิ่มตัวนับของผู้ใช้ที่เรียก แล้วคืนจำนวนข้อความของวันนั้น
create or replace function public.ai_use(p_day date) returns int language sql security definer set search_path = '' as $$
  insert into public.ai_usage(user_id, day, messages) values (auth.uid(), p_day, 1)
  on conflict (user_id, day) do update set messages = public.ai_usage.messages + 1
  returning messages;
$$;
revoke all on function public.ai_use(date) from public, anon;
grant execute on function public.ai_use(date) to authenticated;

select 'ok' as smart_ai_ready;
