import Link from "next/link";
import { TabIndicator, underlineTabClass, underlineTabsNavClass } from "@/components/shell/page-layout";

export type KasbonTab = "pengajuan" | "pengaturan";

const TABS: { id: KasbonTab; label: string; href: string }[] = [
  { id: "pengajuan", label: "Pengajuan Kasbon", href: "/kasbon" },
  { id: "pengaturan", label: "Pengaturan Kasbon", href: "/kasbon/pengaturan" },
];

/** Tab menu Kasbon. Pengaturan khusus admin, jadi SPV / karyawan tidak melihat tab sama sekali. */
export function KasbonTabs({ active, isAdmin }: { active: KasbonTab; isAdmin: boolean }) {
  if (!isAdmin) return null;
  return (
    <nav aria-label="Menu kasbon" className={underlineTabsNavClass}>
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined} className={underlineTabClass(t.id === active)}>
          {t.label}
          {t.id === active && <TabIndicator group="kasbon" />}
        </Link>
      ))}
    </nav>
  );
}
