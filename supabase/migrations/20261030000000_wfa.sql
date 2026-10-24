-- =====================================================================
-- WFA (Work From Anywhere) untuk SPV & Office + Office tanpa pilih outlet
-- Jalankan sekali di SQL Editor Supabase SETELAH 20261029000000_ai_limit_alert.sql.
-- Aman dijalankan ulang.
--
-- Keputusan user (2026-10-24):
--   - SPV & Office bisa absen mode WFA: tanpa batas area outlet, koordinat GPS +
--     selfie tetap dicatat, dan absensinya tampil di CABANG UTAMA (penempatan).
--   - Office tidak memilih outlet: sistem langsung mendeteksi outlet terdekat
--     (p_branch diabaikan untuk office). SPV tetap boleh memilih outlet.
--   - Karyawan biasa tidak bisa WFA.
-- Kolom baru: attendance_daily.check_in_wfa / check_out_wfa (dikunci seperti
-- kolom check-in/out lain). attendance_check() mendapat parameter ke-8 p_wfa.
-- =====================================================================

alter table public.attendance_daily add column if not exists check_in_wfa  boolean not null default false;
alter table public.attendance_daily add column if not exists check_out_wfa boolean not null default false;

create or replace function public.attendance_guard_check_cols()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.attendance_check', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.check_in_at is not null or new.check_out_at is not null
       or new.check_in_photo is not null or new.check_out_photo is not null
       or new.check_out_branch_id is not null or new.check_in_wfa or new.check_out_wfa then
      raise exception 'Data check-in/out hanya bisa diisi dari app mobile.' using errcode = '42501';
    end if;
  elsif (new.check_in_at, new.check_in_lat, new.check_in_lng, new.check_in_accuracy_m,
         new.check_in_distance_m, new.check_in_photo,
         new.check_out_at, new.check_out_lat, new.check_out_lng, new.check_out_accuracy_m,
         new.check_out_distance_m, new.check_out_photo, new.check_out_branch_id,
         new.check_in_wfa, new.check_out_wfa)
        is distinct from
        (old.check_in_at, old.check_in_lat, old.check_in_lng, old.check_in_accuracy_m,
         old.check_in_distance_m, old.check_in_photo,
         old.check_out_at, old.check_out_lat, old.check_out_lng, old.check_out_accuracy_m,
         old.check_out_distance_m, old.check_out_photo, old.check_out_branch_id,
         old.check_in_wfa, old.check_out_wfa) then
    raise exception 'Data check-in/out hanya bisa diisi dari app mobile.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Versi 7 parameter dihapus supaya panggilan dari app tidak ambigu (p_wfa punya default).
drop function if exists public.attendance_check(text, double precision, double precision, real, text, boolean, uuid);

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
    if v_row.status <> 'hadir' then
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
      updated_by = auth.uid()
    where id = v_row.id
    returning * into v_row;
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
