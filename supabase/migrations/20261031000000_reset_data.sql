-- =====================================================================
-- Reset Data (Pengaturan > Reset Data)
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Keputusan user (2026-10-24): dua pilihan, wajib unduh backup dulu (di web),
-- konfirmasi 2x, semua sesi login (HP) dimulai ulang, akun admin yang menjalankan tetap.
--   'transaksi' → hapus absensi, kasbon, backup karyawan, AI insight, log perubahan.
--                 Karyawan, cabang, jabatan, gaji, akun login, & pengaturan tetap.
--   'total'     → semua di atas + karyawan, penempatan, cabang, cluster, jabatan, gaji,
--                 dan role semua akun selain pemanggil. Pengaturan gajian kembali default.
--                 Konektor AI & akun pemanggil (admin) tetap.
-- Semua dalam satu transaksi: gagal di tengah = tidak ada yang terhapus.
-- File storage (selfie, bukti kasbon) & akun Auth dihapus oleh server Next.js
-- (Supabase tidak mengizinkan menghapus file storage lewat SQL).
-- =====================================================================

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

revoke execute on function public.admin_reset_data(text, text) from public, anon;
grant  execute on function public.admin_reset_data(text, text) to authenticated;
