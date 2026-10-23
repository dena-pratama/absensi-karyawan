# Absensi Ekspedisi

Aplikasi web absensi harian karyawan untuk jaringan ekspedisi (hub, cabang, dan outlet).
Admin mencentang kehadiran setiap karyawan per hari — **Hadir**, **Sakit**, atau
**Tidak Hadir** — lalu memantau ringkasan, rekap bulanan, dan menarik laporan.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase&logoColor=white)
![Versi](https://img.shields.io/badge/versi-0.2-00d2ff)

> Riwayat pengembangan dan keputusan desain tercatat lengkap di [DEVLOG.md](DEVLOG.md).

---

## Daftar Isi

- [Ruang Lingkup](#ruang-lingkup)
- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Arsitektur](#arsitektur)
- [Skema Database](#skema-database)
- [Memulai](#memulai)
- [Variabel Lingkungan](#variabel-lingkungan)
- [Struktur Direktori](#struktur-direktori)
- [Script](#script)
- [Keamanan](#keamanan)
- [Deploy](#deploy)

---

## Ruang Lingkup

Aplikasi ini sengaja dibuat **sederhana**:

| Termasuk | Tidak termasuk |
| --- | --- |
| Admin mengelola semua data lewat panel web | Login karyawan untuk mengubah data di web |
| Ceklis harian: Hadir / Sakit / Tidak Hadir + keterangan | Jam masuk, shift, keterlambatan |
| Role akun: Admin, SPV Cabang, Karyawan (RLS per role); SPV & karyawan hanya-lihat di web | Mengubah aturan RLS dari UI (lewat migrasi SQL) |
| "Jabatan" = label karyawan (bukan hak akses) | |
| Riwayat penempatan (mutasi cabang / ganti jabatan) | Selfie, GPS / geofence, biometrik |
| Rekap bulanan & laporan CSV / PDF | Approval, closing periode, insentif |

## Fitur

### Dashboard
- Ringkasan kehadiran hari ini (hadir, sakit, tidak hadir, belum diabsen).
- Carousel kartu cabang dengan persentase kehadiran per cabang.

### Absensi & Karyawan
- **Absensi Harian** — tabel ceklis per cabang aktif:
  - pencarian, filter jabatan, dan tombol *Tandai semua hadir*;
  - pemilih tanggal dengan kalender, tombol hari sebelumnya / berikutnya, dan *Hari ini*;
  - tanggal yang akan datang tidak bisa diisi;
  - hanya baris yang berubah yang dikirim ke server.
- **Daftar Karyawan** — daftar personil cabang, dengan halaman detail berisi biodata, penempatan, dan grafik tren kehadiran.
- **Rekap Bulanan** — matriks tanggal × karyawan per bulan, bisa difilter jabatan dan diekspor ke CSV.

### Laporan
- **Laporan Kehadiran**: filter rentang tanggal, cabang, karyawan, dan status. Pratinjau di layar, lalu unduh **CSV** atau **PDF** (`@react-pdf/renderer`).
- **Laporan Kasbon**: rekap per karyawan & detail kasbon per periode gajian, cabang, dan status, dengan unduhan **CSV**.

### Kasbon (`/kasbon`)
- Semua role: lihat plafon (gaji pokok ÷ pembagi × HK Hadir di periode gajian), ajukan kasbon, dan riwayat miliknya.
- Admin: setujui / tolak, cairkan dengan unggah bukti foto (bucket privat `kasbon-proof`), tandai lunas.
- **Pengaturan Kasbon** (admin): gaji pokok per jabatan & per karyawan, pembagi harian, tanggal cut-off gajian.
- Pelunasan lewat potong gaji: kasbon yang dicairkan otomatis dianggap lunas setelah periodenya lewat.

### Pengaturan & Master Data
- **Manajemen Karyawan**:
  - biodata, kontrak (tetap / PKWT / mitra), No. WhatsApp, tanggal bergabung;
  - penempatan cabang & jabatan.
- **Manajemen Cabang**:
  - kode, tipe fasilitas, cluster wilayah, PIC;
  - jam gate atau 24 jam, alamat, status;
  - **area GPS absen**: titik koordinat (tempel dari Google Maps / lokasi saat ini) + radius, dengan pratinjau peta.
- **Master Jabatan** — daftar jabatan dan status aktifnya.
- **Pengguna & Akses**:
  - tambah akun login (**username** atau email + kata sandi awal min. 6 karakter), dengan pencarian, filter role, dan paginasi;
  - atur role (Admin / SPV Cabang / Karyawan / Tanpa Akses) beserta cakupannya: cabang untuk SPV, data karyawan untuk karyawan;
  - tabel ringkasan aturan RLS per role.
- Perubahan ditampung sebagai **draf** dan baru disimpan saat klik *Terapkan Pengaturan*.
- Panel **Log Perubahan Terkini**, diisi otomatis oleh trigger database.

### Smart AI Analytics
- Asisten chat yang menjawab pertanyaan tentang data absensi, memakai *tool calling* atas data aplikasi:
  - `daftar_cabang`;
  - `ringkasan_kehadiran_harian`;
  - `cari_absensi`;
  - `daftar_karyawan`;
  - `usulkan_perubahan_absensi`.
- Provider bisa dipilih: **Anthropic (Claude)**, **OpenAI**, atau **Google Gemini**. Dikonfigurasi di *Pengaturan → Konektor AI*.
- AI **tidak pernah mengubah data sendiri**. Usulan perubahan absensi ditandatangani (HMAC) dan baru dijalankan setelah admin menyetujuinya.

### Tampilan
- Desain **Cyber Operations Dark** dengan **Light Mode**. Pilihan tema disimpan di browser dan diterapkan tanpa kedip saat halaman dimuat.
- Responsif untuk desktop dan mobile.

## Teknologi

| Lapisan | Teknologi |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack, Cache Components / Partial Prerendering) |
| UI | React 19, Tailwind CSS 4, Material Symbols, font Inter |
| Backend | Server Components + Server Actions + Route Handlers |
| Database & Auth | [Supabase](https://supabase.com) — PostgreSQL, Row Level Security, Supabase Auth (`@supabase/ssr`) |
| Laporan | `@react-pdf/renderer` (PDF), CSV native |
| AI | `@anthropic-ai/sdk`, `openai`, `@google/genai`, `react-markdown` |
| Kualitas | TypeScript (strict), ESLint (`eslint-config-next`) |

## Arsitektur

```
Browser ──► proxy.ts (refresh sesi, redirect ke /login bila belum masuk)
              │
              ▼
        App Router (src/app)
        ├─ Server Components ──► src/lib/data/*     (query baca, server-only)
        ├─ Server Actions    ──► src/lib/actions/*  (validasi + tulis data)
        └─ Route Handlers    ──► ekspor CSV / PDF
              │
              ▼
        Supabase (PostgreSQL + RLS)  ◄── hanya user "authenticated"
```

- **Data dibaca di server.** Bagian halaman yang bergantung pada request dibungkus `<Suspense>`, jadi kerangka halaman tampil instan (Partial Prerendering) dan datanya menyusul lewat streaming.
- **Semua penulisan lewat Server Action**, dengan validasi ulang di server. Client tidak pernah menulis langsung ke database.
- **Cabang aktif** dipilih lewat pemilih cabang di topbar dan dipakai bersama oleh Absensi, Rekap, dan Pengaturan.
- **AI berjalan di server.** API key disimpan terenkripsi (AES-256-GCM) dan hanya didekripsi di server, tidak pernah dikirim ke browser.

## Skema Database

```
job_role ◄─┐                    ┌─► branch ──► cluster
           │                    │      │
     employee_assignment ───────┘      └─► employee (PIC)
           │   (riwayat penempatan: valid_from / valid_to)
           ▼
       employee ◄── attendance_daily ──► branch, job_role (snapshot per tanggal)

audit_log     ← diisi trigger untuk job_role, employee, branch
ai_connector  ← konfigurasi provider AI (API key terenkripsi)
app_user      ← role akun login (admin / spv / karyawan) → auth.users
```

| Tabel | Fungsi |
| --- | --- |
| `employee` | Biodata karyawan (NIK unik, kontrak, WhatsApp, tanggal bergabung, status aktif). |
| `branch` | Cabang / hub / outlet: kode unik, tipe fasilitas, cluster, PIC, jam gate, status. |
| `job_role` | Master jabatan (label). |
| `cluster` | Wilayah layanan cabang. |
| `employee_assignment` | Riwayat penempatan karyawan ke cabang & jabatan. Maksimal satu penempatan aktif per karyawan, dan penempatan pertama dimulai dari tanggal bergabung. |
| `attendance_daily` | Satu baris per karyawan per tanggal (`unique (employee_id, attendance_date)`), menyimpan snapshot cabang & jabatan saat itu. |
| `audit_log` | Log perubahan master data, ditulis otomatis oleh trigger. |
| `ai_connector` | Satu baris per provider AI, maksimal satu yang aktif. |
| `app_user` | Role tiap akun login: admin, spv (+ cabang), atau karyawan (+ data karyawan). Akun tanpa baris ini tidak bisa membaca data. |

Semua tabel memakai **Row Level Security berbasis role**:
- **Admin**: akses penuh.
- **SPV**: baca data cabangnya, dan isi absensi cabangnya s/d hari ini.
- **Karyawan**: baca data dirinya, dan isi absensinya hari ini.

Aturan ini dijaga langsung oleh database, jadi berlaku juga untuk aplikasi mobile.

## Memulai

### Prasyarat
- Node.js 20 atau lebih baru, dan npm.
- Project [Supabase](https://supabase.com) (paket Free sudah cukup).

### 1. Siapkan database
Jalankan file berikut **berurutan** di **Supabase → SQL Editor**:

| # | File | Keterangan |
| --- | --- | --- |
| 1 | `supabase/migrations/20261020000000_init_schema.sql` | Skema utama, RLS, trigger, dan data awal (jabatan & cluster). |
| 2 | `supabase/migrations/20261020010000_ai_connector.sql` | Tabel konektor AI. |
| 3 | `supabase/migrations/20261020020000_qc_cleanup.sql` | Index foreign key, dan hapus view yang tidak dipakai. |
| 4 | `supabase/migrations/20261020030000_free_format_codes.sql` | Kode cabang & NIK bebas format (maks. 30 karakter). |
| 5 | `supabase/migrations/20261020040000_assignment_from_join_date.sql` | Penempatan pertama dimulai dari tanggal bergabung. |
| 6 | `supabase/migrations/20261021000000_role_based_rls.sql` | Role akun (admin / SPV / karyawan) + RLS per role. Akun yang sudah ada otomatis jadi admin. |
| 7 | `supabase/migrations/20261021010000_branch_geofence.sql` | Area GPS absen per cabang (titik + radius) untuk app mobile. |
| 8 | `supabase/migrations/20261021020000_attendance_check_in_out.sql` | Check in / check out dari app mobile (GPS + selfie, foto privat). |
| 9 | `supabase/migrations/20261022000000_backup_and_multi_branch_spv.sql` | Backup karyawan antar cabang, SPV banyak cabang, check in di cabang backup. |
| 10 | `supabase/migrations/20261022010000_branch_visibility_fix.sql` | Karyawan hanya melihat cabangnya; pilihan cabang tujuan backup lewat fungsi khusus SPV/admin. |
| 11 | `supabase/migrations/20261024000000_spv_attendance.sql` | SPV ikut absen di app dengan memilih outlet; outlet check out dicatat. |
| 12 | `supabase/migrations/20261025000000_kasbon.sql` | Kasbon: gaji pokok per jabatan / karyawan, pembagi & cut-off gajian, pengajuan → persetujuan → pencairan dengan bukti foto (bucket `kasbon-proof`). |
| — | `supabase/seed_demo.sql` | *Opsional* — data demo (cabang & karyawan fiktif). |

> **Instalasi baru:** jalankan migrasi #6 **setelah** membuat akun admin pertama (langkah 2), atau jalankan ulang file itu setelahnya. Selama tabel `app_user` masih kosong, akun yang sudah ada otomatis dijadikan admin.

### 2. Siapkan akun admin
1. **Authentication → Sign In / Providers** → matikan *Allow new users to sign up*.
2. **Authentication → Users** → buat user admin pertama (email + password). Akun berikutnya bisa dibuat dari **Pengaturan → Pengguna & Akses**.

### 3. Konfigurasi environment
```bash
cp .env.example .env.local
```
Isi nilainya sesuai [Variabel Lingkungan](#variabel-lingkungan).

### 4. Jalankan
```bash
npm install
npm run dev
```
Buka <http://localhost:3000>. Kamu akan diarahkan ke `/login`; masuk dengan akun admin.

## Variabel Lingkungan

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Ya | URL project, dari **Project Settings → API Keys**. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Ya | Publishable key (`sb_publishable_…`) atau legacy anon key. |
| `AI_ENCRYPTION_KEY` | Untuk fitur AI | Kunci 32 byte (base64) untuk mengenkripsi API key provider AI. |
| `SUPABASE_SECRET_KEY` | Opsional | Secret key (`sb_secret_…`) dari **Project Settings → API Keys**. Hanya untuk tombol *Tambah Akun*; dibaca di server saja. |

Membuat `AI_ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Penting:**
> - Jangan mengganti `AI_ENCRYPTION_KEY` setelah API key AI tersimpan, karena key yang sudah tersimpan tidak bisa didekripsi lagi.
> - `SUPABASE_SECRET_KEY` melewati RLS. Isi hanya di `.env.local` / Environment Variables Vercel, jangan diberi awalan `NEXT_PUBLIC_`, dan jangan di-commit. Tanpa key ini aplikasi tetap jalan, hanya tombol *Tambah Akun* yang nonaktif.

## Struktur Direktori

```
.
├── src/
│   ├── app/
│   │   ├── (app)/                  # Halaman setelah login (memakai AppShell)
│   │   │   ├── page.tsx            # Dashboard
│   │   │   ├── absensi/            # Absensi Harian, Daftar Karyawan, Rekap Bulanan (+ ekspor CSV)
│   │   │   ├── laporan/            # Laporan + ekspor CSV / PDF
│   │   │   ├── pengaturan/         # Karyawan, Cabang, Jabatan, Konektor AI
│   │   │   └── layout.tsx          # Grid AppShell: topbar, sidebar, konten
│   │   ├── login/                  # Halaman & action login
│   │   ├── layout.tsx              # Root layout, metadata, skrip tema
│   │   ├── globals.css             # Token desain (Tailwind @theme)
│   │   ├── theme.css               # Override token untuk Light Mode
│   │   └── icon.svg                # Favicon
│   ├── components/
│   │   ├── shell/                  # Topbar, sidebar, pemilih cabang, toggle tema, layout halaman
│   │   ├── ai/                     # Panel chat Smart AI
│   │   └── icon.tsx                # Wrapper Material Symbols
│   ├── lib/
│   │   ├── data/                   # Query baca (server-only)
│   │   ├── actions/                # Server Actions (absensi, pengaturan, cabang, AI)
│   │   ├── ai/                     # Engine, provider, tools, enkripsi, proposal
│   │   ├── supabase/               # Client Supabase (server & proxy)
│   │   ├── format.ts               # Utilitas tanggal / format (zona WIB)
│   │   ├── labels.ts               # Label & konstanta domain
│   │   └── theme.ts                # Kunci penyimpanan tema
│   └── proxy.ts                    # Proteksi rute & refresh sesi (pengganti middleware)
├── supabase/
│   ├── migrations/                 # Skema & migrasi SQL (jalankan berurutan)
│   └── seed_demo.sql               # Data demo opsional
├── DEVLOG.md                       # Catatan pengembangan
└── .env.example                    # Contoh konfigurasi environment
```

## Script

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server development (Turbopack) di `localhost:3000`. |
| `npm run build` | Build produksi. |
| `npm run start` | Menjalankan hasil build. |
| `npm run lint` | Pemeriksaan ESLint. |
| `npx tsc --noEmit` | Pemeriksaan tipe TypeScript. |

## Keamanan

- **Akses per role.**
  - Pendaftaran publik dimatikan; akun hanya dibuat oleh admin.
  - RLS membatasi data per role, dan akun tanpa role tidak bisa membaca apa pun.
  - Panel web: SPV & karyawan hanya-lihat (Dashboard & Absensi), dan semua Server Action tulis mengecek admin.
  - Minimal selalu ada satu admin (dijaga trigger).
- **Rute terlindungi.** `src/proxy.ts` mengarahkan pengguna yang belum login ke `/login`.
- **Validasi ganda.** Semua input divalidasi di form dan divalidasi ulang di Server Action.
- **Rahasia aman.**
  - API key AI dienkripsi AES-256-GCM sebelum disimpan, dan hanya 4 karakter terakhirnya yang ditampilkan.
  - `.env.local` tidak pernah di-commit (lihat `.gitignore`).
- **AI dengan persetujuan.** Perubahan data yang diusulkan AI harus disetujui admin terlebih dahulu.
- **Jejak audit.** Perubahan master data tercatat otomatis di `audit_log`.

## Deploy

Aplikasi bisa di-deploy ke platform yang mendukung Next.js 16, misalnya [Vercel](https://vercel.com):

1. Import repository ini.
2. Isi variabel lingkungan seperti pada `.env.local`.
3. Di Supabase **Authentication → URL Configuration**, tambahkan domain produksi.
4. Deploy.

---

© 2026 Absensi Ekspedisi · Dikembangkan oleh Dena Pratama.
