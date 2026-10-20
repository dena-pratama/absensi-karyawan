-- =====================================================================
-- Absen mandiri dari app mobile: Check In / Check Out dengan GPS + selfie
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- 1. attendance_daily mendapat kolom jam, titik GPS, jarak ke cabang, dan
--    foto selfie untuk absen masuk (check_in_*) dan pulang (check_out_*).
-- 2. Bucket Storage privat "attendance-selfie" untuk foto selfie
--    (path: <employee_id>/<tanggal>_<in|out>_<waktu>.jpg).
-- 3. Fungsi attendance_check(...) = SATU-SATUNYA jalan karyawan absen:
--    jam diambil dari server, jarak ke titik cabang dihitung di server dan
--    ditolak bila di luar radius (branch.geofence_radius_m), lokasi palsu ditolak.
-- 4. Karyawan tidak lagi boleh insert/update attendance_daily langsung
--    (policy lama dihapus) — supaya jam & lokasi tidak bisa dipalsukan.
--    Kolom check-in/out juga dikunci dari ubahan manual (SPV/admin) lewat trigger.
--
-- Aturan yang BELUM dibuat (menunggu keputusan): telat, jam shift,
-- absen lewat tengah malam (pulang harus di tanggal WIB yang sama).
-- Data lama tidak berubah.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. KOLOM BARU
-- ---------------------------------------------------------------------
alter table public.attendance_daily
  add column if not exists check_in_at          timestamptz,
  add column if not exists check_in_lat         double precision,
  add column if not exists check_in_lng         double precision,
  add column if not exists check_in_accuracy_m  real,
  add column if not exists check_in_distance_m  real,
  add column if not exists check_in_photo       text,
  add column if not exists check_out_at         timestamptz,
  add column if not exists check_out_lat        double precision,
  add column if not exists check_out_lng        double precision,
  add column if not exists check_out_accuracy_m real,
  add column if not exists check_out_distance_m real,
  add column if not exists check_out_photo      text;

alter table public.attendance_daily drop constraint if exists attendance_check_out_after_in;
alter table public.attendance_daily add  constraint attendance_check_out_after_in check (
  check_out_at is null or (check_in_at is not null and check_out_at >= check_in_at)
);


-- ---------------------------------------------------------------------
-- 2. STORAGE: foto selfie (privat)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-selfie', 'attendance-selfie', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists attendance_selfie_insert on storage.objects;
drop policy if exists attendance_selfie_read   on storage.objects;

-- Karyawan hanya boleh mengunggah ke folder miliknya (tidak bisa menimpa / menghapus).
create policy attendance_selfie_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attendance-selfie'
    and (storage.foldername(name))[1] = (select public.my_employee_id())::text
  );

-- Baca: admin semua, karyawan fotonya sendiri, SPV foto karyawan yang ditempatkan di cabangnya.
create policy attendance_selfie_read on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance-selfie'
    and (
      (select public.is_admin())
      or (storage.foldername(name))[1] = (select public.my_employee_id())::text
      or exists (
        select 1 from public.employee_assignment a
        where a.employee_id::text = (storage.foldername(name))[1]
          and a.branch_id = (select public.my_branch_id())
      )
    )
  );


-- ---------------------------------------------------------------------
-- 3. KUNCI KOLOM CHECK-IN/OUT: hanya boleh diisi lewat attendance_check()
-- ---------------------------------------------------------------------
create or replace function public.attendance_guard_check_cols()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.attendance_check', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.check_in_at is not null or new.check_out_at is not null
       or new.check_in_photo is not null or new.check_out_photo is not null then
      raise exception 'Data check-in/out hanya bisa diisi dari app mobile.' using errcode = '42501';
    end if;
  elsif (new.check_in_at, new.check_in_lat, new.check_in_lng, new.check_in_accuracy_m,
         new.check_in_distance_m, new.check_in_photo,
         new.check_out_at, new.check_out_lat, new.check_out_lng, new.check_out_accuracy_m,
         new.check_out_distance_m, new.check_out_photo)
        is distinct from
        (old.check_in_at, old.check_in_lat, old.check_in_lng, old.check_in_accuracy_m,
         old.check_in_distance_m, old.check_in_photo,
         old.check_out_at, old.check_out_lat, old.check_out_lng, old.check_out_accuracy_m,
         old.check_out_distance_m, old.check_out_photo) then
    raise exception 'Data check-in/out hanya bisa diisi dari app mobile.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_attendance_guard_check_cols on public.attendance_daily;
create trigger trg_attendance_guard_check_cols before insert or update on public.attendance_daily
  for each row execute function public.attendance_guard_check_cols();


-- ---------------------------------------------------------------------
-- 4. FUNGSI ABSEN: attendance_check('in' | 'out', lat, lng, akurasi, foto, mocked)
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
  v_emp    uuid := public.my_employee_id();
  v_today  date := public.today_wib();
  v_asg    record;
  v_branch record;
  v_dist   double precision;
  v_row    public.attendance_daily;
begin
  if p_kind is null or p_kind not in ('in', 'out') then
    raise exception 'Jenis absen tidak dikenal.' using errcode = '22023';
  end if;
  if v_emp is null then
    raise exception 'Absen mandiri hanya untuk akun karyawan.' using errcode = '42501';
  end if;

  select a.branch_id, a.job_role_id into v_asg
  from public.employee_assignment a
  where a.employee_id = v_emp and a.valid_to is null;
  if not found then
    raise exception 'Anda belum punya penempatan cabang aktif. Hubungi admin.';
  end if;

  select b.latitude, b.longitude, b.geofence_radius_m into v_branch
  from public.branch b where b.id = v_asg.branch_id;
  if v_branch.latitude is null or v_branch.longitude is null then
    raise exception 'Titik GPS cabang belum diatur admin. Hubungi admin.';
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

  -- Jarak ke titik cabang (haversine, meter)
  v_dist := 2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat - v_branch.latitude) / 2), 2)
    + cos(radians(v_branch.latitude)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - v_branch.longitude) / 2), 2)
  ));
  if v_dist > v_branch.geofence_radius_m then
    raise exception 'Di luar area absen: % m dari titik cabang (batas % m).',
      round(v_dist), v_branch.geofence_radius_m;
  end if;

  perform set_config('app.attendance_check', '1', true);

  select * into v_row from public.attendance_daily
  where employee_id = v_emp and attendance_date = v_today
  for update;

  if p_kind = 'in' then
    if found then
      if v_row.check_in_at is not null then
        raise exception 'Anda sudah absen masuk hari ini.';
      end if;
      if v_row.status <> 'hadir' then
        raise exception 'Hari ini Anda sudah tercatat "%" oleh SPV/admin.',
          case v_row.status when 'sakit' then 'Sakit' else 'Tidak Hadir' end;
      end if;
      update public.attendance_daily set
        check_in_at = now(), check_in_lat = p_lat, check_in_lng = p_lng,
        check_in_accuracy_m = p_accuracy_m, check_in_distance_m = v_dist, check_in_photo = p_photo,
        updated_by = auth.uid()
      where id = v_row.id
      returning * into v_row;
    else
      insert into public.attendance_daily (
        attendance_date, employee_id, branch_id, job_role_id, status, created_by, updated_by,
        check_in_at, check_in_lat, check_in_lng, check_in_accuracy_m, check_in_distance_m, check_in_photo
      ) values (
        v_today, v_emp, v_asg.branch_id, v_asg.job_role_id, 'hadir', auth.uid(), auth.uid(),
        now(), p_lat, p_lng, p_accuracy_m, v_dist, p_photo
      )
      returning * into v_row;
    end if;
  else
    if not found or v_row.check_in_at is null then
      raise exception 'Anda belum absen masuk hari ini.';
    end if;
    if v_row.check_out_at is not null then
      raise exception 'Anda sudah absen pulang hari ini.';
    end if;
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


-- ---------------------------------------------------------------------
-- 5. KARYAWAN TIDAK LAGI INSERT/UPDATE LANGSUNG (pakai attendance_check)
--    Baca data sendiri (rls_karyawan_read) tetap berlaku.
-- ---------------------------------------------------------------------
drop policy if exists rls_karyawan_insert on public.attendance_daily;
drop policy if exists rls_karyawan_update on public.attendance_daily;
