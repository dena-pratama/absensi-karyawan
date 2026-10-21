-- =====================================================================
-- Backup karyawan antar cabang + SPV memegang beberapa cabang
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi
-- 20261021020000_attendance_check_in_out.sql. Aman dijalankan ulang.
--
-- 1. app_user_branch: daftar cabang yang dipegang SPV (boleh > 1).
--    app_user.branch_id tetap ada sebagai "cabang utama" (kompatibilitas).
-- 2. employee_backup: penugasan sementara karyawan ke cabang lain
--    (rentang tanggal). Absensi hari itu dicatat di CABANG TUJUAN.
-- 3. Fungsi bantu: my_branch_ids(), home_branch_on(), employee_branch_on().
-- 4. RLS SPV memakai daftar cabang + karyawan backup yang masuk ke cabangnya.
-- 5. attendance_check(): boleh check in di cabang asal ATAU cabang backup hari
--    itu; penempatan dibaca yang berlaku pada tanggal itu (mendukung mutasi
--    dengan tanggal efektif).
-- Data lama tidak berubah.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. SPV BANYAK CABANG
-- ---------------------------------------------------------------------
create table if not exists public.app_user_branch (
  user_id    uuid not null references public.app_user(user_id) on delete cascade,
  branch_id  uuid not null references public.branch(id) on delete cascade,
  primary key (user_id, branch_id)
);
create index if not exists app_user_branch_branch_idx on public.app_user_branch (branch_id);

-- Cabang SPV yang sudah ada → daftar cabang
insert into public.app_user_branch (user_id, branch_id)
select user_id, branch_id from public.app_user
where role = 'spv' and branch_id is not null
on conflict do nothing;

comment on column public.app_user.branch_id is
  'Cabang utama SPV (kompatibilitas). Daftar lengkap cabang SPV ada di app_user_branch.';

-- Semua cabang yang dipegang SPV yang sedang login (kosong untuk role lain)
create or replace function public.my_branch_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(ub.branch_id), '{}'::uuid[])
  from public.app_user_branch ub
  join public.app_user u on u.user_id = ub.user_id
  where ub.user_id = auth.uid() and u.role = 'spv'
$$;


-- ---------------------------------------------------------------------
-- 2. BACKUP KARYAWAN
-- ---------------------------------------------------------------------
create table if not exists public.employee_backup (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employee(id) on delete cascade,
  from_branch_id  uuid references public.branch(id) on delete set null,   -- diisi otomatis (trigger)
  to_branch_id    uuid not null references public.branch(id) on delete restrict,
  date_from       date not null,
  date_to         date not null,
  note            text,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint employee_backup_dates check (date_to >= date_from),
  constraint employee_backup_max_range check (date_to - date_from <= 92)
);
create index if not exists employee_backup_employee_idx on public.employee_backup (employee_id, date_from);
create index if not exists employee_backup_to_branch_idx on public.employee_backup (to_branch_id, date_from);
create index if not exists employee_backup_from_branch_idx on public.employee_backup (from_branch_id);


-- ---------------------------------------------------------------------
-- 3. FUNGSI BANTU
-- ---------------------------------------------------------------------
-- Cabang penempatan (bukan backup) karyawan pada tanggal tertentu
create or replace function public.home_branch_on(p_employee uuid, p_date date)
returns uuid language sql stable security definer set search_path = public as $$
  select a.branch_id from public.employee_assignment a
  where a.employee_id = p_employee
    and a.valid_from <= p_date
    and (a.valid_to is null or a.valid_to >= p_date)
  order by a.valid_from desc
  limit 1
$$;

-- Cabang tempat karyawan bekerja pada tanggal itu: cabang backup bila ada, selain itu penempatan
create or replace function public.employee_branch_on(p_employee uuid, p_date date)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select b.to_branch_id from public.employee_backup b
     where b.employee_id = p_employee and p_date between b.date_from and b.date_to
     limit 1),
    public.home_branch_on(p_employee, p_date)
  )
$$;

revoke execute on function public.my_branch_ids(), public.home_branch_on(uuid, date),
  public.employee_branch_on(uuid, date) from public, anon;
grant execute on function public.my_branch_ids(), public.home_branch_on(uuid, date),
  public.employee_branch_on(uuid, date) to authenticated;

-- Validasi backup: isi cabang asal, tolak cabang sama & rentang yang tumpang tindih
create or replace function public.employee_backup_validate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.from_branch_id := public.home_branch_on(new.employee_id, new.date_from);
  if new.from_branch_id is null then
    raise exception 'Karyawan belum punya penempatan cabang pada tanggal mulai backup.';
  end if;
  if new.to_branch_id = new.from_branch_id then
    raise exception 'Cabang tujuan backup sama dengan cabang asal karyawan.';
  end if;
  if exists (
    select 1 from public.employee_backup b
    where b.employee_id = new.employee_id
      and b.id <> new.id
      and b.date_from <= new.date_to
      and b.date_to >= new.date_from
  ) then
    raise exception 'Karyawan sudah punya penugasan backup yang tumpang tindih di rentang tanggal itu.';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_employee_backup_validate on public.employee_backup;
create trigger trg_employee_backup_validate before insert or update on public.employee_backup
  for each row execute function public.employee_backup_validate();

drop trigger if exists trg_employee_backup_audit on public.employee_backup;
create trigger trg_employee_backup_audit after insert or update or delete on public.employee_backup
  for each row execute function public.write_audit_log();


-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.app_user_branch enable row level security;
alter table public.employee_backup enable row level security;

drop policy if exists rls_admin_all on public.app_user_branch;
drop policy if exists rls_self_read on public.app_user_branch;
create policy rls_admin_all on public.app_user_branch for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_self_read on public.app_user_branch for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists rls_admin_all      on public.employee_backup;
drop policy if exists rls_spv_read       on public.employee_backup;
drop policy if exists rls_spv_insert     on public.employee_backup;
drop policy if exists rls_spv_update     on public.employee_backup;
drop policy if exists rls_spv_delete     on public.employee_backup;
drop policy if exists rls_karyawan_read  on public.employee_backup;
create policy rls_admin_all on public.employee_backup for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- SPV: backup yang menuju ATAU berasal dari cabang yang dipegangnya
create policy rls_spv_read on public.employee_backup for select to authenticated
  using (to_branch_id = any ((select public.my_branch_ids())::uuid[]) or from_branch_id = any ((select public.my_branch_ids())::uuid[]));
create policy rls_spv_insert on public.employee_backup for insert to authenticated
  with check (to_branch_id = any ((select public.my_branch_ids())::uuid[]) or from_branch_id = any ((select public.my_branch_ids())::uuid[]));
create policy rls_spv_update on public.employee_backup for update to authenticated
  using (to_branch_id = any ((select public.my_branch_ids())::uuid[]) or from_branch_id = any ((select public.my_branch_ids())::uuid[]))
  with check (to_branch_id = any ((select public.my_branch_ids())::uuid[]) or from_branch_id = any ((select public.my_branch_ids())::uuid[]));
create policy rls_spv_delete on public.employee_backup for delete to authenticated
  using (to_branch_id = any ((select public.my_branch_ids())::uuid[]) or from_branch_id = any ((select public.my_branch_ids())::uuid[]));
create policy rls_karyawan_read on public.employee_backup for select to authenticated
  using (employee_id = (select public.my_employee_id()));

-- SPV: daftar cabang + karyawan backup yang masuk (ganti policy versi 1 cabang)
drop policy if exists rls_spv_read   on public.branch;
drop policy if exists rls_spv_read   on public.employee_assignment;
drop policy if exists rls_spv_read   on public.employee;
drop policy if exists rls_spv_read   on public.attendance_daily;
drop policy if exists rls_spv_insert on public.attendance_daily;
drop policy if exists rls_spv_update on public.attendance_daily;

create policy rls_spv_read on public.branch for select to authenticated
  using (id = any ((select public.my_branch_ids())::uuid[]));
create policy rls_spv_read on public.employee_assignment for select to authenticated
  using (
    branch_id = any ((select public.my_branch_ids())::uuid[])
    or exists (
      select 1 from public.employee_backup b
      where b.employee_id = employee_assignment.employee_id and b.to_branch_id = any ((select public.my_branch_ids())::uuid[])
    )
  );
create policy rls_spv_read on public.employee for select to authenticated
  using (
    exists (
      select 1 from public.employee_assignment a
      where a.employee_id = employee.id and a.branch_id = any ((select public.my_branch_ids())::uuid[])
    )
    or exists (
      select 1 from public.employee_backup b
      where b.employee_id = employee.id and b.to_branch_id = any ((select public.my_branch_ids())::uuid[])
    )
  );
-- Absensi di cabangnya, plus absensi karyawan cabangnya yang sedang backup di cabang lain
create policy rls_spv_read on public.attendance_daily for select to authenticated
  using (
    branch_id = any ((select public.my_branch_ids())::uuid[])
    or public.home_branch_on(employee_id, attendance_date) = any ((select public.my_branch_ids())::uuid[])
  );
create policy rls_spv_insert on public.attendance_daily for insert to authenticated
  with check (branch_id = any ((select public.my_branch_ids())::uuid[]) and attendance_date <= (select public.today_wib()));
create policy rls_spv_update on public.attendance_daily for update to authenticated
  using (branch_id = any ((select public.my_branch_ids())::uuid[]))
  with check (branch_id = any ((select public.my_branch_ids())::uuid[]) and attendance_date <= (select public.today_wib()));

-- Semua akun terdaftar boleh membaca daftar cabang (kode, nama) — dibutuhkan SPV untuk
-- memilih cabang tujuan backup. Data cabang tidak sensitif.
drop policy if exists rls_member_read on public.branch;
create policy rls_member_read on public.branch for select to authenticated
  using ((select public.current_app_role()) is not null);

-- Karyawan: juga boleh membaca cabang tujuan backup-nya
drop policy if exists rls_karyawan_read on public.branch;
create policy rls_karyawan_read on public.branch for select to authenticated
  using (
    exists (
      select 1 from public.employee_assignment a
      where a.branch_id = branch.id and a.employee_id = (select public.my_employee_id())
    )
    or exists (
      select 1 from public.employee_backup b
      where b.to_branch_id = branch.id and b.employee_id = (select public.my_employee_id())
    )
  );

-- Foto selfie: SPV melihat foto karyawan cabangnya + karyawan backup yang masuk
drop policy if exists attendance_selfie_read on storage.objects;
create policy attendance_selfie_read on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance-selfie'
    and (
      (select public.is_admin())
      or (storage.foldername(name))[1] = (select public.my_employee_id())::text
      or exists (
        select 1 from public.employee_assignment a
        where a.employee_id::text = (storage.foldername(name))[1]
          and a.branch_id = any ((select public.my_branch_ids())::uuid[])
      )
      or exists (
        select 1 from public.employee_backup b
        where b.employee_id::text = (storage.foldername(name))[1]
          and b.to_branch_id = any ((select public.my_branch_ids())::uuid[])
      )
    )
  );

-- Daftar akun untuk admin: tambah kolom branch_ids (cabang SPV)
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  role text, branch_id uuid, employee_id uuid, branch_ids uuid[]
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh melihat daftar pengguna.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, a.role, a.branch_id, a.employee_id,
           coalesce((select array_agg(ub.branch_id) from public.app_user_branch ub where ub.user_id = u.id), '{}'::uuid[])
    from auth.users u
    left join public.app_user a on a.user_id = u.id
    order by u.created_at;
end $$;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;


-- ---------------------------------------------------------------------
-- 5. ABSEN MANDIRI: cabang asal atau cabang backup hari ini
-- ---------------------------------------------------------------------
create or replace function public.attendance_check(
  p_kind       text,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy_m real,
  p_photo      text,
  p_mocked     boolean default false
)
returns public.attendance_daily
language plpgsql security definer set search_path = public as $$
declare
  v_emp     uuid := public.my_employee_id();
  v_today   date := public.today_wib();
  v_role    uuid;
  v_home    uuid;
  v_backup  uuid;
  v_cand    record;
  v_branch  uuid;
  v_dist    double precision;
  v_near    double precision;
  v_near_r  integer;
  v_any_gps boolean := false;
  v_row     public.attendance_daily;
begin
  if p_kind is null or p_kind not in ('in', 'out') then
    raise exception 'Jenis absen tidak dikenal.' using errcode = '22023';
  end if;
  if v_emp is null then
    raise exception 'Absen mandiri hanya untuk akun karyawan.' using errcode = '42501';
  end if;

  -- Penempatan yang berlaku HARI INI (mendukung mutasi bertanggal efektif)
  select a.branch_id, a.job_role_id into v_home, v_role
  from public.employee_assignment a
  where a.employee_id = v_emp
    and a.valid_from <= v_today
    and (a.valid_to is null or a.valid_to >= v_today)
  order by a.valid_from desc
  limit 1;
  if v_home is null then
    raise exception 'Anda belum punya penempatan cabang aktif. Hubungi admin.';
  end if;

  select b.to_branch_id into v_backup
  from public.employee_backup b
  where b.employee_id = v_emp and v_today between b.date_from and b.date_to
  limit 1;

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
    if v_row.status <> 'hadir' then
      raise exception 'Hari ini Anda sudah tercatat "%" oleh SPV/admin.',
        case v_row.status when 'sakit' then 'Sakit' else 'Tidak Hadir' end;
    end if;
  end if;

  -- Cabang yang boleh dipakai: sudah ada baris hari ini → cabang baris itu;
  -- belum ada → cabang backup hari ini & cabang asal (dipilih yang terdekat).
  for v_cand in
    select b.id, b.latitude, b.longitude, b.geofence_radius_m
    from public.branch b
    where b.id = any (
      case when v_row.id is not null then array[v_row.branch_id]
           else array_remove(array[v_backup, v_home], null) end
    )
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
    raise exception 'Titik GPS cabang belum diatur admin. Hubungi admin.';
  end if;
  if v_near > v_near_r then
    raise exception 'Di luar area absen: % m dari titik cabang (batas % m).', round(v_near), v_near_r;
  end if;
  v_dist := v_near;

  if p_kind = 'in' and v_row.id is not null then
    update public.attendance_daily set
      check_in_at = now(), check_in_lat = p_lat, check_in_lng = p_lng,
      check_in_accuracy_m = p_accuracy_m, check_in_distance_m = v_dist, check_in_photo = p_photo,
      updated_by = auth.uid()
    where id = v_row.id
    returning * into v_row;
  elsif p_kind = 'in' then
    insert into public.attendance_daily (
      attendance_date, employee_id, branch_id, job_role_id, status, created_by, updated_by,
      check_in_at, check_in_lat, check_in_lng, check_in_accuracy_m, check_in_distance_m, check_in_photo
    ) values (
      v_today, v_emp, v_branch, v_role, 'hadir', auth.uid(), auth.uid(),
      now(), p_lat, p_lng, p_accuracy_m, v_dist, p_photo
    )
    returning * into v_row;
  else
    update public.attendance_daily set
      check_out_at = now(), check_out_lat = p_lat, check_out_lng = p_lng,
      check_out_accuracy_m = p_accuracy_m, check_out_distance_m = v_dist, check_out_photo = p_photo,
      updated_by = auth.uid()
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end $$;

revoke execute on function public.attendance_check(text, double precision, double precision, real, text, boolean) from public, anon;
grant  execute on function public.attendance_check(text, double precision, double precision, real, text, boolean) to authenticated;
