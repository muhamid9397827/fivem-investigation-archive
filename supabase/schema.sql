-- شغّل هذا الملف مرة واحدة داخل Supabase SQL Editor.
-- جميع السجلات هنا تخص Roleplay داخل FiveM وليست سجلات حقيقية.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'investigator', 'leader', 'viewer');
create type public.person_status as enum ('active', 'under_review', 'suspended', 'retired');
create type public.case_status as enum ('open', 'review', 'closed', 'archived');
create type public.case_priority as enum ('low', 'medium', 'high', 'critical');
create type public.evidence_type as enum ('image', 'video', 'document', 'note');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  rank text not null,
  military_number text,
  department text,
  status public.person_status not null default 'active',
  notes text,
  pin_hash text not null default '',
  avatar_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  case_number text not null unique,
  title text not null,
  summary text not null,
  allegations text,
  statements text,
  procedures text,
  findings text,
  decision text,
  recommendations text,
  status public.case_status not null default 'open',
  priority public.case_priority not null default 'medium',
  investigator text not null,
  incident_date timestamptz,
  opened_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  type public.evidence_type not null,
  title text not null,
  description text,
  file_path text,
  mime_type text,
  file_size bigint,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger people_touch_updated_at before update on public.people
for each row execute function public.touch_updated_at();

create trigger cases_touch_updated_at before update on public.cases
for each row execute function public.touch_updated_at();

create trigger evidence_touch_updated_at before update on public.evidence
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.cases enable row level security;
alter table public.evidence enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated users read profiles" on public.profiles
for select to authenticated using (true);
create policy "admins insert profiles" on public.profiles
for insert to authenticated with check (public.current_user_role() = 'admin');
create policy "admins update profiles" on public.profiles
for update to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admins delete profiles" on public.profiles
for delete to authenticated using (public.current_user_role() = 'admin');

create policy "authenticated users read people" on public.people
for select to authenticated using (true);
create policy "staff create people" on public.people
for insert to authenticated with check (public.current_user_role() in ('admin','investigator','leader'));
create policy "staff update people" on public.people
for update to authenticated using (public.current_user_role() in ('admin','investigator','leader'));
create policy "admins delete people" on public.people
for delete to authenticated using (public.current_user_role() = 'admin');

create policy "authenticated users read cases" on public.cases
for select to authenticated using (true);
create policy "staff create cases" on public.cases
for insert to authenticated with check (public.current_user_role() in ('admin','investigator','leader'));
create policy "staff update cases" on public.cases
for update to authenticated using (public.current_user_role() in ('admin','investigator','leader'));
create policy "admins delete cases" on public.cases
for delete to authenticated using (public.current_user_role() = 'admin');

create policy "authenticated users read evidence" on public.evidence
for select to authenticated using (true);
create policy "staff create evidence" on public.evidence
for insert to authenticated with check (public.current_user_role() in ('admin','investigator','leader'));
create policy "staff update evidence" on public.evidence
for update to authenticated using (public.current_user_role() in ('admin','investigator','leader'));
create policy "admins delete evidence" on public.evidence
for delete to authenticated using (public.current_user_role() = 'admin');

create policy "admins read audit logs" on public.audit_logs
for select to authenticated using (public.current_user_role() = 'admin');
create policy "authenticated users add audit logs" on public.audit_logs
for insert to authenticated with check (actor_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-evidence',
  'case-evidence',
  false,
  78643200,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','video/x-matroska','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create policy "authenticated users view evidence files" on storage.objects
for select to authenticated using (bucket_id = 'case-evidence');
create policy "staff upload evidence files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'case-evidence'
  and public.current_user_role() in ('admin','investigator','leader')
);
create policy "admins delete evidence files" on storage.objects
for delete to authenticated using (
  bucket_id = 'case-evidence'
  and public.current_user_role() = 'admin'
);

-- بعد إنشاء أول مستخدم من Authentication > Users، أضف ملفه يدويًا:
-- insert into public.profiles (id, full_name, role)
-- values ('USER_UUID_HERE', 'مدير النظام', 'admin');
