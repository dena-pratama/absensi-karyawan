-- =====================================================================
-- Jatah libur, pengajuan libur & tukar off
-- Jalankan sekali di SQL Editor Supabase SETELAH 20261031000000_reset_data.sql.
-- Aman dijalankan ulang.
--
-- Keputusan user (2026-10-27):
--   - Status absensi baru 'libur' (tidak dihitung tidak hadir).
--   - Jatah libur per jabatan (override per karyawan), dihitung per PERIODE GAJIAN.
--   - Pengajuan dari app; disetujui SPV cabangnya, atau admin / Office.
--   - Karyawan tetap boleh check in di hari liburnya → status jadi Hadir, libur ditandai
--     'masuk', dan karyawan dapat 1 SALDO OFF PENGGANTI (berlaku N hari, default 30).
--   - Tukar off, 3 bentuk:
--       1) off pengganti   : ajukan libur memakai saldo off pengganti (tidak memotong jatah);
--       2) pindah off       : pindahkan libur yang sudah disetujui ke tanggal lain;
--       3) tukar dengan rekan: dua karyawan satu cabang bertukar tanggal libur
--                              (rekan konfirmasi dulu, lalu SPV / admin menyetujui).
--   - Libur tidak boleh bentrok dengan penugasan backup.
-- Semua perubahan lewat fungsi day_off_* (RLS tabel = baca saja).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. STATUS ABSENSI 'libur'
-- ---------------------------------------------------------------------
alter table public.attendance_daily drop constraint if exists attendance_daily_status_check;
alter table public.attendance_daily add constraint attendance_daily_status_check
  check (status in ('hadir','sakit','tidak_hadir','libur'));


-- ---------------------------------------------------------------------
-- 2. PENGATURAN JATAH
-- ---------------------------------------------------------------------
create table if not exists public.day_off_setting (
  id                boolean primary key default true check (id),
  comp_valid_days   smallint not null default 30 check (comp_valid_days between 1 and 365),
  updated_at        timestamptz not null default now()
);
insert into public.day_off_setting (id) values (true) on conflict (id) do nothing;

create table if not exists public.job_role_day_off (
  job_role_id  uuid primary key references public.job_role(id) on delete cascade,
  days         smallint not null check (days between 0 and 31),
  updated_at   timestamptz not null default now()
);

create table if not exists public.employee_day_off (
  employee_id  uuid primary key references public.employee(id) on delete cascade,
  days         smallint not null check (days between 0 and 31),
  updated_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. LIBUR, SALDO OFF PENGGANTI, TUKAR OFF
-- ---------------------------------------------------------------------
create table if not exists public.day_off (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employee(id) on delete cascade,
  off_date      date not null,
  -- jatah = memotong jatah periode; pengganti = memakai saldo off pengganti
  kind          text not null check (kind in ('jatah','pengganti')),
  status        text not null default 'diajukan'
                check (status in ('diajukan','disetujui','ditolak','dibatalkan','dipindah','masuk')),
  period_start  date not null,
  note          text check (char_length(note) <= 200),
  replaces_id   uuid references public.day_off(id) on delete set null,  -- pengajuan pindah off
  credit_id     uuid,                                                  -- saldo yang dipakai (kind pengganti)
  requested_by  uuid references auth.users(id) on delete set null,
  requested_at  timestamptz not null default now(),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  decision_note text check (char_length(decision_note) <= 200),
  updated_at    timestamptz not null default now()
);
-- Satu libur aktif per karyawan per tanggal
create unique index if not exists day_off_one_active on public.day_off (employee_id, off_date)
  where status in ('diajukan','disetujui','masuk');
create index if not exists day_off_date_idx on public.day_off (off_date);

create table if not exists public.day_off_credit (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employee(id) on delete cascade,
  earned_date  date not null,           -- tanggal masuk di hari libur
  expires_on   date not null,
  source_id    uuid references public.day_off(id) on delete set null,
  used_by      uuid references public.day_off(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists day_off_credit_emp_idx on public.day_off_credit (employee_id, expires_on);
do $$ begin
  alter table public.day_off add constraint day_off_credit_fk foreign key (credit_id) references public.day_off_credit(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.day_off_swap (
  id               uuid primary key default gen_random_uuid(),
  requester_off_id uuid not null references public.day_off(id) on delete cascade,
  partner_off_id   uuid not null references public.day_off(id) on delete cascade,
  requester_id     uuid not null references public.employee(id) on delete cascade,
  partner_id       uuid not null references public.employee(id) on delete cascade,
  status           text not null default 'menunggu_rekan'
                   check (status in ('menunggu_rekan','menunggu_atasan','disetujui','ditolak','dibatalkan')),
  note             text check (char_length(note) <= 200),
  requested_at     timestamptz not null default now(),
  partner_at       timestamptz,
  decided_by       uuid references auth.users(id) on delete set null,
  decided_at       timestamptz
);
create index if not exists day_off_swap_partner_idx on public.day_off_swap (partner_id, status);

drop trigger if exists trg_day_off_updated on public.day_off;
create trigger trg_day_off_updated before update on public.day_off for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. FUNGSI BANTU
-- ---------------------------------------------------------------------

-- Jatah libur per periode untuk karyawan (override karyawan > jabatan saat itu > 0)
create or replace function public.day_off_quota_days(p_emp uuid, p_date date)
returns smallint language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.days from public.employee_day_off e where e.employee_id = p_emp),
    (select j.days from public.employee_assignment a join public.job_role_day_off j on j.job_role_id = a.job_role_id
     where a.employee_id = p_emp and a.valid_from <= p_date and (a.valid_to is null or a.valid_to >= p_date)
     order by a.valid_from desc limit 1),
    0)::smallint
$$;

-- Boleh mengelola (menyetujui) libur karyawan ini? admin / office / SPV cabang penempatannya
create or replace function public.can_manage_employee(p_emp uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.current_app_role() = 'office'
      or (public.current_app_role() = 'spv'
          and public.home_branch_on(p_emp, p_date) = any (public.my_branch_ids()))
$$;

-- Tulis / hapus baris absensi 'libur' untuk libur yang disetujui
create or replace function public.day_off_apply_attendance(p_emp uuid, p_date date, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_branch uuid; v_role uuid; v_row public.attendance_daily;
begin
  select * into v_row from public.attendance_daily where employee_id = p_emp and attendance_date = p_date;
  if p_on then
    if v_row.id is not null then
      if v_row.status = 'libur' then return; end if;
      raise exception 'Tanggal % sudah tercatat "%" di absensi.', p_date, v_row.status;
    end if;
    select a.branch_id, a.job_role_id into v_branch, v_role from public.employee_assignment a
    where a.employee_id = p_emp and a.valid_from <= p_date and (a.valid_to is null or a.valid_to >= p_date)
    order by a.valid_from desc limit 1;
    if v_branch is null then
      raise exception 'Karyawan belum punya penempatan pada %.', p_date;
    end if;
    insert into public.attendance_daily (attendance_date, employee_id, branch_id, job_role_id, status, note, created_by, updated_by)
    values (p_date, p_emp, v_branch, v_role, 'libur', 'Libur (jadwal)', auth.uid(), auth.uid());
  elsif v_row.id is not null and v_row.status = 'libur' and v_row.check_in_at is null then
    delete from public.attendance_daily where id = v_row.id;
  end if;
end;
$$;

-- Validasi tanggal libur untuk karyawan (tidak lampau, tidak bentrok absensi / backup / libur lain)
create or replace function public.day_off_check_date(p_emp uuid, p_date date, p_ignore uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_date < public.today_wib() then
    raise exception 'Tanggal libur tidak boleh di masa lalu.';
  end if;
  if exists (select 1 from public.attendance_daily d where d.employee_id = p_emp and d.attendance_date = p_date and d.status <> 'libur') then
    raise exception 'Tanggal % sudah ada absensinya.', p_date;
  end if;
  if exists (select 1 from public.employee_backup b where b.employee_id = p_emp and p_date between b.date_from and b.date_to) then
    raise exception 'Tanggal % bentrok dengan jadwal backup.', p_date;
  end if;
  if exists (select 1 from public.day_off o where o.employee_id = p_emp and o.off_date = p_date
             and o.status in ('diajukan','disetujui','masuk') and o.id is distinct from p_ignore) then
    raise exception 'Sudah ada libur di tanggal %.', p_date;
  end if;
end;
$$;

-- Saldo off pengganti yang masih bisa dipakai
create or replace function public.day_off_free_credit(p_emp uuid, p_date date)
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.day_off_credit c
  where c.employee_id = p_emp and c.used_by is null and c.expires_on >= p_date
  order by c.expires_on, c.created_at limit 1
$$;


-- ---------------------------------------------------------------------
-- 5. FUNGSI UNTUK APP & WEB
-- ---------------------------------------------------------------------

-- Ringkasan jatah: periode berjalan (atau periode p_date), jatah, terpakai, sisa, saldo off pengganti
create or replace function public.day_off_quota(p_employee uuid default null, p_date date default null)
returns table (employee_id uuid, period_start date, period_end date, quota smallint, used integer, pending integer,
               available integer, credits integer, next_credit_expiry date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp uuid := coalesce(p_employee, public.my_linked_employee_id());
  v_day date := coalesce(p_date, public.today_wib());
  v_s date; v_e date; v_q smallint; v_used int; v_pend int;
begin
  if v_emp is null then raise exception 'Akun ini belum terhubung ke data karyawan. Hubungi admin.'; end if;
  if p_employee is not null and p_employee is distinct from public.my_linked_employee_id()
     and not public.can_manage_employee(p_employee, v_day) then
    raise exception 'Tidak punya izin melihat jatah libur karyawan ini.' using errcode = '42501';
  end if;
  select p.period_start, p.period_end into v_s, v_e from public.payroll_period(v_day) p;
  v_q := public.day_off_quota_days(v_emp, v_day);
  select count(*) filter (where o.status in ('disetujui','masuk')), count(*) filter (where o.status = 'diajukan')
    into v_used, v_pend
  from public.day_off o where o.employee_id = v_emp and o.kind = 'jatah' and o.off_date between v_s and v_e;
  return query
    select v_emp, v_s, v_e, v_q, v_used, v_pend, greatest(v_q - v_used - v_pend, 0),
      (select count(*)::int from public.day_off_credit c where c.employee_id = v_emp and c.used_by is null and c.expires_on >= public.today_wib()),
      (select min(c.expires_on) from public.day_off_credit c where c.employee_id = v_emp and c.used_by is null and c.expires_on >= public.today_wib());
end;
$$;

-- Ajukan libur (jatah / pengganti), atau pindah libur (p_replaces = libur lama yang sudah disetujui)
create or replace function public.day_off_request(p_date date, p_kind text default 'jatah', p_note text default null, p_replaces uuid default null)
returns public.day_off
language plpgsql volatile security definer set search_path = public as $$
declare
  v_emp uuid := public.my_linked_employee_id();
  v_old public.day_off;
  v_kind text := p_kind;
  v_q record;
  v_credit uuid;
  v_row public.day_off;
begin
  if v_emp is null then raise exception 'Akun ini belum terhubung ke data karyawan. Hubungi admin.'; end if;
  perform pg_advisory_xact_lock(hashtext('day_off:' || v_emp::text));

  if p_replaces is not null then
    select * into v_old from public.day_off where id = p_replaces and employee_id = v_emp;
    if v_old.id is null or v_old.status <> 'disetujui' then
      raise exception 'Libur yang mau dipindah tidak ditemukan atau belum disetujui.';
    end if;
    if v_old.off_date < public.today_wib() then
      raise exception 'Libur yang sudah lewat tidak bisa dipindah.';
    end if;
    if exists (select 1 from public.day_off d where d.replaces_id = v_old.id and d.status = 'diajukan') then
      raise exception 'Libur ini sudah punya pengajuan pindah yang menunggu persetujuan.';
    end if;
    v_kind := v_old.kind; -- pindah tidak memotong jatah lagi
  end if;

  if v_kind not in ('jatah','pengganti') then raise exception 'Jenis libur tidak dikenal.'; end if;
  perform public.day_off_check_date(v_emp, p_date, p_replaces);

  if p_replaces is null and v_kind = 'jatah' then
    select * into v_q from public.day_off_quota(null, p_date);
    if v_q.available <= 0 then
      raise exception 'Jatah libur periode ini sudah habis (% hari). Pakai off pengganti bila ada.', v_q.quota;
    end if;
  elsif p_replaces is null and v_kind = 'pengganti' then
    v_credit := public.day_off_free_credit(v_emp, p_date);
    if v_credit is null then raise exception 'Tidak ada saldo off pengganti yang berlaku untuk tanggal itu.'; end if;
  end if;

  insert into public.day_off (employee_id, off_date, kind, period_start, note, replaces_id, credit_id, requested_by)
  values (v_emp, p_date, v_kind, (select period_start from public.payroll_period(p_date)),
          nullif(trim(left(p_note, 200)), ''), p_replaces, case when p_replaces is null then v_credit else v_old.credit_id end, auth.uid())
  returning * into v_row;
  if v_credit is not null then
    update public.day_off_credit set used_by = v_row.id where id = v_credit;
  end if;
  return v_row;
end;
$$;

-- Batalkan pengajuan sendiri yang belum diproses (saldo off pengganti dikembalikan)
create or replace function public.day_off_cancel(p_id uuid)
returns public.day_off
language plpgsql volatile security definer set search_path = public as $$
declare v_row public.day_off;
begin
  update public.day_off set status = 'dibatalkan'
  where id = p_id and status = 'diajukan' and employee_id = public.my_linked_employee_id()
  returning * into v_row;
  if v_row.id is null then raise exception 'Pengajuan tidak ditemukan atau sudah diproses.'; end if;
  if v_row.replaces_id is null then
    update public.day_off_credit set used_by = null where used_by = v_row.id;
  end if;
  return v_row;
end;
$$;

-- Setujui / tolak pengajuan libur (SPV cabangnya, admin, office)
create or replace function public.day_off_decide(p_id uuid, p_approve boolean, p_note text default null)
returns public.day_off
language plpgsql volatile security definer set search_path = public as $$
declare v_row public.day_off; v_old public.day_off;
begin
  select * into v_row from public.day_off where id = p_id for update;
  if v_row.id is null or v_row.status <> 'diajukan' then raise exception 'Pengajuan tidak ditemukan atau sudah diproses.'; end if;
  if not public.can_manage_employee(v_row.employee_id, v_row.off_date) then
    raise exception 'Tidak punya izin memproses libur karyawan ini.' using errcode = '42501';
  end if;
  if v_row.employee_id = public.my_linked_employee_id() and not public.is_admin() then
    raise exception 'Libur sendiri harus disetujui atasan lain.' using errcode = '42501';
  end if;

  if p_approve then
    perform public.day_off_check_date(v_row.employee_id, v_row.off_date, v_row.id);
    if v_row.replaces_id is not null then
      select * into v_old from public.day_off where id = v_row.replaces_id for update;
      if v_old.status <> 'disetujui' then raise exception 'Libur lama sudah berubah, pengajuan pindah tidak berlaku.'; end if;
      update public.day_off set status = 'dipindah' where id = v_old.id;
      perform public.day_off_apply_attendance(v_old.employee_id, v_old.off_date, false);
      update public.day_off_credit set used_by = v_row.id where used_by = v_old.id;
    end if;
    perform public.day_off_apply_attendance(v_row.employee_id, v_row.off_date, true);
  end if;

  update public.day_off
  set status = case when p_approve then 'disetujui' else 'ditolak' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(left(p_note, 200)), '')
  where id = p_id returning * into v_row;
  if not p_approve and v_row.replaces_id is null then
    update public.day_off_credit set used_by = null where used_by = v_row.id;
  end if;
  return v_row;
end;
$$;

-- Ajukan tukar off dengan rekan satu cabang: libur saya (disetujui) ↔ libur rekan (disetujui)
create or replace function public.day_off_swap_request(p_my_off uuid, p_partner_off uuid, p_note text default null)
returns public.day_off_swap
language plpgsql volatile security definer set search_path = public as $$
declare
  v_emp uuid := public.my_linked_employee_id();
  a public.day_off; b public.day_off; v_row public.day_off_swap;
begin
  select * into a from public.day_off where id = p_my_off;
  select * into b from public.day_off where id = p_partner_off;
  if a.id is null or a.employee_id is distinct from v_emp or a.status <> 'disetujui' then
    raise exception 'Libur Anda tidak ditemukan atau belum disetujui.';
  end if;
  if b.id is null or b.status <> 'disetujui' or b.employee_id = v_emp then
    raise exception 'Libur rekan tidak ditemukan atau belum disetujui.';
  end if;
  if a.off_date < public.today_wib() or b.off_date < public.today_wib() then
    raise exception 'Libur yang sudah lewat tidak bisa ditukar.';
  end if;
  if a.off_date = b.off_date then raise exception 'Tanggal libur sama, tidak perlu ditukar.'; end if;
  if public.home_branch_on(a.employee_id, a.off_date) is distinct from public.home_branch_on(b.employee_id, b.off_date) then
    raise exception 'Tukar off hanya dengan rekan satu cabang.';
  end if;
  if exists (select 1 from public.day_off_swap s where s.status in ('menunggu_rekan','menunggu_atasan')
             and (s.requester_off_id in (a.id, b.id) or s.partner_off_id in (a.id, b.id))) then
    raise exception 'Salah satu libur ini sudah ada di pengajuan tukar lain.';
  end if;
  insert into public.day_off_swap (requester_off_id, partner_off_id, requester_id, partner_id, note)
  values (a.id, b.id, a.employee_id, b.employee_id, nullif(trim(left(p_note, 200)), ''))
  returning * into v_row;
  return v_row;
end;
$$;

-- Rekan menerima / menolak tukar off
create or replace function public.day_off_swap_respond(p_id uuid, p_accept boolean)
returns public.day_off_swap
language plpgsql volatile security definer set search_path = public as $$
declare v_row public.day_off_swap;
begin
  update public.day_off_swap
  set status = case when p_accept then 'menunggu_atasan' else 'ditolak' end, partner_at = now()
  where id = p_id and status = 'menunggu_rekan' and partner_id = public.my_linked_employee_id()
  returning * into v_row;
  if v_row.id is null then raise exception 'Pengajuan tukar tidak ditemukan atau sudah diproses.'; end if;
  return v_row;
end;
$$;

-- Pengaju membatalkan tukar off yang belum selesai
create or replace function public.day_off_swap_cancel(p_id uuid)
returns public.day_off_swap
language plpgsql volatile security definer set search_path = public as $$
declare v_row public.day_off_swap;
begin
  update public.day_off_swap set status = 'dibatalkan'
  where id = p_id and status in ('menunggu_rekan','menunggu_atasan') and requester_id = public.my_linked_employee_id()
  returning * into v_row;
  if v_row.id is null then raise exception 'Pengajuan tukar tidak ditemukan atau sudah diproses.'; end if;
  return v_row;
end;
$$;

-- Atasan (SPV cabang / admin / office) menyetujui → tanggal libur kedua karyawan ditukar
create or replace function public.day_off_swap_decide(p_id uuid, p_approve boolean)
returns public.day_off_swap
language plpgsql volatile security definer set search_path = public as $$
declare s public.day_off_swap; a public.day_off; b public.day_off;
begin
  select * into s from public.day_off_swap where id = p_id for update;
  if s.id is null or s.status <> 'menunggu_atasan' then raise exception 'Pengajuan tukar tidak ditemukan atau belum dikonfirmasi rekan.'; end if;
  select * into a from public.day_off where id = s.requester_off_id for update;
  select * into b from public.day_off where id = s.partner_off_id for update;
  if not public.can_manage_employee(a.employee_id, a.off_date) then
    raise exception 'Tidak punya izin memproses tukar off ini.' using errcode = '42501';
  end if;

  if p_approve then
    if a.status <> 'disetujui' or b.status <> 'disetujui' then raise exception 'Salah satu libur sudah berubah, tukar tidak berlaku.'; end if;
    -- lepas dulu baris absensi libur lama, cek tanggal baru, lalu tukar
    perform public.day_off_apply_attendance(a.employee_id, a.off_date, false);
    perform public.day_off_apply_attendance(b.employee_id, b.off_date, false);
    update public.day_off set off_date = '1900-01-01' where id in (a.id, b.id); -- hindari bentrok indeks unik sementara
    perform public.day_off_check_date(a.employee_id, b.off_date, a.id);
    perform public.day_off_check_date(b.employee_id, a.off_date, b.id);
    update public.day_off set off_date = b.off_date, period_start = (select period_start from public.payroll_period(b.off_date)) where id = a.id;
    update public.day_off set off_date = a.off_date, period_start = (select period_start from public.payroll_period(a.off_date)) where id = b.id;
    perform public.day_off_apply_attendance(a.employee_id, b.off_date, true);
    perform public.day_off_apply_attendance(b.employee_id, a.off_date, true);
  end if;

  update public.day_off_swap set status = case when p_approve then 'disetujui' else 'ditolak' end,
    decided_by = auth.uid(), decided_at = now()
  where id = p_id returning * into s;
  return s;
end;
$$;

-- Dipanggil attendance_check: karyawan check in di hari liburnya → libur 'masuk' + saldo off pengganti
create or replace function public.day_off_mark_worked(p_emp uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare v_off public.day_off; v_days smallint;
begin
  select * into v_off from public.day_off where employee_id = p_emp and off_date = p_date and status = 'disetujui' limit 1;
  if v_off.id is null then return; end if;
  update public.day_off set status = 'masuk' where id = v_off.id;
  v_days := coalesce((select comp_valid_days from public.day_off_setting where id), 30);
  insert into public.day_off_credit (employee_id, earned_date, expires_on, source_id)
  values (p_emp, p_date, p_date + v_days, v_off.id);
end;
$$;

revoke execute on function public.day_off_quota_days(uuid, date), public.can_manage_employee(uuid, date),
  public.day_off_apply_attendance(uuid, date, boolean), public.day_off_check_date(uuid, date, uuid),
  public.day_off_free_credit(uuid, date), public.day_off_mark_worked(uuid, date) from public, anon, authenticated;
revoke execute on function public.day_off_quota(uuid, date), public.day_off_request(date, text, text, uuid),
  public.day_off_cancel(uuid), public.day_off_decide(uuid, boolean, text), public.day_off_swap_request(uuid, uuid, text),
  public.day_off_swap_respond(uuid, boolean), public.day_off_swap_cancel(uuid), public.day_off_swap_decide(uuid, boolean)
  from public, anon;
grant execute on function public.day_off_quota(uuid, date), public.day_off_request(date, text, text, uuid),
  public.day_off_cancel(uuid), public.day_off_decide(uuid, boolean, text), public.day_off_swap_request(uuid, uuid, text),
  public.day_off_swap_respond(uuid, boolean), public.day_off_swap_cancel(uuid), public.day_off_swap_decide(uuid, boolean),
  public.can_manage_employee(uuid, date)
  to authenticated;


-- ---------------------------------------------------------------------
-- 6. RLS (baca saja; tulis lewat fungsi)
-- ---------------------------------------------------------------------
alter table public.day_off_setting  enable row level security;
alter table public.job_role_day_off enable row level security;
alter table public.employee_day_off enable row level security;
alter table public.day_off          enable row level security;
alter table public.day_off_credit   enable row level security;
alter table public.day_off_swap     enable row level security;

drop policy if exists rls_admin_all   on public.day_off_setting;
drop policy if exists rls_member_read on public.day_off_setting;
drop policy if exists rls_admin_all   on public.job_role_day_off;
drop policy if exists rls_member_read on public.job_role_day_off;
drop policy if exists rls_admin_all   on public.employee_day_off;
drop policy if exists rls_read        on public.day_off;
drop policy if exists rls_read        on public.day_off_credit;
drop policy if exists rls_read        on public.day_off_swap;

create policy rls_admin_all on public.day_off_setting for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_member_read on public.day_off_setting for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy rls_admin_all on public.job_role_day_off for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_member_read on public.job_role_day_off for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy rls_admin_all on public.employee_day_off for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Libur: milik sendiri, atau karyawan yang bisa dikelola (SPV cabangnya, admin, office).
-- Rekan satu cabang juga boleh melihat libur yang disetujui (untuk memilih tukar off).
create policy rls_read on public.day_off for select to authenticated using (
  employee_id = (select public.my_linked_employee_id())
  or public.can_manage_employee(employee_id, off_date)
  or (status = 'disetujui' and public.home_branch_on(employee_id, off_date)
        = public.home_branch_on((select public.my_linked_employee_id()), off_date))
);
create policy rls_read on public.day_off_credit for select to authenticated using (
  employee_id = (select public.my_linked_employee_id()) or public.can_manage_employee(employee_id, earned_date)
);
create policy rls_read on public.day_off_swap for select to authenticated using (
  requester_id = (select public.my_linked_employee_id())
  or partner_id = (select public.my_linked_employee_id())
  or public.can_manage_employee(requester_id, public.today_wib())
);


-- ---------------------------------------------------------------------
-- 7. ABSEN DI HARI LIBUR (attendance_check, signature sama dengan migrasi wfa)
-- ---------------------------------------------------------------------
create or replace function public.attendance_check(
  p_kind       text,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy_m real,
  p_photo      text,
  p_mocked     boolean default false,
  p_branch     uuid default null,
  p_wfa        boolean default false
)
returns public.attendance_daily
language plpgsql security definer set search_path = public as $$
declare
  v_emp     uuid := public.my_employee_id();
  v_app_role text := public.current_app_role();
  v_is_spv  boolean := v_app_role in ('spv', 'office');  -- office = SPV + bebas outlet
  v_today   date := public.today_wib();
  v_role    uuid;
  v_home    uuid;
  v_backup  uuid;
  v_allowed uuid[];
  v_cands   uuid[];
  v_cand    record;
  v_branch  uuid;
  v_dist    double precision;
  v_near    double precision;
  v_near_r  integer;
  v_any_gps boolean := false;
  v_row     public.attendance_daily;
  v_wfa     boolean := coalesce(p_wfa, false);
  v_hlat    double precision;
  v_hlng    double precision;
begin
  if p_kind is null or p_kind not in ('in', 'out') then
    raise exception 'Jenis absen tidak dikenal.' using errcode = '22023';
  end if;
  if v_emp is null then
    raise exception 'Akun ini belum terhubung ke data karyawan. Hubungi admin.' using errcode = '42501';
  end if;

  -- Penempatan yang berlaku HARI INI (sumber jabatan untuk baris absensi)
  select a.branch_id, a.job_role_id into v_home, v_role
  from public.employee_assignment a
  where a.employee_id = v_emp
    and a.valid_from <= v_today
    and (a.valid_to is null or a.valid_to >= v_today)
  order by a.valid_from desc
  limit 1;
  if v_home is null then
    raise exception 'Data karyawan Anda belum punya penempatan cabang & jabatan aktif. Hubungi admin.';
  end if;

  select b.to_branch_id into v_backup
  from public.employee_backup b
  where b.employee_id = v_emp and v_today between b.date_from and b.date_to
  limit 1;

  -- Outlet yang boleh dipakai akun ini hari ini
  v_allowed := array_remove(array[v_backup, v_home], null);
  if v_app_role = 'office' then
    -- Office: boleh absen di cabang mana pun yang tidak nonaktif
    select v_allowed || coalesce(array_agg(b.id), '{}'::uuid[]) into v_allowed
    from public.branch b where b.status <> 'nonaktif';
  elsif v_is_spv then
    v_allowed := v_allowed || public.my_branch_ids();
  end if;
  -- Office tidak memilih outlet: selalu dideteksi otomatis (outlet terdekat).
  if v_app_role = 'office' then
    p_branch := null;
  end if;
  if v_wfa and not v_is_spv then
    raise exception 'Mode WFA hanya untuk SPV dan Office.' using errcode = '42501';
  end if;
  if p_branch is not null and not (p_branch = any (v_allowed)) then
    raise exception 'Outlet yang dipilih bukan cabang Anda.';
  end if;

  if coalesce(p_mocked, false) then
    raise exception 'Lokasi palsu (fake GPS) terdeteksi. Matikan aplikasi lokasi palsu lalu coba lagi.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Koordinat GPS tidak valid.';
  end if;

  if p_photo is null
     or split_part(p_photo, '/', 1) <> v_emp::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'attendance-selfie' and o.name = p_photo) then
    raise exception 'Foto selfie belum terunggah. Coba lagi.';
  end if;

  perform set_config('app.attendance_check', '1', true);

  select * into v_row from public.attendance_daily
  where employee_id = v_emp and attendance_date = v_today
  for update;

  -- Syarat urutan absen dulu (sebelum cek jarak), supaya pesannya tepat
  if p_kind = 'out' then
    if v_row.id is null or v_row.check_in_at is null then
      raise exception 'Anda belum absen masuk hari ini.';
    end if;
    if v_row.check_out_at is not null then
      raise exception 'Anda sudah absen pulang hari ini.';
    end if;
  elsif v_row.id is not null then
    if v_row.check_in_at is not null then
      raise exception 'Anda sudah absen masuk hari ini.';
    end if;
    -- Hari libur tetap boleh check in (jadi Hadir + saldo off pengganti); Sakit / Tidak Hadir ditolak.
    if v_row.status not in ('hadir', 'libur') then
      raise exception 'Hari ini Anda sudah tercatat "%" oleh SPV/admin.',
        case v_row.status when 'sakit' then 'Sakit' else 'Tidak Hadir' end;
    end if;
    -- Sudah dicentang hadir oleh admin/SPV di cabang tertentu → check in di cabang itu
    if p_branch is not null and p_branch <> v_row.branch_id then
      raise exception 'Hari ini Anda sudah tercatat di cabang lain. Absen masuk di cabang itu.';
    end if;
  end if;

  -- WFA: tanpa batas area. Absensi dicatat di cabang utama (penempatan), koordinat tetap
  -- disimpan, jarak = jarak ke titik cabang utama (informasi saja, null bila titik belum diatur).
  if v_wfa then
    v_branch := case when p_kind = 'in' and v_row.id is null then v_home else coalesce(v_row.branch_id, v_home) end;
    select b.latitude, b.longitude into v_hlat, v_hlng from public.branch b where b.id = v_branch;
    if v_hlat is not null and v_hlng is not null then
      v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_hlat) / 2), 2)
        + cos(radians(v_hlat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_hlng) / 2), 2)
      ));
    end if;
  else

  -- Kandidat outlet:
  --   masuk & sudah ada baris → cabang baris itu;
  --   pulang karyawan → cabang check in; pulang SPV / office → outlet mana pun yang diizinkan;
  --   selain itu → outlet pilihan (p_branch) atau semua yang diizinkan (dipilih terdekat).
  v_cands := case
    when p_kind = 'in' and v_row.id is not null then array[v_row.branch_id]
    when p_kind = 'out' and not v_is_spv then array[v_row.branch_id]
    when p_branch is not null then array[p_branch]
    when p_kind = 'out' then v_allowed || array[v_row.branch_id]
    else v_allowed
  end;

  for v_cand in
    select b.id, b.latitude, b.longitude, b.geofence_radius_m
    from public.branch b
    where b.id = any (v_cands)
  loop
    if v_cand.latitude is null or v_cand.longitude is null then continue; end if;
    v_any_gps := true;
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_cand.latitude) / 2), 2)
      + cos(radians(v_cand.latitude)) * cos(radians(p_lat))
        * power(sin(radians(p_lng - v_cand.longitude) / 2), 2)
    ));
    if v_near is null or v_dist < v_near then
      v_near := v_dist;
      v_near_r := v_cand.geofence_radius_m;
      v_branch := v_cand.id;
    end if;
  end loop;

  if not v_any_gps then
    raise exception 'Titik GPS outlet belum diatur admin. Hubungi admin.';
  end if;
  if v_near > v_near_r then
    raise exception 'Di luar area absen: % m dari titik outlet (batas % m).%', round(v_near), v_near_r,
      case when v_is_spv then ' Pakai mode WFA bila bekerja di luar outlet.' else '' end;
  end if;
  v_dist := v_near;
  end if; -- akhir cabang non-WFA

  if p_kind = 'in' and v_row.id is not null then
    update public.attendance_daily set
      check_in_at = now(), check_in_lat = p_lat, check_in_lng = p_lng,
      check_in_accuracy_m = p_accuracy_m, check_in_distance_m = v_dist, check_in_photo = p_photo,
      check_in_wfa = v_wfa,
      status = 'hadir',
      note = case when v_row.status = 'libur' then 'Masuk di hari libur' else note end,
      updated_by = auth.uid()
    where id = v_row.id
    returning * into v_row;
    perform public.day_off_mark_worked(v_emp, v_today);
  elsif p_kind = 'in' then
    insert into public.attendance_daily (
      attendance_date, employee_id, branch_id, job_role_id, status, created_by, updated_by,
      check_in_at, check_in_lat, check_in_lng, check_in_accuracy_m, check_in_distance_m, check_in_photo, check_in_wfa
    ) values (
      v_today, v_emp, v_branch, v_role, 'hadir', auth.uid(), auth.uid(),
      now(), p_lat, p_lng, p_accuracy_m, v_dist, p_photo, v_wfa
    )
    returning * into v_row;
  else
    update public.attendance_daily set
      check_out_at = now(), check_out_lat = p_lat, check_out_lng = p_lng,
      check_out_accuracy_m = p_accuracy_m, check_out_distance_m = v_dist, check_out_photo = p_photo,
      check_out_branch_id = v_branch,
      check_out_wfa = v_wfa,
      updated_by = auth.uid()
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end $$;

revoke execute on function public.attendance_check(text, double precision, double precision, real, text, boolean, uuid, boolean) from public, anon;
grant  execute on function public.attendance_check(text, double precision, double precision, real, text, boolean, uuid, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 8. RESET DATA ikut menghapus libur & tukar off (pengaturan jatah tetap; reset total ikut terhapus lewat jabatan/karyawan)
-- ---------------------------------------------------------------------
create or replace function public.admin_reset_data(p_mode text, p_confirm text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_counts   jsonb := '{}'::jsonb;
  v_n        bigint;
  v_sessions boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mereset data.' using errcode = '42501';
  end if;
  if p_mode not in ('transaksi', 'total') then
    raise exception 'Pilihan reset tidak dikenal.';
  end if;
  if p_confirm is distinct from 'RESET DATABASE' then
    raise exception 'Kalimat konfirmasi salah. Ketik RESET DATABASE.';
  end if;

  -- 1. Transaksi
  delete from public.attendance_daily where true;  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('absensi', v_n);
  delete from public.kasbon where true;            get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('kasbon', v_n);
  delete from public.employee_backup where true;   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('backup', v_n);
  delete from public.ai_insight where true;
  -- libur & tukar off (migrasi day_off)
  delete from public.day_off_swap where true;
  delete from public.day_off_credit where true;
  delete from public.day_off where true;     get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('libur', v_n);

  -- 2. Master (reset total)
  if p_mode = 'total' then
    -- Role akun lain dihapus; akun pemanggil tetap admin tanpa cabang / data karyawan.
    delete from public.app_user where user_id is distinct from v_me;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('akun', v_n);
    update public.app_user set employee_id = null, branch_id = null where user_id = v_me;
    delete from public.app_user_branch where true;

    delete from public.employee_salary where true;
    delete from public.job_role_salary where true;
    update public.payroll_setting set daily_divisor = 26, cutoff_day = 25 where id;

    update public.branch set pic_employee_id = null where pic_employee_id is not null;
    delete from public.employee_assignment where true;
    delete from public.employee where true;   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('karyawan', v_n);
    delete from public.branch where true;     get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('cabang', v_n);
    delete from public.cluster where true;
    delete from public.job_role where true;   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('jabatan', v_n);
  end if;

  -- 3. Log perubahan (terakhir, karena penghapusan master ikut menulis log)
  delete from public.audit_log where true;

  -- 4. Akhiri semua sesi login selain pemanggil → app HP & browser lain kembali ke layar login
  --    saat token berikutnya diperbarui. Dibungkus supaya reset tetap jalan bila tidak diizinkan.
  begin
    execute 'delete from auth.sessions where user_id is distinct from $1' using v_me;
    v_sessions := true;
  exception when others then
    v_sessions := false;
  end;

  return jsonb_build_object('mode', p_mode, 'counts', v_counts, 'sessions_cleared', v_sessions);
end;
$$;


-- ---------------------------------------------------------------------
-- 9. DATA TUKAR OFF UNTUK APP (nama rekan; RLS employee tidak membuka nama rekan ke karyawan)
-- ---------------------------------------------------------------------

-- Libur rekan satu cabang (disetujui, belum lewat) yang bisa dipilih untuk tukar off
create or replace function public.day_off_swap_options()
returns table (off_id uuid, off_date date, employee_id uuid, full_name text, nik text)
language sql stable security definer set search_path = public as $$
  select o.id, o.off_date, o.employee_id, e.full_name, e.nik
  from public.day_off o
  join public.employee e on e.id = o.employee_id
  where public.my_linked_employee_id() is not null
    and o.employee_id <> public.my_linked_employee_id()
    and o.status = 'disetujui'
    and o.off_date >= public.today_wib()
    and public.home_branch_on(o.employee_id, o.off_date) = public.home_branch_on(public.my_linked_employee_id(), o.off_date)
  order by o.off_date, e.full_name
$$;

-- Tukar off milik saya (pengaju / rekan), plus yang menunggu persetujuan saya (SPV / Office / admin)
create or replace function public.my_day_off_swaps()
returns table (
  id uuid, status text, note text, requested_at timestamptz,
  requester_id uuid, requester_name text, requester_off_id uuid, requester_off_date date,
  partner_id uuid, partner_name text, partner_off_id uuid, partner_off_date date
)
language sql stable security definer set search_path = public as $$
  select s.id, s.status, s.note, s.requested_at,
         s.requester_id, er.full_name, s.requester_off_id, oa.off_date,
         s.partner_id, ep.full_name, s.partner_off_id, ob.off_date
  from public.day_off_swap s
  join public.employee er on er.id = s.requester_id
  join public.employee ep on ep.id = s.partner_id
  join public.day_off oa on oa.id = s.requester_off_id
  join public.day_off ob on ob.id = s.partner_off_id
  where s.requester_id = public.my_linked_employee_id()
     or s.partner_id = public.my_linked_employee_id()
     or (s.status = 'menunggu_atasan' and public.can_manage_employee(s.requester_id, oa.off_date))
  order by s.requested_at desc
  limit 200
$$;

revoke execute on function public.day_off_swap_options(), public.my_day_off_swaps() from public, anon;
grant  execute on function public.day_off_swap_options(), public.my_day_off_swaps() to authenticated;
