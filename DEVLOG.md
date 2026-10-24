# Development Log — Absensi Karyawan

Catatan setiap aktivitas develop, pengembangan, dan keputusan project.
Format: entri terbaru di paling atas.

---

## 2026-10-24 — Peringatan AI kena limit

Permintaan user: alert / pengingat saat model AI kena limit, dan saran ganti model / platform.
- `engine.ts`: `AiError.limit` untuk HTTP 429 / 402 atau pesan quota / rate limit / credit / billing; pesan berisi
  saran ganti model / platform di Konektor AI.
- `lib/ai/limit.ts` `setConnectorLimit`: catat `limited_at` + `limit_message` pada konektor (secret key, karena Office
  juga memakai AI); dihapus otomatis saat panggilan berikutnya berhasil atau konektor disimpan ulang.
- Alert kuning "Model AI kena limit" di chat Smart AI dan kartu AI Insight: admin dapat tombol "Ganti model / platform",
  Office diminta menghubungi admin. Halaman Konektor AI: banner + badge "Kena limit" di kartu provider.
- Migrasi `20261029000000_ai_limit_alert.sql` (sudah dijalankan user, berhasil): kolom `limited_at`, `limit_message`.
  Tanpa migrasi, alert di chat/dashboard tetap muncul; hanya penanda di halaman Konektor AI yang belum tersimpan.
- `tsc`, `eslint`, `next build` lolos.

---

## 2026-10-24 — AI Insight otomatis di Dashboard

Keputusan user: kartu AI Insight di dashboard, otomatis 1x per hari per cabang, disimpan (cache), tombol Perbarui,
untuk admin & Office.
- Migrasi `20261028000000_ai_insight.sql` (sudah dijalankan user, berhasil): tabel `ai_insight` (branch_id, insight_date,
  content, model). RLS aktif tanpa policy: hanya server (secret key) yang membaca/menulis setelah cek role.
- `lib/actions/ai-insight.ts` `getBranchInsight(force)`: pakai cache hari ini bila ada, selain itu panggil konektor AI
  aktif dengan tool baca saja (tanpa usulan perubahan), data lewat RLS akun yang login, hasil disimpan.
- `_components/ai-insight-card.tsx`: kartu di atas Data Cabang, dimuat setelah halaman tampil (skeleton), info model &
  jam dibuat, tombol Perbarui. Ganti cabang aktif = insight cabang itu.
- `tsc`, `eslint`, `next build` lolos. Belum dicoba dengan konektor AI sungguhan.

---

## 2026-10-24 — Backup Karyawan jadi menu sendiri

Permintaan user: Backup Karyawan dipisah dari Pengaturan, masuk sidebar di bawah Absensi & Karyawan.
- Halaman pindah `/pengaturan/backup` → `/backup` (header sendiri "Penugasan Backup Antar Cabang"); tab di Pengaturan dihapus.
- Sidebar: ikon Backup Karyawan di bawah Absensi & Karyawan, khusus admin (SPV/Office/karyawan tidak melihat; proxy
  tetap menolak `/backup` untuk mereka karena bukan VIEWER_PATHS).
- `tsc`, `eslint`, `next build` lolos.

---

## 2026-10-24 — Smart AI untuk role Office

Permintaan user: Smart AI juga muncul di web untuk Office.
- Tombol Smart AI tampil untuk admin & Office. Office = analisis saja: tool `usulkan_perubahan_absensi` dihapus dari
  daftar tool & ditolak di executor, prompt sistem menyebut pengguna hanya-lihat. Data dibaca lewat RLS user (Office =
  semua cabang).
- Konektor aktif untuk Office dibaca lewat `createServiceClient()` (secret key, server-only) karena tabel
  `ai_connector` khusus admin; API key tetap hanya didekripsi di server, tidak pernah ke browser.
- Matriks aturan akses: baris "Smart AI (web)". `tsc`, `eslint`, `next build` lolos; belum dicoba dengan akun Office.

---

## 2026-10-24 — Tabel Master Karyawan responsif

Masukan user: tabel Manajemen Karyawan harus digeser ke samping. Tabel tidak lagi memakai lebar minimum 760px;
kolom sekunder disembunyikan bertahap (Kontrak < xl, No. WA < lg, Cabang < md) dan informasinya pindah ke bawah nama
staf. Kolom Aktif & Aksi selalu tampil. `tsc` & `eslint` lolos, belum dicek di browser (perlu login).

---

## 2026-10-24 — Office di atas SPV: cakupan semua cabang

Koreksi user: urutan role Admin > Office > SPV > Karyawan. Ditanyakan ke user: Office melihat **semua cabang**
(tidak perlu memilih cabang). Migrasi `20261027000000_office_role.sql` diubah sebelum dijalankan:
- `my_branch_ids()` untuk office = semua cabang → semua policy SPV berlaku untuk office di semua cabang;
  `my_branch_id()` kembali khusus SPV; office tidak wajib punya cabang utama.
- `my_checkin_branches()`: office = semua cabang aktif (cabang nonaktif tidak bisa dipakai absen).
- Diuji ulang di PGlite: office baca semua cabang (termasuk nonaktif), semua karyawan & absensi, bisa isi absensi
  cabang mana pun; absen sendiri di cabang mana pun; skenario SPV, karyawan, kasbon tetap sama.
- Web: urutan Admin, Office, SPV, Karyawan (`APP_ROLES`); Office tanpa pemilih cabang ("Semua cabang · absen sendiri
  di cabang mana pun"), tetap bisa dihubungkan ke data karyawan; helper `holdsBranches` (SPV) & `attendsSelf` (SPV, Office);
  matriks aturan akses kolom Office diperbarui.

---

## 2026-10-24 — Role baru: Office

Permintaan user: role Office = sama dengan SPV, bedanya bisa absen di cabang mana saja.
- Migrasi `20261027000000_office_role.sql` (versi terbaru sudah dijalankan user di Supabase, berhasil):
  - check role `app_user` + `office`; office juga wajib punya cabang utama;
  - `my_branch_id`, `my_branch_ids`, `my_employee_id`, `backup_branch_options` berlaku untuk office, jadi semua
    policy SPV (baca cabang/karyawan/absensi, isi absensi cabangnya, backup, foto selfie) otomatis berlaku;
  - `attendance_check()`: office boleh memilih semua cabang yang tidak nonaktif (GPS + selfie tetap);
  - fungsi baru `my_checkin_branches()`: daftar outlet absen yang boleh dipakai hari ini (semua role) untuk app HP.
  - Diuji di PGlite: office absen di cabang yang tidak dipegang OK, cabang nonaktif tidak muncul, baca data tetap
    hanya cabang yang dipegang; skenario SPV & karyawan lama tetap sama; skenario kasbon tetap lolos.
- Web: label "Office", helper `holdsBranches()`, pilihan role & filter, kartu ringkasan 5 role, kolom Office di
  matriks aturan akses, proxy (Office = hanya-lihat seperti SPV), validasi cabang di server action.
- Brief ke sesi mobile: role office + `my_checkin_branches()`.
- `tsc`, `eslint`, `next build` lolos.

---

## 2026-10-24 — Pengguna & Akses: ubah & hapus akun (CRUD lengkap)

Masukan user: Pengguna & Akses belum ada CRUD (sebelumnya hanya tambah akun + ubah role).
- Server action baru di `lib/actions/access.ts` (butuh `SUPABASE_SECRET_KEY`, cek admin):
  - `updateUserAccount`: ubah username / email dan/atau reset kata sandi (min. 6 karakter), isian kosong = tidak diubah;
  - `deleteUserAccount`: hapus role dulu (trigger "minimal satu admin" tetap menjaga), lalu akun Auth. Akun sendiri
    tidak bisa dihapus. Data karyawan, absensi, dan kasbon tetap ada (kolom pembuat jadi kosong).
- Tabel akun: tombol "Ubah login / sandi" dan "Hapus" di bawah nama akun; popup Ubah Akun. Hapus dinonaktifkan selama
  role akun itu masih berupa draf yang belum diterapkan.
- `tsc`, `eslint`, `next build` lolos. Belum dicoba di browser (perlu login).

---

## 2026-10-24 — Konektor AI: provider tambahan (DeepSeek, Ollama, dll)

Permintaan user: konektor AI bisa pakai model lain selain Claude / OpenAI / Gemini.
- Provider baru: DeepSeek, OpenRouter, Groq, Mistral, xAI Grok (base URL tetap), Ollama & "OpenAI-compatible"
  (base URL diisi admin, API key opsional). Semua lewat SDK OpenAI dengan `baseURL` (Chat Completions + tool calling).
- `lib/ai/providers.ts`: metadata `kind` (anthropic / openai / gemini / compat), `baseUrl`, `keyOptional`, catatan.
  `engine.ts`: `openaiClient()` untuk compat; pesan error baru (model tanpa tool calling, server tidak terjangkau).
- `actions/ai-connector.ts`: validasi base URL (http/https, tanpa user:pass di URL), key opsional disimpan sebagai
  string kosong terenkripsi. `connector.ts` membaca `base_url` (fallback bila kolom belum ada).
- Halaman Konektor AI: 10 kartu provider (grid 5 kolom), kolom Base URL untuk Ollama / custom, catatan per provider.
- Migrasi `20261026000000_ai_more_providers.sql` (sudah dijalankan user di Supabase, berhasil): perluas check provider + kolom `base_url`.
  Diuji di PGlite: semua migrasi jalan, provider asing & URL non-http ditolak.
- Catatan: web berjalan di Vercel, jadi Ollama di `localhost` PC tidak bisa dipakai; server Ollama harus bisa
  diakses dari internet (domain / tunnel).
- `tsc`, `eslint`, `next build` lolos. Belum dites dengan API key sungguhan.

---

## 2026-10-24 — Riwayat kasbon di Detail Karyawan

Permintaan user: di Absensi → Daftar Karyawan → detail, tampilkan riwayat kasbon tepat di bawah data karyawan.
- `getEmployeeKasbon(employeeId)` di `lib/data/kasbon.ts` (+ helper `toQuota`): 10 kasbon terbaru, jumlah total,
  dan plafon periode berjalan via `kasbon_quota(p_employee)`.
- Kartu "Riwayat Kasbon" (`absensi/karyawan/[id]/kasbon-history.tsx`) di kolom kiri, tepat di bawah kartu profil:
  sisa plafon periode ini, nominal belum dipotong gaji, daftar kasbon (nominal, tanggal, keperluan, status, link bukti).
  Dimuat dengan Suspense sendiri supaya statistik absensi tidak menunggu.
- Hanya tampil untuk admin atau karyawan itu sendiri. SPV yang melihat karyawan lain tidak melihat kartu ini
  (RLS kasbon pribadi; tanpa ini kartu akan salah menampilkan "belum ada kasbon").
- `tsc`, `eslint`, `next build` lolos. Belum dicek di browser (perlu login).

---

## 2026-10-24 — Laporan Kasbon: unduh PDF

Permintaan user: Laporan Kasbon bisa diunduh PDF juga.
- Logika filter & rekap dipindah ke `lib/kasbon-report.ts` (`buildKasbonReport`, `parseKasbonFilters`, `kasbonFilterQuery`)
  supaya halaman dan PDF menghasilkan angka yang sama.
- Route `/laporan/kasbon/export/pdf?period=&branch=&status=&q=` (khusus admin, 403 untuk role lain) + dokumen
  `kasbon-document.tsx` (A4 landscape, gaya sama dengan PDF Laporan Kehadiran): ringkasan 4 kartu, rekap per karyawan
  dengan baris total, detail kasbon dengan badge status, nomor halaman.
- Tombol "Unduh PDF" di samping "Unduh CSV", memakai filter yang sedang aktif.
- Dicek dengan route uji sementara + data contoh 40 kasbon (sudah dihapus): 3 halaman, angka total cocok.
  `tsc`, `eslint`, `next build` lolos.

---

## 2026-10-24 — Dropdown tidak terpotong + tata letak Pengaturan Kasbon

Masukan user: dropdown "Tambah karyawan" terpotong kartu, dan halaman pengaturan terlalu memanjang ke bawah.
- Hook baru `components/use-anchored.ts`: posisi `fixed` menempel ke tombol pemicu, ikut scroll/resize, dan membuka
  ke atas bila ruang di bawah kurang. `useDismiss` kini menerima beberapa ref (tombol + menu portal).
- `SearchSelect` & `BranchMultiPicker` me-render menu lewat portal ke <body> (z-70, di atas modal), jadi tidak
  terpotong `overflow-hidden` kartu / tabel lagi.
- Pengaturan Kasbon: 2 kolom di desktop (Aturan Plafon di kanan atas permintaan user, posisi biasa tanpa sticky; Gaji per Jabatan & Gaji Khusus
  di kiri); pemilih karyawan dipindah ke samping judul.
- Dicek lewat halaman mock sementara (sudah dihapus): menu ada di <body> dan membuka ke atas saat dekat tepi bawah.
  `tsc` & `eslint` lolos.

---

## 2026-10-24 — Kasbon jadi halaman sendiri + tab Laporan Kasbon

Masukan user: kasbon jangan digabung dengan halaman Laporan; Laporan punya tab Laporan Kehadiran & Laporan Kasbon.
- Halaman kasbon pindah ke `/kasbon` (tab Pengajuan Kasbon · Pengaturan Kasbon untuk admin), menu sidebar sendiri.
- `/laporan` = tab **Laporan Kehadiran** (laporan absensi lama) dan **Laporan Kasbon** (`/laporan/kasbon`, admin):
  filter periode gajian (default periode berjalan) / cabang / status / cari, ringkasan nominal (total, menunggu proses,
  dicairkan, belum dipotong gaji), tampilan Per Karyawan & Detail, unduh CSV. Ditolak/dibatalkan tidak dihitung.
- `getKasbonReport()` + helper `toItems()` di `lib/data/kasbon.ts`. Proxy: SPV/karyawan boleh `/kasbon`, ditolak di
  `/kasbon/pengaturan` & seluruh `/laporan`.
- `tsc`, `eslint`, `next build` lolos. Belum dicek di browser (perlu login).

---

## 2026-10-24 — Fitur Kasbon (pinjaman gaji di muka)

Permintaan user (lewat sesi mobile). Keputusan user:
- gaji pokok per jabatan + override per karyawan; pembagi harian & tanggal cut-off diatur admin;
- plafon = gaji pokok ÷ pembagi × HK (hanya status Hadir) pada periode gajian berjalan;
- kasbon diajukan/disetujui/dicairkan pada periode berjalan mengurangi sisa plafon; pelunasan = potong gaji
  (dicairkan + periode lewat = dianggap lunas), admin juga bisa tandai lunas;
- alur: diajukan → disetujui / ditolak → dicairkan (admin unggah bukti foto) → lunas; pengaju bisa membatalkan;
- semua role bisa mengajukan untuk dirinya; SPV hanya melihat kasbon miliknya, admin melihat semua.

Perubahan:
- Migrasi `20261025000000_kasbon.sql` (sudah dijalankan user di Supabase, berhasil): tabel `payroll_setting`, `job_role_salary`,
  `employee_salary`, `kasbon`; fungsi `my_linked_employee_id`, `payroll_period`, `kasbon_quota`, `kasbon_request`,
  `kasbon_cancel`, `kasbon_decide`, `kasbon_disburse`, `kasbon_settle`; RLS baca-saja (tulis lewat fungsi);
  bucket privat `kasbon-proof`. Diuji di PGlite: 21 skenario (periode, plafon, lewat plafon, izin, bukti foto, override) sesuai.
- Web: menu Laporan punya tab Laporan Absensi · Kasbon · Pengaturan Kasbon (admin). SPV/karyawan melihat menu
  "Kasbon" saja (`/laporan/kasbon`; proxy menolak `/laporan/kasbon/pengaturan`).
- Halaman Kasbon: kartu plafon (rumus terlihat), ajukan, riwayat + filter, aksi admin setujui/tolak/cairkan/lunas,
  lihat bukti. Foto bukti dikompres di browser (≤ 900 KB) sebelum dikirim ke server action.
- Pengguna & Akses: admin bisa dihubungkan ke data karyawan ("Kasbon sebagai"), termasuk akun sendiri (role tetap admin).
- Kontrak tabel/RPC/bucket dikirim ke sesi mobile.
- Revisi (masukan user): menu Kasbon sendiri di sidebar untuk semua role (admin juga), tidak lagi tersembunyi di tab Laporan.
  Pilihan data karyawan admin diberi teks jelas: "Admin tidak ikut kasbon" + keterangan bahwa ini opsional untuk kasbon pribadi admin.
- `tsc`, `eslint`, `next build` lolos. Belum dicek di browser (perlu login + migrasi).

---

## 2026-10-24 — Pencarian di pilihan karyawan

Permintaan user: di Pengguna & Akses, pilih karyawan bisa dicari, tidak perlu scroll.
- Komponen baru `pengaturan/_components/search-select.tsx`: menu dengan kotak cari (nama / NIK / cabang),
  keyboard ↑ ↓ Enter Esc, opsi yang sudah dipakai akun lain tampil redup "sudah dipakai".
- Dipakai di Pengguna & Akses (kolom karyawan & "Absen sebagai" SPV di tabel, dan modal Tambah Akun)
  serta modal Backup Karyawan. Validasi "wajib pilih karyawan" tetap di server action.
- `tsc` & `eslint` lolos. Belum dicek di browser (halaman perlu login).

---

## 2026-10-24 — Absen untuk SPV dengan pilihan outlet

**Keputusan user** (mengganti keputusan 2026-10-22 "SPV tidak absen"):
- SPV absen lewat app HP (GPS + selfie) dan memilih outlet tempat absen;
- check out **boleh di outlet lain**;
- rekap & dashboard dihitung di **outlet tempat check in**.

**Database** — migrasi `supabase/migrations/20261024000000_spv_attendance.sql` (**belum dijalankan**):
- `my_employee_id()` juga untuk role `spv` yang terhubung ke data karyawan → SPV bisa unggah selfie & membaca datanya sendiri lewat policy yang sudah ada.
- Kolom `attendance_daily.check_out_branch_id` (outlet check out), dikunci trigger seperti kolom check-in/out lain.
- `attendance_check(..., p_branch uuid default null)`:
  - versi 6 parameter di-drop supaya tidak ada overload ambigu; panggilan lama tetap jalan;
  - outlet diizinkan: penempatan + backup hari ini, plus SPV: `my_branch_ids()`;
  - SPV pulang boleh di outlet mana pun miliknya; karyawan tetap di cabang check in;
  - pesan jelas bila akun belum terhubung ke data karyawan / data belum punya penempatan.
- Diuji di Postgres (PGlite), 11 migrasi + ulang:
  - SPV pilih outlet bukan miliknya → ditolak;
  - pilih B tapi berdiri di C → di luar radius;
  - pilih C di C → OK (dicatat di C);
  - masuk dua kali → ditolak;
  - pulang pilih B di B → OK (`check_out_branch_id` = B);
  - karyawan: pilih cabang lain → ditolak; masuk & pulang di A OK; pulang di B → ditolak.

**Web:**
- **Pengguna & Akses**:
  - SPV punya pilihan "Absen sebagai: <data karyawan>" (opsional, di tabel & modal Tambah Akun);
  - satu data karyawan hanya untuk satu akun (karyawan / SPV).
  - **Bug ikut diperbaiki:** regex pengambil NIK untuk username otomatis kehilangan backslash, sehingga username terisi "nama+NIK". Sekarang `/\(([^)]+)\)$/` lagi.
- **Absensi Harian / roster** (`getDayRoster`): status lokasi hari itu kini 4 jenis:
  - `in` = backup masuk;
  - `out` = sedang backup keluar;
  - `visit` = karyawan cabang lain (mis. SPV) yang absen di sini → "Absen di sini · dari X";
  - `elsewhere` = karyawan cabang ini yang absen di cabang lain → "Absen di Y", hanya-lihat & dilewati "Tandai Semua Hadir" / simpan.
- `getBranchCodes()`: peta id → kode (SPV dilengkapi dari `backup_branch_options()`).
- **Rekap**: karyawan yang absen di cabang ini ikut tampil ("Absen di sini dari X"), dan hanya hari di cabang ini yang dihitung.
- **Dashboard**: cabang hitungan = cabang tempat absen hari itu > cabang backup > penempatan.
- **Kolom Out**: bila outlet check out berbeda, tampil "di KODE · jarak", dan penampil foto menampilkan baris "Outlet". `getCheckDetails` tetap jalan sebelum migrasi (fallback tanpa kolom baru).
- `RosterEntry.branchId` (cabang penempatan) ditambahkan.
- **App mobile**: diminta ke session `mobile-login` (layar Absen SPV + pemilih outlet terdekat, riwayat outlet).
- Verifikasi: `tsc`, `eslint`, dan `next build` lolos.

---

## 2026-10-22 — Tanda pisah panjang (—) dihapus dari teks tampilan

- Feedback user: teks "Mode lihat saja — absensi diisi …" terlihat jelek karena tanda pisah panjang.
- Semua "—" di teks yang tampil ke pengguna diganti tanda baca biasa:
  - kalimat → titik / koma ("Mode lihat saja. Absensi diisi lewat aplikasi mobile atau oleh admin.", pratinjau Laporan, toast & hint Konektor AI, peringatan migrasi di Pengguna & Akses, akurasi lokasi & titik belum diatur di Area GPS, info Smart AI, pesan filter Laporan, status usulan AI);
  - placeholder pilihan "— Pilih karyawan / cabang / cabang tujuan —" → "Pilih …" (gaya sama dengan pilihan lain);
  - sel kosong "—" di tabel aturan akses & model AI → "-";
  - pemisah opsi "Nama — Cabang" / "— jabatan" → "·".
- Komentar di kode tidak diubah (tidak tampil).
- Verifikasi: `grep` tidak menemukan "—" lagi di teks tampilan; `tsc` + `eslint` lolos.

---

## 2026-10-22 — Fix keamanan: karyawan bisa melihat semua cabang

- Laporan user: login sebagai karyawan, pemilih cabang / dashboard menampilkan cabang lain.
- Penyebab: policy `rls_member_read` di migrasi `backup_and_multi_branch_spv` (semua akun terdaftar boleh membaca tabel `branch`), yang dibuat agar SPV bisa memilih cabang tujuan backup.
  - Data karyawan / absensi cabang lain tetap terlindungi policy lain.
  - Yang terlihat hanya daftar cabang (kode, nama, titik GPS).
- Migrasi baru `supabase/migrations/20261022010000_branch_visibility_fix.sql` (**sudah dijalankan user**; login karyawan kini hanya melihat cabangnya):
  - hapus `rls_member_read`;
  - fungsi `backup_branch_options()` (security definer): id / kode / nama cabang aktif, **khusus admin & SPV**.
- Diuji di Postgres (PGlite), dengan karyawan di AAA backup ke CCC dan SPV di BBB:
  - tabel `branch`: admin semua, SPV hanya BBB, karyawan hanya AAA + CCC;
  - `backup_branch_options()`: admin & SPV semua, karyawan kosong;
  - migrasi aman diulang.
- Web: `getBackups()` mengisi kode cabang yang tak terbaca oleh SPV (cabang lawan backup) dari `backup_branch_options()`, sehingga label tidak tampil "-".
- App mobile: diminta ke session `mobile-login` untuk mengganti daftar cabang tujuan backup (`src/lib/spv.tsx`) ke RPC itu.
- Verifikasi: `tsc` + `eslint` lolos.

---

## 2026-10-22 — Garis tab bergeser, perpindahan halaman, animasi dashboard

Langkah 3–5 dari rencana animasi (lihat entri Motion di bawah). Mengikuti panduan Next `view-transitions.md` di `node_modules/next/dist/docs`: di App Router, navigasi adalah *transition*, jadi `<ViewTransition>` (React 19.3) aktif otomatis.

- **Perpindahan halaman** (`components/shell/page-layout.tsx`):
  - `PageHeader` & `PageBody` dibungkus `PageTransition` = `<ViewTransition enter="page-enter" exit="page-exit" default="none">`;
  - isi lama keluar memudar cepat (120 ms), isi baru memudar + naik 8 px (220–280 ms);
  - ditaruh di komponen halaman, bukan layout, sehingga topbar & sidebar diam;
  - `::view-transition-old/new(root)` tanpa animasi.
- **Garis bawah tab** bergeser dari tab lama ke tab baru, tidak lompat:
  - garis aktif dipisah dari `::after` menjadi `TabIndicator` dengan nama view transition per grup (`tab-indicator-absensi`, `tab-indicator-pengaturan`) + `share="tab-indicator"`; browser memorf posisinya antar halaman;
  - tab tidak aktif tetap punya garis tipis saat hover.
- CSS di `globals.css`:
  - `::view-transition { pointer-events: none }` (klik tetap jalan selama animasi);
  - durasi 0 untuk `prefers-reduced-motion`.
- **Dashboard** (`components/dashboard-motion.tsx`):
  - `CountUp`: persentase kehadiran global & per cabang naik bertahap dari 0 (pembaca layar langsung membaca angka akhir);
  - `GrowBar`: progress bar memanjang dari 0, berurutan;
  - kartu cabang di carousel muncul berurutan (naik + memudar), juga saat carousel digeser;
  - semua mematuhi "kurangi animasi".
- Verifikasi:
  - React 19.3.0 mengekspor `ViewTransition` & `addTransitionType`;
  - `tsc`, `eslint`, dan `next build` lolos; CSS build berisi semua aturan `::view-transition`;
  - dev server sempat menyajikan CSS lama (belum recompile setelah `globals.css` ditambah), lalu di-restart dan aturan view-transition sudah tersaji;
  - animasi di halaman setelah login belum dilihat langsung (butuh login).

---

## 2026-10-22 — Animasi halus dengan Motion (pop up, toast, dropdown)

- Keputusan:
  - **Motion** (`motion@14.5.0`, penerus Framer Motion) untuk interaksi kecil;
  - perpindahan halaman nanti memakai `<ViewTransition>` bawaan React 19.3 / Next 16 (tanpa library, lebih cocok untuk App Router).
  - Tahap ini = langkah 1–2.
- **Fondasi** `components/motion.tsx`:
  - `MotionProvider` di root layout: `LazyMotion` + `domAnimation` (hanya fitur dasar → bundle kecil, `strict` memaksa `m.*`) dan `MotionConfig reducedMotion="user"` (animasi mati bila perangkat memilih "kurangi animasi");
  - preset seragam: `EASE_OUT`, `FADE` (latar), `POP` (kotak pop up), `DROP` (dropdown), `TOAST`.
- **Pop up**:
  - `PopupLayer`: latar memudar;
  - `Modal` (semua form Pengaturan) & penampil foto selfie: kotak memudar + membesar sedikit dari bawah;
  - animasi keluar berjalan sebelum hilang (`AnimatePresence`); penampil foto dipecah jadi `PhotoDialog` supaya isinya tetap ada saat animasi keluar.
- **Toast**: 3 salinan (Pengaturan, Absensi Harian, Login) disatukan menjadi `components/toast.tsx`:
  - naik masuk / turun keluar, lewat portal ke `<body>`;
  - region `role="status"` tetap untuk pembaca layar;
  - posisi default di atas bilah navigasi mobile (login: `bottom-6`).
- **Dropdown**:
  - pemilih cabang topbar dan `BranchMultiPicker` (SPV) turun memudar;
  - menu profil topbar diganti dari `<details>` (tanpa animasi, tidak tertutup saat klik di luar) menjadi komponen client `shell/user-menu.tsx`;
  - logika "tutup saat klik di luar / Esc" yang tadinya disalin 3 kali disatukan jadi hook `components/use-dismiss.ts`.
- Verifikasi:
  - `tsc`, `eslint`, dan `next build` lolos;
  - di Browser pane (login, username tidak valid): toast muncul via `<body>` (opacity 1, region live berisi pesan) lalu hilang otomatis; tidak ada error hydration;
  - pop up & dropdown di halaman setelah login belum dilihat langsung.

---

## 2026-10-22 — Sidebar tetap di tempat + navigasi bawah di mobile

- Feedback user: posisi sidebar naik-turun saat pindah halaman (Dashboard → Absensi), dan di mobile sidebar diminta di bawah.
- Penyebab naik-turun: di grid shell, sidebar diletakkan **di bawah baris judul halaman**, padahal tinggi judul berbeda per halaman (Absensi punya tab).
- Penyebab `sticky` sidebar tidak pernah jalan: pembungkus memakai `overflow-x-hidden`, yang menjadikannya wadah scroll sendiri.
- Perbaikan:
  - `(app)/layout.tsx`: sidebar `md:row-start-2 md:row-span-2` (langsung di bawah topbar, sejajar judul + isi). `overflow-x-hidden` → `overflow-x-clip`. `backdrop-blur-xl` shell dihapus (shell 95% buram; blur juga penyebab masalah `fixed` kemarin).
  - `PageHeader` / `PageBody`: kolom kanan saja (`md:col-start-2`), jadi judul sejajar dengan isi.
  - `sidebar.tsx`:
    - **mobile** = bilah navigasi tetap di bawah layar (`fixed inset-x-3 bottom-3`, aman untuk notch / gesture bar);
    - **desktop** = kolom kiri yang `sticky top-7` saat scroll.
  - Mobile: padding bawah halaman ditambah. Tombol Smart AI, toast, dan bar "Terapkan Pengaturan" dinaikkan supaya tidak tertutup bilah bawah.
- Verifikasi (tiruan shell dengan kelas yang sama di Browser pane):
  - desktop 1280px: posisi sidebar **sama (top 145px)** untuk judul pendek & tinggi, dan setelah scroll menempel di top 28px;
  - mobile 375px: `fixed` di bawah, jarak 12px dari tepi.
  - `tsc`, `eslint`, dan `next build` lolos.

---

## 2026-10-22 — Fix: latar pop up tidak menutupi sudut layar

- Feedback user: saat pop up terbuka, sudut-sudut layar tidak rapi / tidak konsisten.
- Penyebab: shell aplikasi (`(app)/layout.tsx`) memakai `backdrop-blur`. `backdrop-filter` menjadikan shell *containing block* untuk elemen `fixed` di dalamnya, sehingga `fixed inset-0` hanya menutupi kotak shell, bukan layar, dan sudut membulat shell terlihat.
  - Terbukti di Browser pane: `fixed` di dalam kotak ber-blur berukuran 300×200 (ukuran kotak), sedangkan lewat portal 1280×720 (layar).
- Perbaikan `components/popup-overlay.tsx`:
  - `PopupLayer` (latar polos + isi pop up) dan `BodyPortal` merender ke `<body>` lewat `createPortal`;
  - `useSyncExternalStore` dipakai supaya tidak ada hydration mismatch.
  - Dipakai `Modal` (semua form Pengaturan) dan penampil foto selfie.
- Masalah yang sama pada **toast** (notifikasi bawah menempel ke dasar shell, bisa tak terlihat di halaman panjang) ikut diperbaiki: `Toast` di Pengaturan dan toast Absensi Harian lewat `BodyPortal`.
- Verifikasi: `tsc`, `eslint`, dan `next build` lolos.

---

## 2026-10-22 — Pop up tanpa blur + header Backup Karyawan dirapikan

- Feedback user: pop up (modal input apa pun) jangan pakai blur, cukup pop up normal. Header Backup Karyawan kurang rapi: deskripsi terhimpit, tombol "Tambah Backup" patah 2 baris.
- Komponen bersama `components/popup-overlay.tsx` (`PopupOverlay`): latar gelap polos tanpa `backdrop-blur` (`black/55`, light mode `black/35`), klik latar = tutup.
  - Dipakai `Modal` (semua form Pengaturan: karyawan, cabang, backup, jabatan, tambah akun) dan penampil foto selfie di Absensi Harian.
  - Bayangan modal `shadow-black/80` yang berat di light mode diganti `shadow-2xl` biasa.
  - Token `--color-scrim` dihapus (tidak terpakai lagi).
  - Blur di topbar, kartu cabang, dan halaman login tidak diubah (bukan pop up).
- Header Backup Karyawan:
  - judul + jumlah penugasan + deskripsi selebar penuh;
  - di bawahnya satu baris pencarian, filter periode, dan filter cabang;
  - tombol "Tambah Backup" di kanan, tidak pernah patah baris.
- Verifikasi: `tsc` + `eslint` lolos; baris filter dicek lewat tiruan di Browser pane (halaman asli butuh login).

---

## 2026-10-22 — Backup karyawan, mutasi bertanggal efektif, SPV banyak cabang

**Keputusan user:**
1. Karyawan backup dihitung di **cabang tujuan**.
2. Backup dibuat admin (web) dan SPV (app).
3. SPV tidak absen sendiri.
4. Backup memakai rentang tanggal, seringnya 1 hari.

**Database** — migrasi `supabase/migrations/20261022000000_backup_and_multi_branch_spv.sql` (**sudah dijalankan user** setelah perbaikan `uuid[]`; menu Backup Karyawan tampil):
- `app_user_branch` (cabang SPV, boleh > 1; data lama dipindahkan) + fungsi `my_branch_ids()`. `app_user.branch_id` tetap ada sebagai cabang utama.
- `employee_backup` (karyawan, cabang asal [otomatis], cabang tujuan, tanggal mulai/selesai, keterangan):
  - trigger menolak rentang tumpang tindih & cabang sama;
  - maks. 93 hari;
  - perubahan tercatat di audit log.
- Fungsi `home_branch_on()` & `employee_branch_on()`.
- RLS SPV dari 1 cabang menjadi daftar cabang:
  - SPV juga melihat karyawan / penempatan / foto karyawan backup yang masuk, dan absensi karyawannya yang sedang backup;
  - SPV boleh mengelola backup yang masuk / keluar cabangnya;
  - semua akun terdaftar boleh membaca daftar cabang (untuk memilih cabang tujuan).
- `attendance_check()`:
  - check in boleh di cabang asal **atau** cabang backup hari ini (terdekat dalam radius), dan dicatat di cabang itu;
  - check out memakai cabang check in;
  - urutan validasi diperbaiki (cek "belum absen masuk" sebelum cek jarak);
  - penempatan dibaca yang berlaku pada tanggal itu.
- `admin_list_users()` + kolom `branch_ids`.
- Dicek dengan parser Postgres (`plpgsql-parser`): 61 statement + 3 fungsi plpgsql, 0 error sintaks.
- **Fix setelah dijalankan user:** error `42883 operator does not exist: uuid = uuid[]`.
  - Penyebab: `x = any ((select my_branch_ids()))` dibaca Postgres sebagai perbandingan per baris subquery.
  - Perbaikan: diganti `= any ((select my_branch_ids())::uuid[])` (22 tempat).
- **Diuji di Postgres sungguhan (PGlite)** dengan stub `auth` & `storage`:
  - ke-9 migrasi berjalan berurutan, dan migrasi ini aman diulang;
  - trigger backup mengisi cabang asal & menolak tumpang tindih;
  - `employee_branch_on()` benar;
  - SPV dengan 2 cabang melihat data yang benar;
  - `admin_list_users()` mengembalikan `branch_ids`.
- **`attendance_check()` diuji 6 skenario, semua sesuai:**
  - pulang sebelum masuk → ditolak;
  - di luar semua radius → ditolak;
  - masuk di cabang backup → dicatat di cabang backup;
  - masuk dua kali → ditolak;
  - pulang di cabang asal → ditolak (harus di cabang masuk);
  - pulang di cabang backup → OK.

**Web:**
- `lib/data/backup.ts`: `getBackups()` dan `getDayRoster()` (karyawan cabang − yang sedang backup keluar + yang backup masuk).
- **Absensi Harian**: label "Backup dari X" / "Sedang backup di Y". Baris yang sedang backup keluar hanya-lihat dan dilewati "Tandai Semua Hadir". `saveAttendance` memakai roster yang sama.
- **Rekap Bulanan**:
  - karyawan backup masuk ikut tampil ("Backup dari X");
  - hanya absen yang dicatat di cabang ini yang dihitung;
  - hari yang tercatat di cabang lain ditandai ↗ (CSV: `@KODE`).
- **Dashboard**: karyawan backup dihitung di cabang tujuan hari itu; penempatan dibaca per tanggal.
- **Pengaturan → Backup Karyawan** (tab baru, admin):
  - ringkasan (berlangsung hari ini / terjadwal / 90 hari);
  - filter periode (aktif / riwayat / semua), cabang, pencarian, dan paginasi;
  - tambah / edit / hapus lewat modal;
  - pesan dari trigger ditampilkan apa adanya.
- **Mutasi bertanggal efektif** (Manajemen Karyawan):
  - field "Berlaku mulai" saat cabang / jabatan diubah;
  - tanggal mendatang = **pindah terjadwal** (badge "→ KODE mulai …" di daftar), dengan opsi "Batalkan jadwal pindah";
  - tidak boleh sebelum awal penempatan saat ini;
  - data karyawan / cabang membaca penempatan yang berlaku hari ini, bukan "valid_to kosong".
- **Pengguna & Akses**: SPV memilih beberapa cabang lewat `BranchMultiPicker` (cabang pertama = utama), dan tabel aturan akses diperbarui. Sebelum migrasi, SPV 1 cabang tetap jalan dan > 1 cabang ditolak dengan pesan jelas.
- **App mobile**: diminta ke session `mobile-login` (tampilan backup untuk karyawan, SPV multi-cabang, dan menu Backup untuk SPV).
- Verifikasi:
  - `tsc`, `eslint`, dan `next build` lolos. Build sempat gagal karena `new Date()` sebelum data request-time di halaman backup, lalu diperbaiki dengan `await connection()`.
  - Alur setelah login belum dites (butuh migrasi & login).

---

## 2026-10-21 — Login pakai username, kata sandi min. 6 karakter

- Permintaan user: akun login tidak harus email, dan kata sandi cukup 6 karakter bebas, supaya karyawan mudah login.
- Supabase Auth hanya mengenal email untuk login kata sandi, jadi **username disimpan sebagai email internal** `<username>@akun.denaprojects.web.id`. Email ini tidak pernah dipakai mengirim surat. Login dengan email asli (admin) tetap jalan.
- `lib/login-id.ts` (dipakai web & disalin ke app mobile):
  - `LOGIN_EMAIL_DOMAIN` — **jangan diubah** setelah ada akun;
  - `USERNAME_RE` (3–30, huruf/angka/`.`/`-`/`_`, tidak peka huruf besar/kecil) dan `PASSWORD_MIN = 6`;
  - `toLoginEmail()`, `displayLogin()`, `usernameFromNik()`.
- Login web:
  - field **Username / Email** (input teks biasa);
  - isian invalid langsung ditolak dengan "Username / email atau kata sandi salah." tanpa memanggil Supabase.
- Tambah Akun:
  - field Username / Email; username otomatis terisi dari NIK saat memilih karyawan (bila kosong);
  - kata sandi min. 6 karakter, bebas huruf / angka / simbol.
- Daftar akun & menu topbar menampilkan username, bukan email internal.
- App mobile: diminta ke session `mobile-login` untuk menyalin `login-id.ts` dan menyesuaikan layar login.
- Catatan: kalau Supabase menolak kata sandi 6 karakter, cek **Authentication → Sign In / Providers → Email → Minimum password length** (default Supabase 6).
- Verifikasi: `tsc`, `eslint`, dan `next build` lolos; `toLoginEmail` dites 8 kasus. Di Browser pane, username tidak valid menampilkan pesan error yang benar.

---

## 2026-10-21 — Kolom In / Out / Foto In / Foto Out di Absensi Harian

- Permintaan user: tabel Absensi Harian menampilkan detail check in / check out yang diinput karyawan dari app mobile.
- Data dari migrasi `20261021020000_attendance_check_in_out.sql` (entri di bawah): kolom `check_in_*` / `check_out_*` dan bucket privat `attendance-selfie`. Tidak ada perubahan skema di langkah ini.
- `lib/data/check.ts` → `getCheckDetails(employeeIds, date)`:
  - mengambil detail check in / out satu tanggal;
  - foto dibuka lewat **signed URL 1 jam** (RLS storage tetap berlaku: admin semua, SPV cabangnya);
  - bila kolom belum ada (42703), kembali kosong tanpa error.
- Tabel Absensi Harian:
  - 4 kolom baru setelah status: **In**, **Out** (jam WIB + jarak ke cabang), **Foto In**, **Foto Out** (thumbnail);
  - lebar minimum tabel 1080px (bisa digeser horizontal);
  - komponen di `absensi/_components/check-cells.tsx`.
- Klik foto membuka **lightbox**: selfie besar, nama, NIK, jenis, jam, jarak ke cabang, akurasi GPS, koordinat, dan link Google Maps. Tutup dengan Esc / klik luar.
- Ceklis status & keterangan admin tetap seperti sebelumnya. Kolom check in / out tidak bisa diubah dari web (dikunci trigger database).
- Verifikasi: `tsc`, `eslint`, dan `next build` lolos. Tampilan belum dilihat langsung karena sesi login di Browser pane kedaluwarsa.

---

## 2026-10-21 — Migrasi absen mandiri app mobile (Check In / Check Out, GPS + selfie)

- Migrasi baru `supabase/migrations/20261021020000_attendance_check_in_out.sql` untuk app mobile
  (`absensi-karyawan-mobile`). **Belum dijalankan** di Supabase. Jalankan sekali di SQL Editor.
- `attendance_daily` + kolom `check_in_*` / `check_out_*`: jam, lat/lng, akurasi, jarak ke cabang, path foto.
- Bucket Storage privat `attendance-selfie` (JPEG, maks 2 MB). Karyawan unggah ke folder `<employee_id>/`;
  baca: admin semua, karyawan miliknya, SPV karyawan di cabangnya.
- Fungsi `attendance_check(kind, lat, lng, akurasi, foto, mocked)` jadi satu-satunya jalan karyawan absen:
  jam dari server, jarak dihitung di server (tolak di luar `geofence_radius_m`), tolak fake GPS,
  foto harus sudah terunggah di folder karyawan itu.
- Policy `rls_karyawan_insert` / `rls_karyawan_update` dihapus. Kolom check-in/out dikunci trigger,
  jadi tidak bisa diubah manual dari panel. **Catatan:** kalau `role_based_rls.sql` dijalankan ulang,
  kedua policy itu muncul lagi. Jalankan ulang migrasi ini sesudahnya.
- Belum ada: tampilan jam/foto check-in di panel web, aturan telat/shift.

## 2026-10-21 — Peta interaktif untuk memilih titik cabang

- Feedback user: belum bisa memilih titik langsung di peta, karena sebelumnya hanya ada pratinjau iframe statis.
- Dependency baru `leaflet@1.9.4` (+ `@types/leaflet`), peta OpenStreetMap gratis tanpa API key.
  - `npm audit` melaporkan 5 high, semuanya dari tooling ESLint (`eslint-config-next` → `braces`), sudah ada sebelumnya dan tidak terkait leaflet.
- `cabang/map-picker.tsx`:
  - Leaflet di-import dinamis (browser saja);
  - **klik peta** untuk menaruh / memindahkan titik;
  - **lingkaran radius** cyan mengikuti radius yang dipilih;
  - peta otomatis zoom ke lingkaran saat titik baru / di luar layar;
  - scroll-wheel zoom dimatikan supaya form modal tetap bisa di-scroll.
- `geo-area-field.tsx` disusun ulang:
  - **Cari tempat / alamat** lewat OpenStreetMap Nominatim, hanya saat Cari / Enter ditekan sesuai kebijakan pemakaian. Enter tidak men-submit form modal.
  - Tombol **Lokasi saya**.
  - Peta interaktif.
  - Field koordinat (tetap bisa tempel dari Google Maps) dan radius.
  - Semua sumber titik saling sinkron.
- Iframe pratinjau statis dihapus.
- **Verifikasi di Browser pane** (form Edit DKT001A, ditutup dengan Batal tanpa disimpan):
  - klik peta → koordinat terisi + lingkaran tampil;
  - radius 500 m → lingkaran membesar;
  - cari "Monas Jakarta" → 2 hasil, dipilih → titik pindah & peta zoom.
- `tsc` + `eslint` lolos. Halaman uji sementara `/login/map-test` sudah dihapus.

---

## 2026-10-21 — Area GPS absen per cabang

- **Konteks:** app Android nanti memakai **GPS + kamera selfie** (bukan ceklis). User minta pengaturan area GPS dibuat dulu di web, pada form tambah / edit cabang.
- **Database:**
  - Migrasi `supabase/migrations/20261021010000_branch_geofence.sql` (**belum dijalankan**) menambah kolom `branch.latitude`, `branch.longitude`, dan `branch.geofence_radius_m` (default 100).
  - Check: titik diisi berpasangan dan valid; radius 10–5000 m.
  - Perubahan tercatat otomatis di audit log.
- **`lib/geo.ts`** (dipakai client & server):
  - batas radius + preset 50/100/200/500 m;
  - `parseLatLng()` menerima salinan koordinat Google Maps, link Maps (`@lat,lng` / `?q=`), atau dua angka (koma desimal juga);
  - `formatLatLng()` dan `mapsUrl()`.
- **Form cabang** — bagian baru **Area GPS Absen** (`cabang/geo-area-field.tsx`):
  - input titik koordinat (tempel dari Maps) atau tombol **Pakai lokasi saya** (geolocation browser, dengan peringatan akurasi);
  - radius lewat preset atau angka;
  - pratinjau peta OpenStreetMap (iframe, tanpa library), link "Buka di Google Maps", dan tombol "Hapus titik".
- **Daftar cabang:**
  - badge "GPS · radius 100 m" atau "GPS belum diatur" (koordinat di tooltip);
  - ekspor CSV ditambah kolom Titik GPS & Radius.
- **Transisi aman:**
  - sebelum migrasi dijalankan, `getBranchSettings()` mendeteksi kolom belum ada (42703) → `geoReady=false`;
  - bagian GPS dinonaktifkan dengan petunjuk migrasi;
  - `applyBranchChanges(rows, geo)` tidak mengirim kolom GPS, jadi edit cabang tetap jalan.
- **Pemanggil `getBranchSettings()`** (Manajemen Karyawan, tools AI) disesuaikan ke bentuk `{ branches, geoReady }`.
- **Verifikasi:**
  - `tsc`, `eslint`, dan `next build` lolos;
  - `parseLatLng` dites 10 kasus (format Maps, link, koma desimal, input tidak valid / di luar rentang) dan semua sesuai;
  - form asli belum dicoba (butuh login + migrasi).

---

## 2026-10-21 — Tambah akun & filter di Pengguna & Akses

- Permintaan user: akun bisa ditambah dari Pengaturan, dan daftar akun diberi filter supaya tidak memanjang ke bawah.
- **Filter & paginasi**: cari email, filter role (Semua / Admin / SPV / Karyawan / Tanpa Akses), 10 akun per halaman, dan info "Menampilkan x–y dari n".
- **Tambah Akun** (modal):
  - field: email, kata sandi awal (min. 8, bisa ditampilkan), role, dan cakupan (cabang untuk SPV, data karyawan untuk karyawan);
  - akun dibuat langsung aktif (`email_confirm: true`);
  - tombol nonaktif selama ada perubahan role yang belum diterapkan.
- Membuat akun Supabase butuh **secret key**: publishable key tidak bisa, dan sign-up publik sengaja dimatikan.
  - Env baru opsional `SUPABASE_SECRET_KEY`, hanya dibaca di `lib/supabase/admin.ts` (`server-only`, tanpa `NEXT_PUBLIC_`). Key diisi sendiri oleh user di `.env.local` / Vercel.
  - Tanpa key: tombol nonaktif + petunjuk pengisian.
- Action `createUserAccount` (`lib/actions/access.ts`):
  - cek admin (rpc `is_admin`), lalu validasi email / kata sandi / cakupan;
  - `auth.admin.createUser`, lalu simpan role lewat client admin yang login (RLS + trigger berlaku);
  - bila menyimpan role gagal, akun auth dihapus lagi;
  - pesan ramah untuk email yang sudah terdaftar dan kata sandi lemah.
- `.env.example` & README diperbarui:
  - scope role, fitur Pengguna & Akses, tabel `app_user`, migrasi #6, dan env `SUPABASE_SECRET_KEY`;
  - poin keamanan baru;
  - catatan instalasi baru (migrasi #6 dijalankan setelah akun admin pertama dibuat).
- Verifikasi: `tsc`, `eslint`, dan `next build` lolos. User sudah mengisi `SUPABASE_SECRET_KEY` di `.env.local` & Vercel, dan Tambah Akun berhasil.

---

## 2026-10-21 — Web hanya-lihat untuk SPV & karyawan

- Keputusan user:
  - karyawan login untuk absen hanya di app HP;
  - di panel web, akun non-admin hanya bisa **melihat Dashboard & menu Absensi** tanpa mengubah apa pun;
  - berlaku untuk SPV & karyawan, masing-masing sesuai cakupan RLS-nya.
- **Proxy** (`lib/supabase/proxy.ts`):
  - admin → semua halaman;
  - SPV / karyawan → hanya `/` dan `/absensi/*`, rute lain diarahkan ke `/`;
  - akun tanpa role → `/akses-ditolak`.
- **Server action**:
  - helper `isAdmin()` + `READ_ONLY_ERROR` di `lib/data/access.ts`;
  - dipasang di semua aksi tulis: `saveAttendance`, `applyEmployee/Branch/RoleChanges`, `test/save/deactivate/deleteConnector`, `askAssistant`, `approveProposal`;
  - `saveUserAccess` sudah cek admin sebelumnya;
  - mengganti cabang aktif tetap boleh, karena hanya cookie.
- **UI**:
  - Sidebar: SPV / karyawan hanya melihat menu Dashboard & Absensi (role dibaca di `(app)/layout.tsx` lewat Suspense).
  - Smart AI chat hanya dirender untuk admin.
  - Absensi Harian `readOnly`: radio & keterangan nonaktif, dan tombol simpan diganti label "Mode lihat saja".
  - Daftar Karyawan / detail / Rekap sudah tanpa aksi tulis.
  - Teks `/akses-ditolak` disesuaikan (khusus akun tanpa role).
  - Tabel aturan akses di Pengguna & Akses diperbarui.
- RLS di database **tidak diubah**: SPV / karyawan tetap boleh mengisi absensi lewat app mobile sesuai policy.
- Verifikasi: `tsc`, `eslint`, dan `next build` lolos; tanpa login semua rute → 307 `/login`. Alur dengan akun SPV / karyawan belum dites.

---

## 2026-10-21 — RLS berbasis role + halaman Pengguna & Akses

**Latar belakang:** user berencana membuat app Android yang sync ke database yang sama. Policy lama ("semua `authenticated` = akses penuh") hanya aman selama ada 1 akun, jadi role harus ada sebelum akun kedua dibuat. **Scope berubah:** akun SPV / karyawan kini dimungkinkan, tapi panel web tetap khusus admin.

**Database** — migrasi `supabase/migrations/20261021000000_role_based_rls.sql` (**belum dijalankan**):
- Tabel `app_user`:
  - kolom: `user_id → auth.users`, `role` admin / spv / karyawan, `branch_id` (wajib untuk SPV), `employee_id` (wajib & unik untuk karyawan);
  - akun yang sudah ada otomatis dijadikan **admin**;
  - akun tanpa baris `app_user` tidak bisa membaca apa pun.
- Fungsi `security definer`: `current_app_role()`, `is_admin()`, `my_branch_id()`, `my_employee_id()`, `today_wib()`, dan `admin_list_users()` (daftar akun auth, khusus admin). Eksekusi dicabut dari `anon`.
- Trigger `app_user_keep_one_admin`: minimal harus ada satu admin.
- Semua policy lama diganti. Ringkasannya:
  - **Admin**: penuh.
  - **SPV**: baca cabang / karyawan / penempatan / absensi cabangnya; isi & ubah absensi cabangnya s/d hari ini.
  - **Karyawan**: baca data dirinya; isi & ubah absensi miliknya untuk hari ini (WIB) di cabang penempatan aktif.
  - Master jabatan / cluster bisa dibaca semua akun terdaftar. Audit log, konektor AI, dan `app_user` khusus admin.

**Web**
- `lib/supabase/proxy.ts`: akun login non-admin diarahkan ke halaman baru `/akses-ditolak` (berisi tombol keluar). Bila migrasi belum dijalankan, proxy membiarkan lewat (mode lama).
- Tab baru **Pengaturan → Pengguna & Akses** (`/pengaturan/akses`):
  - ringkasan jumlah akun per role;
  - tabel akun (email, login terakhir) dengan pilihan role, plus cakupan data (cabang untuk SPV, data karyawan untuk karyawan; satu karyawan hanya untuk satu akun);
  - simpan sekaligus lewat ApplyBar;
  - tabel "Aturan Akses (RLS)" yang menjelaskan hak tiap role;
  - banner peringatan bila migrasi belum dijalankan.
- `lib/actions/access.ts` (`saveUserAccess`): cek admin, akun sendiri tidak bisa diubah, dan validasi cakupan.
- `lib/data/access.ts` + `AppRole` / `APP_ROLE_LABEL` di `lib/labels.ts`.
- Akun baru tetap dibuat di Supabase Dashboard (tanpa `service_role` key di app), lalu diberi role di halaman ini.

**Verifikasi:**
- `tsc`, `eslint`, dan `next build` lolos.
- Tanpa login, `/pengaturan/akses` & `/akses-ditolak` → 307 ke `/login`.
- Alur setelah login belum dites (butuh migrasi & login admin).

---

## 2026-10-20 — "Lihat Detail" kartu cabang membuka Daftar Karyawan

- Permintaan user: tombol "Lihat Detail" di kartu cabang Dashboard langsung menuju Daftar Karyawan cabang itu. Sebelumnya tombol ini hanya mengganti cabang aktif dan tetap di Dashboard.
- Server action baru `openBranchEmployees(branchId)` di `lib/actions/branch.ts`: set cookie cabang aktif lalu `redirect("/absensi/karyawan")`. Daftar Karyawan membaca cabang aktif, jadi yang tampil adalah karyawan cabang tersebut.
- `setActiveBranch` tetap dipakai pemilih cabang di topbar.
- Verifikasi: `tsc` + `eslint` lolos.

---

## 2026-10-20 — Deploy Vercel + domain, dan fix pemilih tanggal Laporan

**Deploy**
- App di-deploy ke Vercel lewat import repo GitHub. Env diisi manual oleh user; integrasi Supabase dari Vercel tidak dipakai.
- Domain `denaprojects.web.id` (DomaiNesia):
  - Awalnya "Invalid Configuration" karena nameserver DomaiNesia menolak query (zona DNS belum aktif).
  - Setelah DNS Management aktif: `www` CNAME ke Vercel, dan `@` A record ke `216.198.79.1`.
  - Dicek: `https://www.denaprojects.web.id/login` → 200 lewat HTTPS.

**Pemilih tanggal**
- Laporan "Dari / Sampai Tanggal" tidak bisa dipilih: sama seperti Absensi Harian sebelumnya, `[color-scheme:dark]` di-hardcode sehingga ikon kalender tidak terlihat di light mode.
- Komponen bersama baru `components/date-input.tsx`:
  - `DateInput`: ikon kalender sendiri yang selalu terlihat, klik di mana pun pada field membuka kalender, dan `color-scheme` mengikuti tema;
  - `openDatePicker()`: membuka kalender dengan fallback untuk browser lama.
- Dipakai di Laporan (2 field) dan Tanggal Bergabung karyawan. Absensi Harian memakai `openDatePicker()` yang sama.
- Verifikasi: `tsc` + `eslint` lolos.

---

## 2026-10-20 — README diperbarui

- `README.md` ditulis ulang agar lebih profesional dan lengkap:
  - badge stack, daftar isi, dan tabel ruang lingkup (termasuk / tidak termasuk);
  - fitur per menu, tabel teknologi, diagram arsitektur, dan relasi + tabel skema database;
  - langkah setup dengan urutan 5 migrasi + seed demo;
  - tabel variabel lingkungan, struktur direktori, script, keamanan, dan deploy.
- Klaim di README dicek ke kode: TypeScript strict, HMAC proposal AI, redirect `/login` di proxy, tampilan 4 karakter terakhir API key.

---

## 2026-10-20 — Fix: absensi tanggal kemarin tidak bisa diisi

- Laporan user: absensi hari ini bisa diisi, tapi saat pindah ke tanggal kemarin tidak bisa.
- Penyebab:
  - Penempatan karyawan baru selalu dibuat dengan `valid_from = hari disimpan`.
  - Roster Absensi Harian (`getRoster`) hanya memuat karyawan yang penempatannya sudah berlaku pada tanggal itu.
  - Akibatnya karyawan yang baru ditambahkan tidak muncul di tanggal sebelumnya.
- Perbaikan (`lib/actions/settings.ts`):
  - Karyawan baru: penempatan pertama mulai dari **Tanggal Bergabung** (kosong = hari disimpan).
  - Edit karyawan: bila Tanggal Bergabung dimundurkan, penempatan pertama ikut mundur. Tidak pernah dimajukan, supaya absensi yang sudah tercatat tidak hilang dari roster.
- UI:
  - Field Tanggal Bergabung diberi hint "Absensi bisa diisi mulai tanggal ini".
  - `color-scheme` field itu mengikuti tema.
  - Pesan kosong di Absensi Harian (tanggal lampau) menjelaskan bahwa karyawan tampil mulai Tanggal Bergabung-nya.
- Data lama: migrasi `supabase/migrations/20261020040000_assignment_from_join_date.sql` memundurkan penempatan pertama ke `join_date` untuk karyawan yang sudah tersimpan. Belum dijalankan.
- Verifikasi: `tsc` + `eslint` lolos.

---

## 2026-10-20 — Kolom "Cabang Penempatan" di Manajemen Karyawan dirapikan

- Feedback user: isi kolom cabang (pill `DKT001A · Dakota Pusat`) jelek. Penyebabnya, pill berupa span inline, sehingga nama panjang patah ke baris baru dan border-nya terpotong.
- Kini blok 2 baris:
  - ikon gudang cyan;
  - **kode** (mono, tebal) di atas, dengan label "Nonaktif" bila cabangnya nonaktif;
  - di bawahnya nama · tipe fasilitas, terpotong rapi (`truncate`, teks lengkap di tooltip), lebar maks. 240px.
- "Belum ditempatkan" diberi ikon `location_off`.
- Verifikasi: `tsc` + `eslint` lolos. Tiruan sel dengan kelas yang sama dicek di Browser pane (nama panjang terpotong rapi); halaman asli butuh login.

---

## 2026-10-20 — Kode cabang & NIK karyawan bebas format

- Permintaan user: kode cabang dan kode karyawan tidak dibatasi format atau contoh isian; boleh diisi apa saja.
- Aturan baru: wajib diisi, maks. 30 karakter (`CODE_MAX` di `lib/labels.ts`), dan tetap unik. Isinya bebas (huruf besar/kecil, angka, simbol, spasi).
- Dihapus:
  - Validasi pola `3 huruf + 3 angka + 1 huruf` (form & server).
  - Validasi NIK `3–20 huruf/angka/strip`.
  - Paksaan huruf besar.
  - Hint "3 huruf + 3 angka + 1 huruf".
  - Placeholder contoh ("Cth: BDO030A", "Contoh: EXP-0109").
- Cek duplikat di form kini tidak membedakan huruf besar/kecil.
- Lookup cabang di tool AI (`cari_absensi`, `daftar_karyawan`) dibuat tidak peka huruf besar/kecil, supaya kode huruf kecil tetap ketemu.
- **Database**:
  - Migrasi baru `supabase/migrations/20261020030000_free_format_codes.sql` menghapus check pola `branch_code_check` dan menggantinya dengan check panjang 1–30 untuk `branch.code` & `employee.nik`.
  - **Wajib dijalankan** di SQL Editor; tanpa itu kode non-pola akan ditolak database.
- Verifikasi: `tsc` + `eslint` lolos.

---

## 2026-10-20 — Pemisah judul tab browser pakai "|"

- Permintaan user: judul tab tidak pakai em dash ("Dashboard — Absensi Ekspedisi"), tapi `|`.
- Root layout kini memakai template judul `{ template: "%s | Absensi Ekspedisi", default: "Absensi Ekspedisi" }`. Ke-11 halaman (Dashboard, Absensi ×4, Laporan, Pengaturan ×4, Login) cukup menulis namanya sendiri, jadi format pemisah diatur di satu tempat.
- Verifikasi: `tsc` lolos; tab login di Browser pane tampil "Masuk | Absensi Ekspedisi".

---

## 2026-10-20 — Favicon pakai ikon login

- Favicon default Next (`src/app/favicon.ico`) dihapus dan diganti `src/app/icon.svg`.
- Ikon baru = ikon Material Symbols `hub` dari logo di header halaman login, warna cyan `#00d2ff` di atas kotak membulat `#18202e` (warna kotak ikon login).
- Next otomatis memasang `<link rel="icon" type="image/svg+xml">` di semua halaman.
- Verifikasi: `/icon.svg` tersaji (200, `image/svg+xml`) dan dicek tampilannya di ukuran 64/32/16 px di Browser pane.

---

## 2026-10-20 — Dropdown cabang & pemilih tanggal Absensi Harian

- **Pemilih cabang (topbar)**: `<select>` native (dropdown biru bawaan browser) diganti menu sendiri di `components/shell/branch-switcher.tsx`:
  - panel sesuai tema;
  - tiap cabang menampilkan titik status (aktif/maintenance/nonaktif), kode · nama, dan tipe fasilitas;
  - cabang terpilih diberi tanda centang;
  - kolom cari muncul bila cabang lebih dari 6;
  - menu tertutup saat klik di luar atau tekan Esc;
  - spinner tampil selama berpindah cabang.
- **Tanggal di Absensi Harian**:
  - Penyebab: ikon kalender native tidak terlihat di light mode, karena `[color-scheme:dark]` di-hardcode.
  - Sekarang ada tombol ‹ hari sebelumnya, tombol kalender (membuka picker via `showPicker()`, begitu juga saat field diklik), tombol › hari berikutnya (nonaktif di hari ini), dan tombol "Hari ini" bila sedang melihat tanggal lain.
  - `color-scheme` mengikuti tema.
  - Helper baru `shiftDay()` di `lib/format.ts`.
- Verifikasi: `tsc` + `eslint` lolos. Tampilan asli belum dicek karena butuh login.

---

## 2026-10-20 — Fix: fokus form modal lompat balik ke field pertama

- Laporan user: saat mengetik nama di modal Tambah Cabang / Karyawan, kursor terus kembali ke field Kode/ID.
- Penyebab: `Modal` (`pengaturan/_components/ui.tsx`) punya efek `[open, onClose]` yang memfokus field pertama. Parent mengirim `onClose={() => setEditing(null)}` (fungsi baru tiap render), jadi setiap ketikan efek jalan ulang dan fokus pindah ke field pertama.
- Perbaikan: `onClose` dibungkus `useEffectEvent`, dan efek kini hanya bergantung pada `open`. Autofocus hanya terjadi sekali saat modal dibuka. Berlaku untuk semua modal Pengaturan (karyawan, cabang, jabatan).
- Verifikasi: `tsc` + `eslint` lolos. Modal asli belum dicoba langsung karena butuh login.

---

## 2026-10-20 — Strip "—" di breadcrumb dihapus

- Feedback user: di halaman Absensi & Pengaturan breadcrumb tampil "— > Absensi Harian" (muncul saat belum ada cabang aktif).
- Kode cabang di crumb dipindah ke komponen bersama `components/shell/branch-crumb.tsx` (`BranchCrumb`), menggantikan dua `BranchCode` kembar di `absensi-header.tsx` & `settings-header.tsx`. Bila belum ada cabang, isinya kosong (bukan "—").
- `PageHeader`: crumb + pemisah `>` kini satu span (`empty:hidden` + `after:content-['>']`), jadi crumb yang kosong hilang bersama pemisahnya. Dashboard tetap menampilkan "Semua Cabang".
- Verifikasi: `tsc`, `eslint`, `next build` lolos; perilaku span kosong/terisi dicek di Browser pane (halaman asli butuh login).

---

## 2026-10-20 — QC kode & database (v0.2) + repo GitHub

**Kode**
- `tsc`, `eslint`, dan `next build` bersih. Tidak ada `any`, `@ts-ignore`, atau `console.log` sisa. Dua `eslint-disable` yang ada sudah punya alasan.
- Dihapus karena tidak terpakai:
  - `statusLabel` (`lib/data/report.ts`) beserta import-nya.
  - 17 token warna `@theme` yang tidak dipakai di mana pun (`surface-sidebar`, `surface-hover`, `surface`, `surface-variant`, `surface-container-lowest/low/highest`, `border-dark/subtle/active`, `primary-fixed`, `error-container`, `status-*-bg`, `status-sick`, `status-absent`), plus `--spacing-gutter` dan `--text-headline-lg`.
- Kunci tema dipindah ke `lib/theme.ts` (`THEME_STORAGE_KEY`), dipakai skrip inline di layout dan `ThemeToggle`. Sebelumnya skrip inline menulis `"theme"` secara hardcode.

**Database**
- Semua tabel dipakai app: `job_role`, `cluster`, `employee`, `branch`, `employee_assignment`, `attendance_daily`, `audit_log`, `ai_connector`. Relasi FK sudah lengkap.
- Temuan:
  - View `v_rekap_bulanan` tidak dipakai; rekap dihitung di `lib/data/rekap.ts`.
  - 4 kolom FK belum punya index: `employee_assignment.job_role_id`, `attendance_daily.job_role_id`, `branch.cluster_id`, `branch.pic_employee_id`.
- Perbaikan ada di migrasi baru `supabase/migrations/20261020020000_qc_cleanup.sql`, yang **belum dijalankan** (dijalankan admin di SQL Editor). Isinya hanya menambah index dan menghapus view yang tidak terpakai; tidak ada data yang berubah.

**Repo**
- Project dijadikan repo git (branch `main`, commit awal). `.env.local` dan `.claude/` tidak ikut ter-commit. Di-push oleh user lewat VS Code ke `github.com/dena-pratama/absensi-karyawan` (branch `main`).

---

## 2026-10-20 — Tab bergaris bawah dirapikan

- Feedback user: tab aktif ("Absensi Harian") di light mode terlihat seperti kotak bercahaya, kurang rapi.
- Penyebab: `shadow-[0_1px_10px…]` dipasang di seluruh tab (bukan di garisnya), dan `border-b-2` menumpuk di atas garis pemisah nav.
- Perbaikan: helper `underlineTabClass()` di `components/shell/page-layout.tsx`, dipakai `UnderlineTabs` (Absensi) dan `SettingsTabs` (Pengaturan):
  - indikator 2px membulat (`::after`) duduk tepat di garis pemisah (`-bottom-px`);
  - glow tipis hanya di dark mode, tanpa glow di light mode;
  - tab non-aktif menampilkan garis tipis saat hover.
- Lanjutan (feedback: tab Pengaturan masih belum clean):
  - Indikator ternyata terpotong `overflow-x-auto`, jadi melayang di atas garis pemisah.
  - Garis pemisah kini digambar dengan inset shadow (`underlineTabsNavClass`, dipakai kedua nav), dan indikator di `bottom-0` menimpanya dengan rapi.
  - Badge jumlah di tab Pengaturan dibuat pill lembut tanpa border: aktif `cyan/15 + brand-ink`, lainnya `panel-raised`.
- Verifikasi: `tsc` + `eslint` lolos; tiruan tab dengan kelas yang sama dirender di Browser pane (light & dark) dan terlihat bersih. Halaman asli belum dicek karena butuh login.

---

## 2026-10-20 — Light Mode

**Perilaku**
- Tombol tema (ikon matahari/bulan) di **topbar** (semua halaman app, termasuk skeleton topbar) dan di header **login**.
- Default tetap **gelap** ("Cyber Operations Dark"); pilihan disimpan di `localStorage` (`theme`).
- Skrip inline di `<head>` root layout menerapkan tema sebelum paint pertama (tanpa kedip, tanpa hydration error), sesuai panduan Next `preventing-flash-before-hydration`. Halaman tetap Partial Prerender (tidak membaca cookie di layout).

**Implementasi**
- `src/app/theme.css` (baru): blok `[data-theme="light"]` menimpa token; blok `[data-theme="light"] [data-theme="dark"]` mengembalikan nilai gelap untuk elemen yang harus tetap gelap.
- Token tema baru di `globals.css`: `shell`, `panel`, `panel-raised`, `panel-inset`, `line`, `line-strong`, `ink` (teks judul), `brand` (cyan tetap), `brand-ink` (teks cyan, lebih gelap di light), `scrim`.
- ±50 warna hex hardcoded di komponen diganti token tersebut (kelompok berdasarkan tingkat kecerahan; di dark mode selisihnya ≤ 2–3 nilai hex, tidak terlihat). `text-white` → `text-ink`.
- Skala warna Tailwind (gray, slate, cyan, sky, emerald, amber, rose, red, pink, purple, indigo, teal, orange) **dibalik** di light mode (50↔950 … 400↔600, 500 tetap), jadi kelas seperti `text-gray-400`, `text-emerald-300`, `bg-rose-950/30` otomatis kontras di latar terang.
- Kartu cabang berwarna di Dashboard diberi `data-theme="dark"` supaya tampil sama di kedua tema.
- Varian Tailwind `light:` (`@custom-variant`) untuk ikon toggle. Ikon dibungkus `<span>` karena CSS Google Fonts menetapkan `display` pada `.material-symbols-outlined` sehingga `hidden` kalah.
- Knob switch di Pengaturan diberi `shadow-sm` agar terlihat di track terang.

**Verifikasi**
- `tsc`, `eslint`, `next build` lolos.
- Halaman login dicek di Browser pane: gelap → terang berhasil, tema bertahan setelah reload, ikon berganti.
- ⚠️ Halaman setelah login (Dashboard, Absensi, Laporan, Pengaturan, Smart AI) belum dicek visual di light mode karena pane tidak punya sesi login.

---

## 2026-10-20 — Smart AI Analytics (floating chat) + Konektor AI

**Keputusan user**
- Multi-provider: **Claude (Anthropic), OpenAI, Google Gemini**.
- "MCP konektor" = **form koneksi model** di Pengaturan (bukan server MCP).
- API key disimpan **terenkripsi di tabel DB**.
- AI boleh **baca + ubah absensi**, tetapi setiap perubahan **wajib disetujui admin** dulu.

**Database** — migrasi baru `supabase/migrations/20261020010000_ai_connector.sql` (⚠️ perlu dijalankan user):
- Tabel `ai_connector` (provider unik, model, `api_key_ciphertext`, `api_key_last4`, `is_active` — maks 1 aktif, RLS authenticated).

**Keamanan**
- `AI_ENCRYPTION_KEY` (32 byte acak) ditambahkan otomatis ke `.env.local`; contoh di `.env.example`. **Jangan diganti** setelah ada key tersimpan (key lama tidak bisa didekripsi).
- API key dienkripsi AES-256-GCM di server (`lib/ai/crypto.ts`), tidak pernah dikirim ke browser (UI hanya melihat ••••4 digit terakhir).
- Usulan perubahan dari AI ditandatangani HMAC-SHA256 + kedaluwarsa 30 menit; server menolak token yang diubah.

**Pengaturan > Konektor AI** (`/pengaturan/ai`, tab baru)
- Kartu 3 provider (Aktif / Tersimpan / Belum diatur), form API key (kosong = pakai key tersimpan) + model (datalist dari hasil tes), tombol Tes Koneksi (memuat daftar model resmi provider), Simpan, Simpan & Aktifkan, Nonaktifkan, Hapus.
- Banner peringatan kalau tabel belum dimigrasi / `AI_ENCRYPTION_KEY` kosong.
- Default model Claude: `claude-opus-5-5`; OpenAI/Gemini: dipilih dari daftar model hasil tes.

**Engine AI** (`lib/ai/engine.ts`) — satu tool loop (maks 8 langkah) dengan SDK resmi tiap provider:
- `@anthropic-ai/sdk` 0.131.0 (Messages API + tool use, menangani `refusal` & `pause_turn`), `openai` 7.28.0 (Chat Completions + function tools), `@google/genai` 2.27.0 (generateContent + functionDeclarations).
- Error provider diterjemahkan (401/403 key ditolak, 404 model, 429 kuota, 5xx).

**Tools AI** (`lib/ai/tools.ts`) — memakai data layer yang sama dengan halaman:
- Baca: `daftar_cabang`, `ringkasan_kehadiran_harian`, `cari_absensi` (rentang tanggal, cabang, NIK, status; maks 150 baris detail), `daftar_karyawan`.
- Tulis (via approval): `usulkan_perubahan_absensi` → kartu usulan; disimpan hanya lewat `approveProposal()` yang memanggil `saveAttendance` (validasi roster & tanggal yang sama dengan Absensi Harian).

**Floating chat** (`components/ai/smart-ai-chat.tsx`, dipasang di layout `(app)` → muncul di semua halaman)
- Tombol "Smart AI" kanan bawah, panel 440px (layar penuh di mobile), saran pertanyaan, jawaban markdown (tabel via `react-markdown` + `remark-gfm`), indikator "Menganalisis…".
- Kartu usulan: tabel karyawan *sebelum → sesudah* + keterangan, tombol **Tolak** / **Setujui & Simpan**; status usulan ikut dikirim ke AI di pesan berikutnya.
- Riwayat chat disimpan di `sessionStorage` (hilang saat tab ditutup), maks 20 giliran dikirim ke AI.

**Verifikasi**
- `npm run lint` ✅, `tsc` ✅, `npm run build` ✅.
- Uji unit enkripsi & tanda tangan (roundtrip, ciphertext tidak memuat key, token diubah ditolak, ciphertext diubah terdeteksi) ✅.
- ⏳ Belum dites ke provider sungguhan (butuh API key user, biaya ditagih ke akun user) dan belum dicek di browser dengan sesi login.

---

## 2026-10-20 — Fix: error "new Date() while prerendering" di /laporan

- Penyebab: `parseReportFilters()` memanggil `todayWIB()` (`new Date()`) untuk default tanggal **sebelum** ada query Supabase. Dengan Cache Components + Partial Prefetching, kode sebelum data request-time ikut di-prerender, dan `new Date()` di situ dilarang.
- Halaman lain tidak kena karena `createClient()` sudah memanggil `await connection()` sebelum `todayWIB()` dipakai.
- Perbaikan: `await connection()` di awal `Content` halaman `/laporan` (setelah `await searchParams`).
- Aturan untuk halaman berikutnya: **jangan panggil `todayWIB()`/`new Date()` sebelum query Supabase atau `await connection()`.**
- `npm run lint` ✅, `npm run build` ✅.

---

## 2026-10-20 — Halaman Laporan Absensi (CSV & PDF)

**Navigasi**: ikon baru **Laporan Absensi** di sidebar, tepat di bawah menu Absensi & Karyawan → `/laporan`.

**Filter** (`?cabang=&karyawan=&dari=&sampai=&status=`)
- Cabang (semua / satu cabang; = cabang tempat absensi dicatat), Karyawan (semua / satu; daftar mengikuti cabang penempatan saat ini), Dari–Sampai tanggal (default awal bulan s/d hari ini, maks 366 hari, tidak bisa melewati hari ini, otomatis ditukar bila terbalik), Status (opsional).
- Logika filter bersama halaman & export: `lib/report-filters.ts`. Data: `lib/data/report.ts` (paginasi 1.000 baris/request supaya data besar tidak terpotong).

**Pratinjau di halaman**: 5 kartu ringkasan (karyawan, total data, hadir/sakit/tidak hadir + %), tabel Rekap per Karyawan, tabel Detail Harian (50 baris pertama).

**Export**
- `GET /laporan/export/csv?…&jenis=detail` — satu baris per absensi (tanggal, cabang, NIK, nama, jabatan, status, keterangan).
- `GET /laporan/export/csv?…&jenis=rekap` — satu baris per karyawan (H, S, TH, total, % hadir).
- `GET /laporan/export/pdf?…` — `@react-pdf/renderer` 4.9.0, A4 landscape, palet cetak (putih + aksen cyan gelap): header + kotak meta (cabang, karyawan, status, waktu cetak), 5 kartu ringkasan, tabel rekap per karyawan (zebra), detail harian **dikelompokkan per tanggal** (subjudul + jumlah H/S/TH per hari, badge status berwarna), footer di tiap halaman ("Halaman X dari Y").
- CSV memakai UTF-8 BOM. Nama file: `laporan-absensi_<kode-cabang|semua-cabang>_<dari>_<sampai>[_jenis].csv|pdf`.

**Verifikasi**
- `npm run lint` ✅, `tsc` ✅, `npm run build` ✅.
- PDF contoh dirender di luar app dengan data dummy (8 karyawan × 12 hari, 6 halaman) dan diperiksa visual via pdf.js ✅. (File sementara di `public/` dan pengecualian `.pdf` di proxy sudah dihapus lagi.)
- ⏳ Halaman `/laporan` & unduhan dari app belum dites dengan sesi login (pane browser kehilangan sesi; data absensi di Supabase juga masih kosong).

---

## 2026-10-20 — Menu Pengaturan: Karyawan, Cabang, Jabatan

Acuan: `pengaturan_karyawan_cabang_dan_role`, `pengaturan_manajemen_cabang_hub`, `pengaturan_master_role_hak_akses`, `modal_floating_tambah_*`.

**Keputusan user**
- Status cabang: **toggle Aktif/Nonaktif saja** (status `maintenance` lama tetap dipertahankan selama cabang tetap aktif).
- **Simpan sekaligus**: perubahan ditampung sebagai draf (badge "Baru"/"Diubah"), lalu disimpan lewat bar bawah **Terapkan Pengaturan** / **Reset Perubahan**. Ada konfirmasi saat pindah tab atau tutup halaman bila masih ada draf.
- **Mutasi = riwayat**: ganti cabang/jabatan menutup penempatan lama (`valid_to` = kemarin) dan membuat penempatan baru mulai hari ini. Penempatan yang dibuat hari ini cukup diperbarui.
- Master Role → **daftar jabatan** (tanpa matriks RBAC).

**Halaman**
- Header bersama + 3 tab dengan badge jumlah: Manajemen Karyawan `/pengaturan` · Manajemen Cabang / Hub `/pengaturan/cabang` · Master Jabatan `/pengaturan/jabatan`.
- **Karyawan**: 3 stat card (staf, cabang, jabatan), filter cari/status/hub, tabel (NIK/nama/jabatan, cabang penempatan, kontrak, No. WA, toggle aktif, edit), pagination 10, panel samping mini-cabang & distribusi jabatan, modal tambah/edit (NIK, nama, jabatan, cabang, WA +62, tgl bergabung, kontrak, aktif).
- **Cabang**: filter cari/tipe/wilayah/status, Ekspor CSV, tabel (kode & nama, tipe & alamat, PIC + jabatan, jumlah staf, jam gate, toggle, edit), **Log Perubahan Terkini** dari `audit_log`, modal (kode, nama, tipe, cluster, PIC dari karyawan aktif, preset jam gate / jam sendiri, alamat, aktif).
- **Jabatan**: 3 stat card (jabatan aktif, staf terpetakan, jabatan terbanyak), tabel (kode, nama, bar jumlah staf, toggle, edit), modal tambah/edit.
- Server action: `lib/actions/settings.ts` (`applyEmployeeChanges`, `applyBranchChanges`, `applyRoleChanges`) dengan validasi + pesan error ramah (duplikat NIK/kode, format).
- Data: `lib/data/settings.ts`. Komponen: `pengaturan/_components/` (staged hook, modal, toggle, apply bar, tabs).

**Dikecualikan dari desain (bertentangan scope)**
- Tab "Pengaturan Presensi & Shift", kartu "Kebijakan Shift & SLA", panel parameter presensi & biometrik.
- Zona & Divisi, toggle Alert WA, Staf/Shift, radius geofence/GPS, matriks RBAC, insentif, Sync Cloud, Ekspor Skema, badge "Master Admin".

**Penyesuaian lain**
- "+ Tambah Entitas Baru" (modal dengan switch Karyawan/Cabang) → tombol kontekstual per halaman ("Tambah Karyawan" / "Tambah Cabang" / "Tambah Jabatan"), karena draf simpan-sekaligus per halaman.
- Kolom "Zona & Divisi" diganti **Cabang Penempatan**. Judul "& Manajemen Hak Akses" → "& Master Data". "Ekspor" cabang = CSV.
- `ComingSoon` placeholder dihapus (tidak terpakai).

**Verifikasi**
- `npm run lint` ✅, `npm run build` ✅.
- Browser: 3 halaman tampil; uji simpan sekaligus di Jabatan (nonaktifkan Line-Haul → Terapkan → aktifkan lagi → Terapkan) ✅, tercatat di Log Perubahan ✅; modal tambah cabang/karyawan terbuka & tertutup (tanpa simpan) ✅.
- ⏳ Tambah/edit karyawan & cabang ke DB belum dites (data cabang/karyawan di Supabase masih kosong).

---

## 2026-10-20 — Menu Absensi: Absensi Harian, Rekap Bulanan, Daftar Karyawan

Acuan: `form_update_absensi_harian/absensiharian.html`, `rekap_bulanan_hub_matriks_kalender/rekapbulanan.html`. Shell tetap mengikuti Dashboard.

**Navigasi**
- Sidebar: Dashboard → **Absensi & Karyawan** (satu ikon, di bawah Home) → Pengaturan → Keluar. Ikon "Daftar Karyawan" terpisah dihapus.
- 3 tab bergaris bawah (`UnderlineTabs`) di header: Daftar Karyawan `/absensi/karyawan` · Absensi Harian `/absensi` · Rekap Bulanan `/absensi/rekap`.
- Pencarian topbar → `/absensi/karyawan?q=`. Placeholder `/karyawan` dihapus.
- Sidebar dibungkus `<Suspense>` (wajib untuk `usePathname()` di rute dinamis).

**Absensi Harian** (`/absensi?tanggal=YYYY-MM-DD`)
- Ceklis per cabang aktif & tanggal: radio Hadir / Sakit / Tidak Hadir + keterangan singkat (input, maks 200).
- Chip ringkasan (Total/Hadir/Sakit/Tidak Hadir/Belum diisi), cari nama/NIK/role, filter role (dari tabel `job_role`), pilih tanggal (tidak bisa tanggal mendatang).
- Tombol Batal/Reset, Tandai Semua Hadir (baris yang terlihat), **Update Absen** → server action `saveAttendance` (hanya baris yang berubah; snapshot cabang & jabatan dari penempatan; `created_by` untuk baris baru, `updated_by` selalu).
- Peringatan saat pindah tanggal / tutup tab bila ada perubahan belum disimpan. Toast hasil simpan.
- Roster = penempatan yang berlaku pada tanggal itu (`valid_from ≤ tgl ≤ valid_to`).

**Rekap Bulanan** (`/absensi/rekap?bulan=YYYY-MM&role=`)
- Matriks tanggal 1–31: sel H / S / TH, "-" = belum diisi, "•" = hari mendatang; hari ini disorot cyan, Sabtu/Minggu diberi tint (tetap dihitung bila diisi).
- Kolom total H, S, TH, %; navigasi bulan (tidak bisa melewati bulan berjalan); kolom No/NIK/Nama sticky.
- **Export CSV** (`/absensi/rekap/export`, UTF-8 BOM agar terbaca Excel).

**Daftar Karyawan** (`/absensi/karyawan`) — sesuai permintaan user: summary card + detail + chart
- 4 summary card: Total staf (per kontrak), Hadir hari ini, Sakit/Tidak hadir hari ini, Rata-rata kehadiran bulan ini.
- Tabel: NIK, nama & jabatan, No. HP, status kontrak, % kehadiran bulan ini (bar), status hari ini, tombol Detail.
- **Detail** `/absensi/karyawan/[id]`: profil (cabang, kontrak, tgl bergabung), stat tile bulan ini (+ selisih vs bulan lalu), **chart kolom % kehadiran 6 bulan** (tooltip hover/fokus, tabel sr-only), bar komposisi Hadir/Sakit/TH, kalender bulan ini (kode status per hari), riwayat 8 absensi terakhir.

**Penyesuaian vs desain (scope)**
- Status Izin (I), Alfa (A), Off (L) → hanya **Hadir / Sakit / Tidak Hadir**; "Off" diganti "Belum diisi".
- Dihapus: "Kalkulasi Uang Makan & Insentif", badge "Contoh", foto profil (pakai inisial), "Otomatis tersinkronisasi ke Cloud Hub" (diganti status simpan nyata), divisi/zona, filter shift.
- Export Excel → CSV.
- % kehadiran bulanan = hadir ÷ hari yang sudah diisi (sama dengan view `v_rekap_bulanan`).

**Lainnya**
- `lib/supabase/server.ts`: `await connection()` setelah `cookies()` — memperbaiki error dev "Date.now() while prerendering" (Partial Prefetching ikut merender data sesi).
- Data layer baru: `lib/data/attendance.ts`, `rekap.ts`, `employee.ts`; helper bulan/tanggal di `lib/format.ts`.

**Verifikasi**
- `npm run lint` ✅, `npm run build` ✅.
- Browser (admin login di pane): 3 tab & sidebar tampil, state kosong tanpa error ✅.
- ⏳ Dengan data belum dites: query cabang mengembalikan 0 baris → `seed_demo.sql` tampaknya belum masuk.

---

## 2026-10-20 — App shell (topbar + sidebar) & halaman Dashboard

Acuan: `dashboard_absensi_cabang_outlet/dashboard.html`. Supabase sudah terhubung (`.env.local` diisi user); dicek via REST: tabel skema baru ada, `shift` tidak ada, RLS menutup akses anonim.

**App shell — acuan navigasi semua halaman berikutnya**
- `src/app/(app)/layout.tsx`: container rounded 36px + glow magenta/cyan/ungu, grid:
  - desktop: topbar (span 2) / page header (span 2) / sidebar 64px | konten
  - mobile: topbar / sidebar horizontal / page header / konten
- `components/shell/topbar.tsx`: brand "Absensi Ekspedisi | Data Hub", **pilihan cabang aktif** (cookie `active_branch`, dipakai semua halaman), pencarian staf (→ `/karyawan?q=`), profil admin (nama dari user_metadata/email + menu Keluar).
- `components/shell/sidebar.tsx`: Dashboard `/`, Absensi `/absensi`, Daftar Karyawan `/karyawan`, Pengaturan `/pengaturan`, Keluar. Ikon heroicons dari desain, state aktif cyan + titik.
- `components/shell/page-layout.tsx`: `PageHeader` (breadcrumb + judul + aksi), `PageTabs`, `PageBody`. **Setiap halaman baru wajib memakai ini.**
- `/absensi`, `/karyawan`, `/pengaturan` sementara "sedang dibangun" (`ComingSoon`) agar navigasi tidak 404. `(app)/error.tsx` untuk error data.

**Dashboard** (`src/app/(app)/page.tsx`, data: `lib/data/dashboard.ts`)
- Data Cabang: kartu gradien ungu/teal/magenta bergantian, carousel 3 kartu + tombol next; subjudul = tipe cabang; "Kehadiran: X% Hadir (h/total Staf)"; avatar inisial + "+N"; "Lihat Detail" = jadikan cabang aktif.
- Persentase Kehadiran Cabang (hari ini): rata-rata global + bar per cabang.
  - % = hadir ÷ jumlah staf aktif yang ditempatkan (yang belum diabsen dihitung tidak hadir).
  - Warna/badge: ≥95% cyan "Optimal", 85–94% amber "Perlu Perhatian", <85% rose "Kritis".
- Absensi Outlet Terkini: 6 staf cabang aktif (yang terakhir diabsen di atas), pill Hadir / Sakit / Tidak Hadir / **Belum Diabsen**, tombol Edit & "Lihat semua" → `/absensi`.
- Empty state & skeleton loading.

**Penyesuaian vs desain (scope)**
- Dihilangkan: tab "Monitoring SLA / KPI", ikon Notifikasi, toggle tema, ikon "Catatan & Laporan", pencarian resi.
- "Shift Pagi (Last-Mile & Sortir)" → tanggal hari ini; "Terakhir sync" → jam update absensi terakhir; jam check-in di pill status & status gabungan ("Hadir & Pickup") dihilangkan.
- "On-Duty" → "Hadir". "Real-Time" → "Hari Ini".
- Font: desain menyebut Plus Jakarta Sans tapi tidak dimuat; tetap **Inter** sesuai DESIGN.md.

**Data demo**: `supabase/seed_demo.sql` (opsional) — 6 cabang, 22 karyawan, absensi hari ini.

**Verifikasi**
- `npm run lint` ✅, `npm run build` ✅ (rute `/`, `/absensi`, `/karyawan`, `/pengaturan` = partial prerender).
- ⏳ Tampilan dashboard dengan sesi login belum dicek di browser (perlu admin login).

---

## 2026-10-20 — Scaffold project + halaman Login

**Scaffold**
- `create-next-app` → Next.js **16.4.2**, React 19.3, TypeScript, Tailwind CSS 4, ESLint, `src/` dir, App Router.
  - Default template: Cache Components + Partial Prefetching aktif.
  - Next 16: middleware sekarang bernama **`src/proxy.ts`**.
- Dependensi: `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.118.0, `server-only`.
- `next.config.ts`: `turbopack.root` di-set ke folder project (ada package-lock.json nyasar di `C:\Users\prata`).
- `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); `.gitignore` mengizinkan file ini.
- `.claude/launch.json` untuk dev server (port 3000). README diganti panduan setup.

**Design system** (`src/app/globals.css`)
- Token DESIGN.md dipindah ke `@theme` Tailwind 4: warna (surface, primary, status), spacing (`space-*`, `gutter`, `margin`), ukuran teks (`headline-*`, `body-*`, `label-*`, `caption`).
- Font Inter via `next/font`; ikon Material Symbols via Google Fonts (`display=block`). Komponen `src/components/icon.tsx`.

**Auth Supabase**
- `src/lib/supabase/server.ts`: client untuk server component / action.
- `src/lib/supabase/proxy.ts` + `src/proxy.ts`: refresh sesi tiap request; belum login → `/login`; sudah login & buka `/login` → `/`.
- "Ingat sesi perangkat": kalau tidak dicentang, cookie auth jadi session cookie (hilang saat browser ditutup).

**Halaman Login** (`src/app/login/`)
- Tampilan mengikuti `login_page` (header, card, glow, Sync Status, toggle lihat sandi, checkbox ingat sesi, CTA cyan, toast).
- Server action `login` (`signInWithPassword`) dengan pesan error Bahasa Indonesia, plus `logout`.
- Penyesuaian vs desain:
  - Field **Username → Email** (Supabase Auth pakai email).
  - **Dihilangkan** (tidak berfungsi / di luar scope): badge "Server Cloud Gateway Online • Latency 14ms", ID/EN, Support, "Lupa Password?", toast OTP WhatsApp.
- `/` sementara berupa placeholder "Login berhasil" + tombol Keluar, sampai Dashboard dibuat.

**Verifikasi**
- `npm run lint` ✅, `tsc --noEmit` ✅, `npm run build` ✅.
- Browser: `/` redirect ke `/login` ✅; tampilan desktop & mobile (375px, tanpa scroll horizontal) ✅; submit tanpa Supabase → toast error ✅.
- ⚠️ Login sungguhan **belum dites**: belum ada project Supabase / `.env.local`.

---

## 2026-10-20 — Skema DB versi sederhana

File: `supabase/migrations/20261020000000_init_schema.sql` (belum dijalankan di Supabase).

**Keputusan user**
- Semua yang bertentangan dengan scope (poin A) **dikecualikan, tidak dibuat**.
- Divisi & Zona Operasi → **dihapus dari UI** (tidak ada kolom di DB).
- PIC cabang → **pilih dari karyawan** (FK `pic_employee_id`; form UI jadi dropdown).
- Tipe cabang → **gabungan**: hub_utama, transit_center, sub_hub, drop_point, dc_sorting, gateway, sub_agent.
- Info cabang → **alamat saja** (deskripsi & kota di UI dihapus).

**Tabel yang dipakai**
- `job_role` (jabatan, tanpa insentif), `cluster`, `employee`, `branch`, `employee_assignment` (riwayat penempatan, tanpa shift), `attendance_daily` (status `hadir/sakit/tidak_hadir` + note), `audit_log` (diisi trigger otomatis untuk job_role/employee/branch).
- View `v_rekap_bulanan`: hadir, sakit, tidak_hadir, total_hari, persen_hadir.
- RLS: semua user `authenticated` akses penuh (hanya 1 akun admin); `audit_log` read-only.

**Dihapus dari skema awal**
- `shift`, `attendance_setting`, `holiday`, `app_permission`, `role_permission`, `attendance_change_log`, `attendance_document`, `attendance_period`.
- Kolom: `employee.email/auth_user_id/biometric_id/wa_alert_enabled`, `branch.shift_capacity/geofence_*`, `job_role.daily_incentive/is_field_role`, `attendance_daily.shift_id/check_in_at/check_out_at/is_late/late_minutes/source/incentive_amount/is_locked/locked_at`.
- `created_by/updated_by/changed_by` sekarang merujuk ke `auth.users` (admin), bukan `employee`.

**Penyesuaian UI yang mengikuti**
- Halaman Master Role → daftar jabatan saja (tanpa matriks RBAC).
- Login → email + password (tanpa OTP WA). Rekap bulanan → kolom H / S / TH / %.
- Disembunyikan: filter & info shift, toleransi telat, biometrik, geofence, Staf/Shift, tab SLA/KPI, kalkulasi insentif, menu Catatan & Laporan, notifikasi.

**Catatan setup**
- Matikan "Allow new users to sign up" di Supabase Auth; buat 1 user admin manual.

---

## 2026-10-20 — Analisis kecocokan UI ↔ Skema DB

Semua 10 halaman desain sudah dibaca dan dibandingkan dengan skema SQL dari user.
`login_page/DESIGN.md` dan `my_design_system/DESIGN.md` isinya identik.

**A. Skema & UI bertentangan dengan scope yang disepakati**
1. Status: form harian 3 (`hadir/sakit/tidak_hadir`); rekap bulanan 5 (H/S/I/A/Off); DB 6 (`hadir,sakit,izin,cuti,alfa,libur`). Scope = 3.
2. Login: scope 1 admin; DB punya `employee.email/auth_user_id` + RBAC; UI login pakai field `Username` (name=nik) + teks OTP WhatsApp.
3. Halaman "Master Role & Hak Akses" (matriks RBAC) + tabel `app_permission/role_permission`, padahal role = jabatan saja.
4. Shift, telat, check-in/out, toleransi, cut-off, biometrik, geofence ada di UI & DB, padahal scope tanpa shift/aturan.
5. Dokumen + approval, closing periode, kalkulasi insentif/uang makan: ada di DB/UI, di luar scope.

**B. Ada di UI, tidak ada di DB**
- Karyawan: "Divisi & Zona Operasi", status "Cuti/Sakit/Off Shift" (DB cuma `is_active`), sub-label role ("Sprinter Zone A").
- Cabang: PIC berupa teks bebas + no HP (DB: FK `pic_employee_id`), deskripsi/subjudul, kota/lokasi, tipe `gateway`/`sub_agent`/`outlet`.
- Dashboard: status gabungan ("Hadir & Pickup/In-Transit"), tab Monitoring SLA/KPI, cari resi.
- Rekap: tombol "Kalkulasi Uang Makan" (tidak ada kolom uang makan).
- Nav "Catatan & Laporan" & Notifikasi: tidak ada desain halaman maupun tabel.

**C. Ada di DB, tidak ada di UI**
- `biometric_id`, `join_date`, `holiday`, `attendance_period`, `attendance_change_log`, `attendance_document`, `incentive_amount`, `employee.email`.

**Status**
- ⏳ Menunggu keputusan user (sederhanakan skema atau tidak)

---

## 2026-10-20 — Inisialisasi & kesepakatan scope

**Tech stack**
- Frontend: Next.js (App Router, TypeScript, Tailwind CSS)
- Backend: Supabase (Auth, Postgres)

**Keputusan scope**
- Hanya **1 pengguna (admin/pengelola)** yang login. Karyawan tidak punya akun.
- Absensi dilakukan dengan **checklist harian** oleh admin, tanpa selfie, GPS, QR, shift, atau jam masuk/terlambat.
- Status absensi ada **3**: **Hadir**, **Sakit**, **Absen** (mengikuti desain).
- **"Role" = jabatan karyawan** (contoh: SPV, Sprinter, Warehouse), hanya label dan **bukan** role untuk login/hak akses.

**Aturan kerja**
- UI mengikuti desain dari user; skema DB mengikuti skema dari user.
- Kalau ada ketidaksesuaian antara UI dan DB → **konfirmasi ke user dulu** sebelum diputuskan.
- Setiap aktivitas develop dicatat di file ini.

**Design reference**
- Moodboard default: `DESIGN.md` → tema "Cyber Operations Dark"
  - Base `#0b0c10` / `#12141b`, aksen cyan `#00d2ff`
  - Status: Hadir `#10b981`, Sakit `#f59e0b`, Absen `#f43f5e`
  - Font Inter, app shell maks. 1240px, sidebar 72px
- Halaman desain (sumber: `Downloads/minimalist_attendance_web_app`):
  - login_page
  - dashboard_absensi_cabang_outlet
  - form_update_absensi_harian
  - rekap_bulanan_hub_matriks_kalender
  - daftar_karyawan_hub
  - pengaturan_karyawan_cabang_dan_role
  - pengaturan_manajemen_cabang_hub
  - pengaturan_master_role_hak_akses
  - modal_floating_tambah_cabang
  - modal_floating_tambah_entitas_karyawan_cabang

**Status**
- ⏳ Menunggu skema database dari user
- ⏳ Analisis kecocokan UI ↔ DB belum dilakukan
- ⏳ Belum ada kode
