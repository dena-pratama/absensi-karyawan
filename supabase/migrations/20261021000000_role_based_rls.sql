-- =====================================================================
-- RLS berbasis role: admin / spv / karyawan
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Sebelumnya: setiap user yang login (authenticated) = akses penuh.
-- Sekarang  : akses ditentukan oleh tabel app_user.
--   admin    → akses penuh (web panel).
--   spv      → hanya cabang yang dipegangnya (branch_id): baca data cabang,
--              isi/ubah absensi cabang itu (tidak untuk tanggal mendatang).
--   karyawan → hanya data dirinya (employee_id): baca data sendiri, isi/ubah
--              absensi miliknya untuk HARI INI (WIB) di cabang penempatannya.
--   Akun tanpa baris app_user → tidak bisa membaca atau mengubah apa pun.
--
-- PENTING: semua akun yang SUDAH ADA saat migrasi ini dijalankan otomatis
-- dijadikan admin (selama ini hanya ada 1 akun admin). Cek di
-- Pengaturan → Pengguna & Akses setelah menjalankan.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABEL ROLE
-- ---------------------------------------------------------------------
create table if not exists public.app_user (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('admin','spv','karyawan')),
  branch_id    uuid references public.branch(id)   on delete restrict,  -- cabang SPV
  employee_id  uuid unique references public.employee(id) on delete restrict, -- data karyawan
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint app_user_spv_branch        check (role <> 'spv'      or branch_id   is not null),
  constraint app_user_karyawan_employee check (role <> 'karyawan' or employee_id is not null)
);
create index if not exists app_user_branch_idx on public.app_user (branch_id);

drop trigger if exists trg_app_user_updated on public.app_user;
create trigger trg_app_user_updated before update on public.app_user
  for each row execute function public.set_updated_at();

-- Akun yang sudah ada → admin (hanya saat tabel masih kosong)
insert into public.app_user (user_id, role)
select u.id, 'admin' from auth.users u
where not exists (select 1 from public.app_user)
on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------
-- 2. FUNGSI BANTU (security definer: membaca app_user tanpa terkena RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.app_user where user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_user where user_id = auth.uid() and role = 'admin')
$$;

create or replace function public.my_branch_id()
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.app_user where user_id = auth.uid() and role = 'spv'
$$;

create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select employee_id from public.app_user where user_id = auth.uid() and role = 'karyawan'
$$;

create or replace function public.today_wib()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Jakarta')::date
$$;

-- Daftar akun login + role-nya, khusus admin (auth.users tidak bisa dibaca langsung)
create or replace function public.admin_list_users()
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  role text, branch_id uuid, employee_id uuid
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh melihat daftar pengguna.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, a.role, a.branch_id, a.employee_id
    from auth.users u
    left join public.app_user a on a.user_id = u.id
    order by u.created_at;
end $$;

revoke execute on function public.current_app_role(), public.is_admin(), public.my_branch_id(),
  public.my_employee_id(), public.admin_list_users() from public, anon;
grant execute on function public.current_app_role(), public.is_admin(), public.my_branch_id(),
  public.my_employee_id(), public.admin_list_users() to authenticated;

-- Selalu sisakan minimal satu admin (cegah terkunci dari panel)
create or replace function public.app_user_keep_one_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not exists (select 1 from public.app_user where role = 'admin' and user_id <> old.user_id) then
      raise exception 'Minimal harus ada satu admin.' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_app_user_keep_admin on public.app_user;
create trigger trg_app_user_keep_admin before update or delete on public.app_user
  for each row execute function public.app_user_keep_one_admin();


-- ---------------------------------------------------------------------
-- 3. POLICY
--    (select fungsi()) dipakai supaya hasilnya dihitung sekali per query.
-- ---------------------------------------------------------------------
alter table public.app_user enable row level security;

-- Hapus policy lama "semua authenticated = akses penuh"
drop policy if exists admin_all  on public.job_role;
drop policy if exists admin_all  on public.cluster;
drop policy if exists admin_all  on public.employee;
drop policy if exists admin_all  on public.branch;
drop policy if exists admin_all  on public.employee_assignment;
drop policy if exists admin_all  on public.attendance_daily;
drop policy if exists admin_read on public.audit_log;
drop policy if exists admin_all  on public.ai_connector;

-- Hapus policy versi ini (supaya file aman dijalankan ulang)
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and policyname like 'rls\_%'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Admin: akses penuh ke semua tabel data
create policy rls_admin_all on public.job_role            for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_all on public.cluster             for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_all on public.employee            for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_all on public.branch              for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_all on public.employee_assignment for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_all on public.attendance_daily    for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_all on public.ai_connector        for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_all on public.app_user            for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rls_admin_read on public.audit_log          for select to authenticated using ((select public.is_admin()));

-- Semua akun terdaftar: baca master jabatan & cluster (label)
create policy rls_member_read on public.job_role for select to authenticated using ((select public.current_app_role()) is not null);
create policy rls_member_read on public.cluster  for select to authenticated using ((select public.current_app_role()) is not null);

-- Setiap akun boleh membaca baris role miliknya sendiri
create policy rls_self_read on public.app_user for select to authenticated using (user_id = (select auth.uid()));

-- SPV: data cabang yang dipegang
create policy rls_spv_read on public.branch for select to authenticated
  using (id = (select public.my_branch_id()));
create policy rls_spv_read on public.employee_assignment for select to authenticated
  using (branch_id = (select public.my_branch_id()));
create policy rls_spv_read on public.employee for select to authenticated
  using (exists (
    select 1 from public.employee_assignment a
    where a.employee_id = employee.id and a.branch_id = (select public.my_branch_id())
  ));
create policy rls_spv_read on public.attendance_daily for select to authenticated
  using (branch_id = (select public.my_branch_id()));
create policy rls_spv_insert on public.attendance_daily for insert to authenticated
  with check (branch_id = (select public.my_branch_id()) and attendance_date <= (select public.today_wib()));
create policy rls_spv_update on public.attendance_daily for update to authenticated
  using (branch_id = (select public.my_branch_id()))
  with check (branch_id = (select public.my_branch_id()) and attendance_date <= (select public.today_wib()));

-- Karyawan: data dirinya sendiri
create policy rls_karyawan_read on public.employee for select to authenticated
  using (id = (select public.my_employee_id()));
create policy rls_karyawan_read on public.employee_assignment for select to authenticated
  using (employee_id = (select public.my_employee_id()));
create policy rls_karyawan_read on public.branch for select to authenticated
  using (exists (
    select 1 from public.employee_assignment a
    where a.branch_id = branch.id and a.employee_id = (select public.my_employee_id())
  ));
create policy rls_karyawan_read on public.attendance_daily for select to authenticated
  using (employee_id = (select public.my_employee_id()));
create policy rls_karyawan_insert on public.attendance_daily for insert to authenticated
  with check (
    employee_id = (select public.my_employee_id())
    and attendance_date = (select public.today_wib())
    and exists (
      select 1 from public.employee_assignment a
      where a.employee_id = attendance_daily.employee_id
        and a.branch_id = attendance_daily.branch_id
        and a.valid_to is null
    )
  );
create policy rls_karyawan_update on public.attendance_daily for update to authenticated
  using (employee_id = (select public.my_employee_id()) and attendance_date = (select public.today_wib()))
  with check (employee_id = (select public.my_employee_id()) and attendance_date = (select public.today_wib()));
