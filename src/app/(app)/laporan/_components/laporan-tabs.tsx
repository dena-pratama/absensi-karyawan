import Link from "next/link";
import { TabIndicator, underlineTabClass, underlineTabsNavClass } from "@/components/shell/page-layout";

export type LaporanTab = "kehadiran" | "kasbon";

const TABS: { id: LaporanTab; label: string; href: string }[] = [
  { id: "kehadiran", label: "Laporan Kehadiran", href: "/laporan" },
  { id: "kasbon", label: "Laporan Kasbon", href: "/laporan/kasbon" },
];

/** Tab menu Laporan (khusus admin). */
export function LaporanTabs({ active }: { active: LaporanTab }) {
  return (
    <nav aria-label="Menu laporan" className={underlineTabsNavClass}>
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined} className={underlineTabClass(t.id === active)}>
          {t.label}
          {t.id === active && <TabIndicator group="laporan" />}
        </Link>
      ))}
    </nav>
  );
}
