import Link from "next/link";
import { TabIndicator, underlineTabClass, underlineTabsNavClass } from "@/components/shell/page-layout";

const TABS = [
  { id: "jadwal", label: "Pengajuan & Jadwal", href: "/libur" },
  { id: "pengaturan", label: "Pengaturan Jatah", href: "/libur/pengaturan" },
] as const;

/** Tab menu Libur. Pengaturan Jatah khusus admin (Office hanya melihat jadwal). */
export function LiburTabs({ active, isAdmin }: { active: (typeof TABS)[number]["id"]; isAdmin: boolean }) {
  if (!isAdmin) return null;
  return (
    <nav aria-label="Menu libur" className={underlineTabsNavClass}>
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined} className={underlineTabClass(t.id === active)}>
          {t.label}
          {t.id === active && <TabIndicator group="libur" />}
        </Link>
      ))}
    </nav>
  );
}
