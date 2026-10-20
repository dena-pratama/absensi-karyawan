-- =====================================================================
-- DATA DEMO (opsional) — untuk mencoba tampilan Dashboard.
-- Jalankan di SQL Editor Supabase SETELAH init_schema.sql.
-- Isi mengikuti contoh di desain (cabang & nama karyawan fiktif).
-- Absensi diisi untuk HARI INI (WIB). Aman dijalankan ulang (on conflict).
--
-- Hapus data demo:
--   delete from attendance_daily; delete from employee_assignment;
--   update branch set pic_employee_id = null; delete from employee; delete from branch;
-- =====================================================================

-- Cabang
insert into public.branch (code, name, branch_type, cluster_id, address, is_24_hours, gate_open_time, gate_close_time, status)
select v.code, v.name, v.type, c.id, v.address, v.h24, v.open::time, v.close::time, 'aktif'
from (values
  ('JKT109A', 'Hub Cengkareng',      'hub_utama',      'BARAT', 'Cengkareng, Jakarta Barat',  true,  null,    null),
  ('BDO004A', 'Drop Point Bandung',  'drop_point',     'JABAR', 'Soekarno-Hatta, Bandung',    false, '06:00', '22:00'),
  ('CKR038A', 'DC Cikarang Industri','dc_sorting',     'BARAT', 'Jababeka, Cikarang',         true,  null,    null),
  ('CKP003A', 'Cikampek Junction',   'transit_center', 'BARAT', 'Kotabaru, Karawang',         true,  null,    null),
  ('BDO006A', 'Pasteur Hub',         'drop_point',     'JABAR', 'Pasteur, Bandung',           false, '08:00', '21:00'),
  ('KRW029A', 'Karawang Barat DP',   'drop_point',     'BARAT', 'Telukjambe, Karawang',       false, '08:00', '20:00')
) as v(code, name, type, cluster, address, h24, open, close)
join public.cluster c on c.code = v.cluster
on conflict (code) do nothing;

-- Karyawan + penempatan
with data(nik, full_name, phone, contract, branch, role) as (values
  ('EXP-0101', 'Nadia Paramitha',   '+6281234567890', 'tetap', 'JKT109A', 'SPV_OPS'),
  ('EXP-0102', 'Dena Oktaviana',    '+6281322119081', 'pkwt',  'JKT109A', 'ADM_DISPATCH'),
  ('EXP-0103', 'Raisa Larasati',    '+6281198765432', 'mitra', 'JKT109A', 'SPRINTER'),
  ('EXP-0104', 'Safia Rahmadani',   '+6285677889900', 'pkwt',  'JKT109A', 'WH_SORTIR'),
  ('EXP-0105', 'Andre Prasetyo',    '+6282144556677', 'tetap', 'JKT109A', 'DRIVER_CDD'),
  ('EXP-0106', 'Bagas Wicaksono',   '+6287811223344', 'mitra', 'JKT109A', 'DRIVER_CDD'),
  ('EXP-0107', 'Bambang Sugiarto',  '+6285299887711', 'pkwt',  'JKT109A', 'WH_SORTIR'),
  ('EXP-0108', 'Hendri Kurniawan',  '+6281933445566', 'mitra', 'JKT109A', 'SPRINTER'),
  ('EXP-0201', 'Gunawan Saputra',   '+6281200000201', 'tetap', 'BDO004A', 'SPV_OPS'),
  ('EXP-0202', 'Dika Kurniadi',     '+6281200000202', 'mitra', 'BDO004A', 'SPRINTER'),
  ('EXP-0203', 'Maria Rosalina',    '+6281200000203', 'pkwt',  'BDO004A', 'WH_SORTIR'),
  ('EXP-0204', 'Anton Nugraha',     '+6281200000204', 'mitra', 'BDO004A', 'SPRINTER'),
  ('EXP-0301', 'Fauzi Ramadhan',    '+6281200000301', 'tetap', 'CKR038A', 'SPV_OPS'),
  ('EXP-0302', 'Bima Gunadi',       '+6281200000302', 'mitra', 'CKR038A', 'DRIVER_CDD'),
  ('EXP-0303', 'Rina Tanjung',      '+6281200000303', 'pkwt',  'CKR038A', 'LINEHAUL'),
  ('EXP-0401', 'Bambang Setiawan',  '+6281200000401', 'tetap', 'CKP003A', 'SPV_OPS'),
  ('EXP-0402', 'Yoga Pratama',      '+6281200000402', 'mitra', 'CKP003A', 'DRIVER_CDD'),
  ('EXP-0501', 'Rizky Kurniawan',   '+6281200000501', 'tetap', 'BDO006A', 'ADM_DISPATCH'),
  ('EXP-0502', 'Lina Marlina',      '+6281200000502', 'mitra', 'BDO006A', 'SPRINTER'),
  ('EXP-0601', 'Siti Nurhaliza',    '+6281200000601', 'tetap', 'KRW029A', 'ADM_DISPATCH'),
  ('EXP-0602', 'Joko Susilo',       '+6281200000602', 'mitra', 'KRW029A', 'SPRINTER'),
  ('EXP-0603', 'Putri Ayu',         '+6281200000603', 'pkwt',  'KRW029A', 'WH_SORTIR')
),
ins as (
  insert into public.employee (nik, full_name, phone_wa, contract_type, join_date)
  select nik, full_name, phone, contract, date '2025-01-06' from data
  on conflict (nik) do nothing
  returning id, nik
)
insert into public.employee_assignment (employee_id, branch_id, job_role_id)
select ins.id, b.id, r.id
from ins
join data d on d.nik = ins.nik
join public.branch b on b.code = d.branch
join public.job_role r on r.code = d.role;

-- PIC cabang
update public.branch b set pic_employee_id = e.id
from (values ('JKT109A','EXP-0101'), ('BDO004A','EXP-0201'), ('CKR038A','EXP-0301'),
             ('CKP003A','EXP-0401'), ('BDO006A','EXP-0501'), ('KRW029A','EXP-0601')) as v(branch, nik)
join public.employee e on e.nik = v.nik
where b.code = v.branch;

-- Absensi hari ini (WIB). Beberapa karyawan sengaja dibiarkan belum diabsen.
insert into public.attendance_daily (attendance_date, employee_id, branch_id, job_role_id, status, note)
select (now() at time zone 'Asia/Jakarta')::date, a.employee_id, a.branch_id, a.job_role_id, v.status, v.note
from (values
  ('EXP-0101', 'hadir', 'Bertugas di Hub'),
  ('EXP-0102', 'hadir', null),
  ('EXP-0103', 'hadir', null),
  ('EXP-0104', 'hadir', null),
  ('EXP-0105', 'sakit', 'Surat dokter'),
  ('EXP-0106', 'hadir', null),
  ('EXP-0107', 'tidak_hadir', 'Tanpa keterangan'),
  ('EXP-0201', 'hadir', null),
  ('EXP-0202', 'hadir', null),
  ('EXP-0203', 'hadir', null),
  ('EXP-0301', 'hadir', null),
  ('EXP-0302', 'hadir', null),
  ('EXP-0303', 'hadir', null),
  ('EXP-0401', 'hadir', null),
  ('EXP-0402', 'sakit', null),
  ('EXP-0501', 'hadir', null),
  ('EXP-0502', 'hadir', null),
  ('EXP-0601', 'hadir', null),
  ('EXP-0602', 'tidak_hadir', null)
) as v(nik, status, note)
join public.employee e on e.nik = v.nik
join public.employee_assignment a on a.employee_id = e.id and a.valid_to is null
on conflict (employee_id, attendance_date) do nothing;
