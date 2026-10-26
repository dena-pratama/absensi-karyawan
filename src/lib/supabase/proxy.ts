import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isSupabaseConfigured,
  REMEMBER_COOKIE,
  SUPABASE_KEY,
  SUPABASE_URL,
  withRememberPolicy,
} from "./config";

const PUBLIC_PATHS = ["/login"];
/** Halaman untuk akun login yang belum diberi role. */
const DENIED_PATH = "/akses-ditolak";
/** Halaman yang boleh dibuka SPV / karyawan (hanya-lihat, kecuali ajukan kasbon miliknya). */
const VIEWER_PATHS = ["/", "/absensi", "/kasbon", "/notifikasi", "/libur"]; // /notifikasi & /libur: halaman menolak SPV & karyawan
/** Sub-halaman khusus admin di dalam VIEWER_PATHS. */
const ADMIN_ONLY_PATHS = ["/kasbon/pengaturan", "/libur/pengaturan"];

/** Refresh sesi Supabase di setiap request + redirect sesuai status login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!isSupabaseConfigured) {
    // Belum ada .env.local: anggap belum login (form login akan menampilkan error).
    return isPublic ? response : redirectTo("/login");
  }

  const remember = request.cookies.get(REMEMBER_COOKIE)?.value !== "0";

  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, withRememberPolicy(value, options, remember)),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Jangan taruh kode apa pun di antara createServerClient dan getClaims().
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  const isDenied = pathname === DENIED_PATH;
  if (!isLoggedIn) return isPublic ? response : redirectTo("/login");
  if (isPublic) return redirectTo("/");

  // Admin: semua halaman. SPV / Office / karyawan: hanya-lihat Dashboard + Absensi, plus Kasbon & Notifikasi.
  // Akun tanpa role → halaman penjelasan. Gagal membaca role (error apa pun) = TANPA akses (fail closed),
  // bukan admin: dulu dianggap admin selama migrasi RLS belum dijalankan, sekarang RLS sudah aktif.
  const { data: role, error } = await supabase.rpc("current_app_role");
  const access = error ? "none" : role === "admin" ? "admin" : role === "spv" || role === "office" || role === "karyawan" ? "viewer" : "none";

  if (access === "none") return isDenied ? response : redirectTo(DENIED_PATH);
  if (isDenied) return redirectTo("/");
  const under = (p: string) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`));
  if (access === "viewer" && (!VIEWER_PATHS.some(under) || ADMIN_ONLY_PATHS.some(under))) {
    return redirectTo("/");
  }

  return response;
}
