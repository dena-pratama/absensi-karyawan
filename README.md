# Absensi Ekspedisi

Web app absensi harian sederhana (1 admin, checklist Hadir / Sakit / Tidak Hadir).
Stack: Next.js 16 (App Router) + Tailwind CSS 4 + Supabase.

Riwayat pengembangan & keputusan: lihat [DEVLOG.md](DEVLOG.md).

## Setup

1. Buat project di [Supabase](https://supabase.com), lalu jalankan
   `supabase/migrations/20261020000000_init_schema.sql` di **SQL Editor**.
2. Di **Authentication → Sign In / Providers**, matikan *Allow new users to sign up*.
3. Di **Authentication → Users**, buat 1 user admin (email + password).
4. Salin `.env.example` menjadi `.env.local`, isi URL & publishable key dari
   **Project Settings → API Keys**.
5. Jalankan:

```bash
npm install
npm run dev
```

Buka http://localhost:3000 → otomatis diarahkan ke `/login`.
