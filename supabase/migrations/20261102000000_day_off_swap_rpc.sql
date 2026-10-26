-- =====================================================================
-- Tukar off: data untuk app (nama rekan)
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Isinya sama dengan bagian 9 di 20261101000000_day_off.sql. File terpisah karena bagian itu
-- ditambahkan setelah file tersebut sempat dijalankan, jadi belum terpasang di database.
-- =====================================================================

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

-- Muat ulang skema PostgREST supaya fungsi baru langsung bisa dipanggil dari app
notify pgrst, 'reload schema';
