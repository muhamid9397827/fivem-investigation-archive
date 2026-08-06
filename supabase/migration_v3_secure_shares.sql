-- ترقية النسخة الثالثة: روابط مشاركة خارجية محدودة للقضايا.
-- شغّل هذا الملف مرة واحدة داخل Supabase SQL Editor بعد schema.sql أو migration_v2.sql.

create table if not exists public.case_shares (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  token_hash text not null unique,
  pin_hash text,
  pin_salt text,
  expires_at timestamptz,
  max_views integer check (max_views is null or max_views > 0),
  view_count integer not null default 0 check (view_count >= 0),
  include_evidence boolean not null default true,
  allow_download boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  revoked_at timestamptz
);

create index if not exists case_shares_case_id_idx on public.case_shares(case_id);
create index if not exists case_shares_active_idx on public.case_shares(case_id, revoked_at, expires_at);

alter table public.case_shares enable row level security;

-- لا نسمح للمتصفح بقراءة بصمات الرموز مباشرة؛ جميع العمليات تمر عبر Edge Function.
revoke all on table public.case_shares from anon, authenticated;

create or replace function public.consume_case_share(p_share_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.case_shares
  set view_count = view_count + 1,
      last_viewed_at = now()
  where id = p_share_id
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (max_views is null or view_count < max_views);

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.consume_case_share(uuid) from public, anon, authenticated;
grant execute on function public.consume_case_share(uuid) to service_role;
