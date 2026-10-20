import { Suspense } from "react";
import { SmartAiChat } from "@/components/ai/smart-ai-chat";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar, TopbarFallback } from "@/components/shell/topbar";
import { getMyAccess } from "@/lib/data/access";

/** Menu sidebar mengikuti role: SPV / karyawan hanya Dashboard & Absensi. */
async function RoleSidebar({ className }: { className: string }) {
  const { role } = await getMyAccess();
  return <Sidebar className={className} readOnly={role !== "admin"} />;
}

/** Smart AI bisa mengusulkan perubahan data → khusus admin. */
async function AdminAiChat() {
  const { role } = await getMyAccess();
  return role === "admin" ? <SmartAiChat /> : null;
}

/**
 * App shell untuk semua halaman setelah login.
 * Topbar & sidebar di sini supaya konsisten di setiap halaman
 * (acuan: desain Dashboard). Isi halaman memakai <PageHeader> + <PageBody>.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen flex items-start justify-center p-3 sm:p-4 lg:p-7 relative overflow-x-hidden selection:bg-cyan-500 selection:text-black">
      {/* Ambient glow */}
      <div className="fixed -bottom-[120px] -left-[120px] w-[450px] h-[450px] pointer-events-none z-0 bg-[radial-gradient(circle,rgba(236,12,102,0.35)_0%,rgba(236,12,102,0)_70%)]" />
      <div className="fixed -bottom-[150px] -right-[150px] w-[500px] h-[500px] pointer-events-none z-0 bg-[radial-gradient(circle,rgba(0,210,255,0.35)_0%,rgba(0,210,255,0)_70%)]" />
      <div className="fixed -top-[100px] right-[15%] w-[400px] h-[400px] pointer-events-none z-0 bg-[radial-gradient(circle,rgba(147,51,234,0.22)_0%,rgba(147,51,234,0)_70%)]" />

      <div className="relative z-10 w-full max-w-[1420px] bg-shell/95 border border-line rounded-[28px] md:rounded-[36px] shadow-2xl p-4 sm:p-6 lg:p-8 backdrop-blur-xl grid grid-cols-1 md:grid-cols-[4rem_minmax(0,1fr)] gap-6 text-gray-100">
        <Suspense fallback={<TopbarFallback className="row-start-1 md:col-span-2" />}>
          <Topbar className="row-start-1 md:col-span-2" />
        </Suspense>
        <Suspense fallback={<Sidebar className="row-start-2 md:row-start-3 md:col-start-1" readOnly />}>
          <RoleSidebar className="row-start-2 md:row-start-3 md:col-start-1" />
        </Suspense>
        {children}
      </div>
      <Suspense fallback={null}>
        <AdminAiChat />
      </Suspense>
    </div>
  );
}
