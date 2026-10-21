/**
 * Login dengan username ATAU email.
 *
 * Supabase Auth hanya mengenal email untuk login kata sandi, jadi username
 * ("budi01") disimpan sebagai email internal "budi01@akun.denaprojects.web.id".
 * Email internal ini tidak pernah dipakai mengirim surat dan tidak perlu diketik.
 *
 * PENTING: jangan ubah LOGIN_EMAIL_DOMAIN setelah ada akun dibuat — akun lama
 * tidak akan bisa login. App mobile memakai konstanta yang SAMA (salin file ini).
 */
export const LOGIN_EMAIL_DOMAIN = "akun.denaprojects.web.id";

/** Username: huruf, angka, titik, strip, garis bawah; 3–30 karakter; tidak peka huruf besar/kecil. */
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export const USERNAME_HINT = "3–30 karakter: huruf, angka, titik (.), strip (-), garis bawah (_). Tanpa spasi.";

/** Kata sandi minimal 6 karakter, bebas huruf / angka / simbol. */
export const PASSWORD_MIN = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ubah isian login (username atau email) menjadi email untuk Supabase; null = format tidak valid. */
export function toLoginEmail(identifier: string): string | null {
  const v = identifier.trim().toLowerCase();
  if (v.includes("@")) return EMAIL_RE.test(v) ? v : null;
  return USERNAME_RE.test(v) ? `${v}@${LOGIN_EMAIL_DOMAIN}` : null;
}

/** Tampilan akun: email internal → username, email biasa tetap email. */
export function displayLogin(email: string): string {
  const suffix = `@${LOGIN_EMAIL_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

/** Saran username dari NIK karyawan (huruf kecil, karakter tidak valid dibuang). */
export function usernameFromNik(nik: string): string {
  return nik.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "").slice(0, 30);
}
