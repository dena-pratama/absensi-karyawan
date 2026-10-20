-- =====================================================================
-- Skema database: Absensi Ekspedisi (Hub / Cabang / Outlet) — versi sederhana
-- Target : Supabase (PostgreSQL 15+), Free plan
-- Cara   : jalankan seluruh file ini sekali di SQL Editor Supabase
--
-- Scope (lihat DEVLOG.md):
--   - Hanya 1 admin yang login (Supabase Auth, email + password).
--     Karyawan tidak punya akun.
--   - Admin mencentang absensi harian: hadir / sakit / tidak_hadir.
--   - Role = jabatan karyawan (label), bukan hak akses.
--   - Tanpa shift, jam masuk, telat, biometrik, geofence, dokumen,
--     approval, closing periode, insentif.
--
-- Relasi:
--   employee ─< employee_assignment >─ branch ── cluster
--                         │
--                      job_role
--   employee ─< attendance_daily >─ branch / job_role (snapshot per tanggal)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. UTIL
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 1. MASTER DATA
-- ---------------------------------------------------------------------

-- Jabatan karyawan (SPV, Sprinter, Driver CDD, dst.) — hanya label
create table public.job_role (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                     -- 'SPRINTER', 'DRIVER_CDD', ...
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Kluster wilayah
create table public.cluster (
  id    uuid primary key default gen_random_uuid(),
  code  text not null unique,
  name  text not null
);

-- Karyawan (biodata). Penempatan cabang & jabatan ada di employee_assignment.
create table public.employee (
  id             uuid primary key default gen_random_uuid(),
  nik            text not null unique,                   -- ID karyawan, mis. 'EXP-0101'
  full_name      text not null,
  phone_wa       text check (phone_wa ~ '^\+62[0-9]{9,12}$'),
  contract_type  text not null check (contract_type in ('tetap','pkwt','mitra')),
  join_date      date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Cabang / hub / outlet
create table public.branch (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique
                   check (code ~ '^[A-Z]{3}[0-9]{3}[A-Z]$'),    -- 'JKT109A', 'BDO004A'
  name             text not null,
  branch_type      text not null check (branch_type in (
                     'hub_utama','transit_center','sub_hub','drop_point',
                     'dc_sorting','gateway','sub_agent')),
  cluster_id       uuid references public.cluster(id) on delete set null,
  address          text,
  pic_employee_id  uuid references public.employee(id) on delete set null,
  is_24_hours      boolean not null default false,
  gate_open_time   time,
  gate_close_time  time,
  status           text not null default 'aktif'
                   check (status in ('aktif','maintenance','nonaktif')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (is_24_hours or (gate_open_time is not null and gate_close_time is not null))
);

-- Penempatan karyawan: cabang + jabatan. Disimpan sebagai riwayat
-- (valid_from / valid_to) agar mutasi & ganti jabatan tidak merusak data lama.
create table public.employee_assignment (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employee(id) on delete cascade,
  branch_id    uuid not null references public.branch(id)   on delete restrict,
  job_role_id  uuid not null references public.job_role(id) on delete restrict,
  valid_from   date not null default current_date,
  valid_to     date,                                      -- NULL = masih aktif
  check (valid_to is null or valid_to >= valid_from)
);
-- Satu penempatan aktif per karyawan
create unique index employee_one_active_assignment
  on public.employee_assignment (employee_id)
  where valid_to is null;
create index employee_assignment_branch_idx on public.employee_assignment (branch_id);


-- ---------------------------------------------------------------------
-- 2. TRANSAKSI HARIAN (CEKLIS ABSENSI)
-- ---------------------------------------------------------------------

-- Satu baris = satu karyawan pada satu tanggal.
create table public.attendance_daily (
  id               bigint generated always as identity primary key,
  attendance_date  date not null,
  employee_id      uuid not null references public.employee(id) on delete restrict,
  branch_id        uuid not null references public.branch(id)   on delete restrict, -- cabang saat itu
  job_role_id      uuid not null references public.job_role(id) on delete restrict, -- jabatan saat itu
  status           text not null check (status in ('hadir','sakit','tidak_hadir')),
  note             text,                                  -- keterangan singkat
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (employee_id, attendance_date)
);
create index attendance_daily_branch_date_idx on public.attendance_daily (branch_id, attendance_date);
create index attendance_daily_date_idx        on public.attendance_daily (attendance_date);

-- Log perubahan master data (panel "Log Perubahan Terkini")
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text not null,
  action      text not null check (action in ('insert','update','delete')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index audit_log_record_idx  on public.audit_log (table_name, record_id);
create index audit_log_changed_idx on public.audit_log (changed_at desc);


-- ---------------------------------------------------------------------
-- 3. VIEW LAPORAN (rekap bulanan = pivot dari attendance_daily)
--    security_invoker = true supaya RLS tabel dasar tetap berlaku.
-- ---------------------------------------------------------------------
create or replace view public.v_rekap_bulanan with (security_invoker = true) as
select
  date_trunc('month', a.attendance_date)::date                       as period_month,
  a.branch_id,
  a.employee_id,
  count(*) filter (where a.status = 'hadir')                         as hadir,
  count(*) filter (where a.status = 'sakit')                         as sakit,
  count(*) filter (where a.status = 'tidak_hadir')                   as tidak_hadir,
  count(*)                                                           as total_hari,
  round(100.0 * count(*) filter (where a.status = 'hadir')
        / nullif(count(*), 0), 1)                                    as persen_hadir
from public.attendance_daily a
group by 1, 2, 3;


-- ---------------------------------------------------------------------
-- 4. TRIGGER
-- ---------------------------------------------------------------------
create trigger trg_job_role_updated       before update on public.job_role
  for each row execute function public.set_updated_at();
create trigger trg_employee_updated       before update on public.employee
  for each row execute function public.set_updated_at();
create trigger trg_branch_updated         before update on public.branch
  for each row execute function public.set_updated_at();
create trigger trg_attendance_daily_upd   before update on public.attendance_daily
  for each row execute function public.set_updated_at();

-- Isi audit_log otomatis untuk perubahan master data
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce(new.id, old.id)::text,
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

create trigger trg_job_role_audit after insert or update or delete on public.job_role
  for each row execute function public.write_audit_log();
create trigger trg_employee_audit after insert or update or delete on public.employee
  for each row execute function public.write_audit_log();
create trigger trg_branch_audit   after insert or update or delete on public.branch
  for each row execute function public.write_audit_log();


-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--    Hanya 1 admin yang punya akun, jadi semua user yang login (authenticated)
--    boleh akses penuh. Anonim tidak bisa apa-apa.
--    PENTING: matikan "Allow new users to sign up" di Supabase
--    (Authentication → Sign In / Providers) agar tidak ada akun lain.
-- ---------------------------------------------------------------------
alter table public.job_role            enable row level security;
alter table public.cluster             enable row level security;
alter table public.employee            enable row level security;
alter table public.branch              enable row level security;
alter table public.employee_assignment enable row level security;
alter table public.attendance_daily    enable row level security;
alter table public.audit_log           enable row level security;

create policy admin_all on public.job_role            for all to authenticated using (true) with check (true);
create policy admin_all on public.cluster             for all to authenticated using (true) with check (true);
create policy admin_all on public.employee            for all to authenticated using (true) with check (true);
create policy admin_all on public.branch              for all to authenticated using (true) with check (true);
create policy admin_all on public.employee_assignment for all to authenticated using (true) with check (true);
create policy admin_all on public.attendance_daily    for all to authenticated using (true) with check (true);
-- audit_log hanya dibaca dari app; isinya ditulis oleh trigger
create policy admin_read on public.audit_log          for select to authenticated using (true);


-- ---------------------------------------------------------------------
-- 6. DATA AWAL (SEED)
-- ---------------------------------------------------------------------
insert into public.job_role (code, name) values
  ('SPV_OPS',      'SPV Operational Hub'),
  ('ADM_DISPATCH', 'Admin Dispatch'),
  ('SPRINTER',     'Sprinter / Kurir Lapangan'),
  ('DRIVER_CDD',   'Driver CDD / Feeder'),
  ('WH_SORTIR',    'Warehouse Sortir'),
  ('LINEHAUL',     'Line-Haul Coordinator');

insert into public.cluster (code, name) values
  ('BARAT',   'Cluster Barat (Jabodetabek & Banten)'),
  ('JABAR',   'Cluster Jawa Barat (Bandung Raya)'),
  ('JATENG',  'Cluster Jawa Tengah & DIY'),
  ('JATIM',   'Cluster Jawa Timur & Bali');
