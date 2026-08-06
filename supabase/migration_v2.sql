-- ترقية النسخة الأولى إلى النسخة الثانية.
-- شغّل هذا الملف مرة واحدة داخل Supabase SQL Editor إذا سبق أن شغّلت schema.sql القديم.

alter table public.people
  add column if not exists pin_hash text not null default '';

alter table public.cases
  add column if not exists allegations text,
  add column if not exists statements text,
  add column if not exists procedures text,
  add column if not exists findings text,
  add column if not exists recommendations text;

alter table public.evidence
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists evidence_touch_updated_at on public.evidence;
create trigger evidence_touch_updated_at before update on public.evidence
for each row execute function public.touch_updated_at();

update storage.buckets
set file_size_limit = 78643200,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif',
      'video/mp4','video/webm','video/quicktime','video/x-matroska',
      'application/pdf','text/plain','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'case-evidence';
