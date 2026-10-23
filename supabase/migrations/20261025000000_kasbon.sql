-- =====================================================================
-- Kasbon (pinjaman gaji di muka)
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Aturan (keputusan user 2026-10-24):
--   plafon  = gaji pokok ÷ pembagi × HK (hari Hadir) pada periode gajian berjalan.
--   gaji pokok per jabatan, bisa di-override per karyawan.
--   pembagi & tanggal cut-off diatur admin (payroll_setting).
--   periode gajian = (cut-off bulan lalu + 1) s/d cut-off bulan ini.
--   kasbon diajukan / disetujui / dicairkan pada periode berjalan mengurangi sisa plafon.
--   pelunasan = potong gaji di akhir periode (otomatis dianggap lunas),
--   admin juga bisa menandai lunas lebih awal.
--   alur: diajukan → disetujui / ditolak → dicairkan (admin unggah bukti foto) → lunas.
--   pengaju bisa membatalkan selama masih diajukan.
--   RLS: setiap akun hanya melihat kasbon miliknya; admin melihat semua.
--
-- Semua aturan uang dihitung di server (fungsi kasbon_*), bukan di app.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PENGATURAN GAJI
-- ---------------------------------------------------------------------
create table if not exists public.payroll_setting (
  id             boolean primary key default true check (id),  -- satu baris saja
  daily_divisor  smallint not null default 26 check (daily_divisor between 1 and 31),
  -- 1..28 = tanggal cut-off; 31 = akhir bulan (periode = bulan kalender)
  cutoff_day     smallint not null default 25 check (cutoff_day between 1 and 28 or cutoff_day = 31),
  updated_at     timestamptz not null default now()
);
insert into public.payroll_setting (id) values (true) on conflict (id) do nothing;

create table if not exists public.job_role_salary (
  job_role_id  uuid primary key references public.job_role(id) on delete cascade,
  base_salary  numeric(14,0) not null check (base_salary >= 0),
  updated_at   timestamptz not null default now()
);

-- Override gaji pokok per karyawan (menang dari gaji jabatan)
create table if not exists public.employee_salary (
  employee_id  uuid primary key references public.employee(id) on delete cascade,
  base_salary  numeric(14,0) not null check (base_salary >= 0),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_payroll_setting_updated on public.payroll_setting;
create trigger trg_payroll_setting_updated before update on public.payroll_setting
  for each row execute function public.set_updated_at();
drop trigger if exists trg_job_role_salary_updated on public.job_role_salary;
create trigger trg_job_role_salary_updated before update on public.job_role_salary
  for each row execute function public.set_updated_at();
drop trigger if exists trg_employee_salary_updated on public.employee_salary;
create trigger trg_employee_salary_updated before update on public.employee_salary
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. KASBON
-- ---------------------------------------------------------------------
create table if not exists public.kasbon (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employee(id) on delete restrict,
  amount         numeric(14,0) not null check (amount > 0),
  note           text check (char_length(note) <= 200),
  status         text not null default 'diajukan'
                 check (status in ('diajukan','disetujui','ditolak','dicairkan','lunas','dibatalkan')),
  period_start   date not null,
  period_end     date not null,
  -- snapshot perhitungan saat diajukan
  base_salary    numeric(14,0) not null,
  daily_divisor  smallint not null,
  hk             integer not null,
  plafon         numeric(14,0) not null,
  available      numeric(14,0) not null,               -- sisa plafon sebelum kasbon ini
  requested_by   uuid references auth.users(id) on delete set null,
  requested_at   timestamptz not null default now(),
  decided_by     uuid references auth.users(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text check (char_length(decision_note) <= 200),
  disbursed_by   uuid references auth.users(id) on delete set null,
  disbursed_at   timestamptz,
  proof_photo    text,                                  -- path di bucket kasbon-proof
  settled_by     uuid references auth.users(id) on delete set null,
  settled_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists kasbon_employee_period_idx on public.kasbon (employee_id, period_start);
create index if not exists kasbon_status_idx on public.kasbon (status, requested_at desc);

drop trigger if exists trg_kasbon_updated on public.kasbon;
create trigger trg_kasbon_updated before update on public.kasbon
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 3. FUNGSI BANTU
-- ---------------------------------------------------------------------

-- Data karyawan yang terhubung ke akun login (semua role, termasuk admin)
create or replace function public.my_linked_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select employee_id from public.app_user where user_id = auth.uid()
$$;

-- Periode gajian yang memuat p_date, mengikuti cut-off di payroll_setting
create or replace function public.payroll_period(p_date date default null)
returns table (period_start date, period_end date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_day   date := coalesce(p_date, public.today_wib());
  v_cut   smallint := coalesce((select cutoff_day from public.payroll_setting where id), 25);
  v_month date := date_trunc('month', v_day)::date;
  v_end   date;
  v_prev  date;
begin
  -- akhir periode di bulan yang sama dengan v_day
  v_end := case when v_cut = 31 then (v_month + interval '1 month' - interval '1 day')::date
                else v_month + (v_cut - 1) end;
  if v_day > v_end then
    v_prev := v_end;
    v_month := (v_month + interval '1 month')::date;
    v_end := case when v_cut = 31 then (v_month + interval '1 month' - interval '1 day')::date
                  else v_month + (v_cut - 1) end;
  else
    v_prev := case when v_cut = 31 then (v_month - interval '1 day')::date
                   else (v_month - interval '1 month')::date + (v_cut - 1) end;
  end if;
  return query select v_prev + 1, v_end;
end;
$$;

-- Hitungan plafon. p_employee null = karyawan milik akun ini; karyawan lain hanya untuk admin.
create or replace function public.kasbon_quota(p_employee uuid default null)
returns table (
  employee_id uuid, period_start date, period_end date,
  base_salary numeric, salary_source text, daily_divisor smallint, daily_rate numeric,
  hk integer, plafon numeric, used numeric, available numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp    uuid := coalesce(p_employee, public.my_linked_employee_id());
  v_today  date := public.today_wib();
  v_start  date;
  v_end    date;
  v_div    smallint := coalesce((select s.daily_divisor from public.payroll_setting s where s.id), 26);
  v_salary numeric;
  v_source text;
  v_hk     integer;
  v_plafon numeric;
  v_used   numeric;
begin
  if v_emp is null then
    raise exception 'Akun ini belum terhubung ke data karyawan. Hubungi admin.';
  end if;
  if p_employee is not null and p_employee is distinct from public.my_linked_employee_id() and not public.is_admin() then
    raise exception 'Tidak punya izin melihat kasbon karyawan lain.' using errcode = '42501';
  end if;

  select p.period_start, p.period_end into v_start, v_end from public.payroll_period(v_today) p;

  select es.base_salary into v_salary from public.employee_salary es where es.employee_id = v_emp;
  if v_salary is not null then
    v_source := 'karyawan';
  else
    select js.base_salary into v_salary
    from public.employee_assignment a
    join public.job_role_salary js on js.job_role_id = a.job_role_id
    where a.employee_id = v_emp and a.valid_from <= v_today and (a.valid_to is null or a.valid_to >= v_today)
    order by a.valid_from desc limit 1;
    v_source := case when v_salary is not null then 'jabatan' end;
  end if;

  select count(*) into v_hk from public.attendance_daily d
  where d.employee_id = v_emp and d.status = 'hadir'
    and d.attendance_date between v_start and least(v_end, v_today);

  v_plafon := floor(coalesce(v_salary, 0) * v_hk / v_div);

  select coalesce(sum(k.amount), 0) into v_used from public.kasbon k
  where k.employee_id = v_emp and k.period_start = v_start
    and k.status in ('diajukan','disetujui','dicairkan');

  return query select v_emp, v_start, v_end, coalesce(v_salary, 0), v_source, v_div,
    floor(coalesce(v_salary, 0) / v_div), v_hk, v_plafon, v_used, greatest(v_plafon - v_used, 0);
end;
$$;

-- Ajukan kasbon untuk diri sendiri (semua role yang terhubung ke data karyawan)
create or replace function public.kasbon_request(p_amount numeric, p_note text default null)
returns public.kasbon
language plpgsql volatile security definer set search_path = public as $$
declare
  q   record;
  v_row public.kasbon;
begin
  if public.current_app_role() is null then
    raise exception 'Akun ini belum diberi akses.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'Nominal kasbon harus angka rupiah lebih dari 0.';
  end if;

  select * into q from public.kasbon_quota(null);
  -- kunci per karyawan supaya dua pengajuan bersamaan tidak melewati plafon
  perform pg_advisory_xact_lock(hashtext('kasbon:' || q.employee_id::text));
  select * into q from public.kasbon_quota(null);

  if q.salary_source is null then
    raise exception 'Gaji pokok Anda belum diatur. Hubungi admin.';
  end if;
  if p_amount > q.available then
    raise exception 'Nominal melebihi sisa plafon (Rp%).', replace(to_char(q.available, 'FM999,999,999,999'), ',', '.');
  end if;

  insert into public.kasbon (employee_id, amount, note, period_start, period_end,
    base_salary, daily_divisor, hk, plafon, available, requested_by)
  values (q.employee_id, p_amount, nullif(trim(left(p_note, 200)), ''), q.period_start, q.period_end,
    q.base_salary, q.daily_divisor, q.hk, q.plafon, q.available, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

-- Batalkan pengajuan sendiri yang belum diproses
create or replace function public.kasbon_cancel(p_id uuid)
returns public.kasbon
language plpgsql volatile security definer set search_path = public as $$
declare v_row public.kasbon;
begin
  update public.kasbon set status = 'dibatalkan'
  where id = p_id and status = 'diajukan' and employee_id = public.my_linked_employee_id()
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Kasbon tidak ditemukan atau sudah diproses.';
  end if;
  return v_row;
end;
$$;

-- Admin: setujui / tolak
create or replace function public.kasbon_decide(p_id uuid, p_approve boolean, p_note text default null)
returns public.kasbon
language plpgsql volatile security definer set search_path = public as $$
declare v_row public.kasbon;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa memproses kasbon.' using errcode = '42501';
  end if;
  update public.kasbon
  set status = case when p_approve then 'disetujui' else 'ditolak' end,
      decided_by = auth.uid(), decided_at = now(),
      decision_note = nullif(trim(left(p_note, 200)), '')
  where id = p_id and status = 'diajukan'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Kasbon tidak ditemukan atau sudah diproses.';
  end if;
  return v_row;
end;
$$;

-- Admin: tandai dicairkan dengan bukti foto (sudah diunggah ke bucket kasbon-proof)
create or replace function public.kasbon_disburse(p_id uuid, p_photo text)
returns public.kasbon
language plpgsql volatile security definer set search_path = public as $$
declare v_row public.kasbon;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mencairkan kasbon.' using errcode = '42501';
  end if;
  if p_photo is null or not exists (
    select 1 from storage.objects o where o.bucket_id = 'kasbon-proof' and o.name = p_photo
  ) then
    raise exception 'Bukti foto pencairan belum diunggah.';
  end if;
  update public.kasbon
  set status = 'dicairkan', disbursed_by = auth.uid(), disbursed_at = now(), proof_photo = p_photo
  where id = p_id and status = 'disetujui'
    and split_part(p_photo, '/', 1) = employee_id::text
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Kasbon tidak ditemukan, belum disetujui, atau bukti tidak cocok.';
  end if;
  return v_row;
end;
$$;

-- Admin: tandai lunas lebih awal (selain otomatis lewat potong gaji di akhir periode)
create or replace function public.kasbon_settle(p_id uuid)
returns public.kasbon
language plpgsql volatile security definer set search_path = public as $$
declare v_row public.kasbon;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menandai lunas.' using errcode = '42501';
  end if;
  update public.kasbon set status = 'lunas', settled_by = auth.uid(), settled_at = now()
  where id = p_id and status = 'dicairkan'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Kasbon tidak ditemukan atau belum dicairkan.';
  end if;
  return v_row;
end;
$$;

revoke execute on function public.my_linked_employee_id(), public.payroll_period(date),
  public.kasbon_quota(uuid), public.kasbon_request(numeric, text), public.kasbon_cancel(uuid),
  public.kasbon_decide(uuid, boolean, text), public.kasbon_disburse(uuid, text), public.kasbon_settle(uuid)
  from public, anon;
grant execute on function public.my_linked_employee_id(), public.payroll_period(date),
  public.kasbon_quota(uuid), public.kasbon_request(numeric, text), public.kasbon_cancel(uuid),
  public.kasbon_decide(uuid, boolean, text), public.kasbon_disburse(uuid, text), public.kasbon_settle(uuid)
  to authenticated;


-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.payroll_setting enable row level security;
alter table public.job_role_salary enable row level security;
alter table public.employee_salary enable row level security;
alter table public.kasbon          enable row level security;

drop policy if exists rls_admin_all   on public.payroll_setting;
drop policy if exists rls_member_read on public.payroll_setting;
drop policy if exists rls_admin_all   on public.job_role_salary;
drop policy if exists rls_admin_all   on public.employee_salary;
drop policy if exists rls_admin_read  on public.kasbon;
drop policy if exists rls_self_read   on public.kasbon;

-- Pengaturan: admin ubah; pembagi & cut-off boleh dibaca semua akun ber-role
create policy rls_admin_all on public.payroll_setting for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_member_read on public.payroll_setting for select to authenticated
  using ((select public.current_app_role()) is not null);
-- Data gaji: hanya admin (karyawan melihat gajinya lewat kasbon_quota)
create policy rls_admin_all on public.job_role_salary for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_all on public.employee_salary for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Kasbon: baca saja. Semua perubahan lewat fungsi kasbon_* di atas.
create policy rls_admin_read on public.kasbon for select to authenticated
  using ((select public.is_admin()));
create policy rls_self_read on public.kasbon for select to authenticated
  using (employee_id = (select public.my_linked_employee_id()));


-- ---------------------------------------------------------------------
-- 5. STORAGE: bukti pencairan (privat). Path: <employee_id>/<kasbon_id>-<waktu>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kasbon-proof', 'kasbon-proof', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kasbon_proof_insert on storage.objects;
drop policy if exists kasbon_proof_read   on storage.objects;

create policy kasbon_proof_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'kasbon-proof' and (select public.is_admin()));

create policy kasbon_proof_read on storage.objects for select to authenticated
  using (
    bucket_id = 'kasbon-proof'
    and (
      (select public.is_admin())
      or (storage.foldername(name))[1] = (select public.my_linked_employee_id())::text
    )
  );
