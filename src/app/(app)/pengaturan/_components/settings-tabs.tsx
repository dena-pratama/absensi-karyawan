"use client";

import Link from "next/link";
import { TabIndicator, underlineTabClass, underlineTabsNavClass } from "@/components/shell/page-layout";
import { unsavedStore } from "./staged";

export type SettingsTab = "karyawan" | "cabang" | "jabatan" | "akses" | "ai";

export function SettingsTabs({
  active,
  counts,
}: {
  active: SettingsTab;
  counts: { employees: number; branches: number; roles: number } | null;
}) {
  const tabs: { key: SettingsTab; label: string; href: string; count?: number }[] = [
    { key: "karyawan", label: "Manajemen Karyawan", href: "/pengaturan", count: counts?.employees },
    { key: "cabang", label: "Manajemen Cabang / Hub", href: "/pengaturan/cabang", count: counts?.branches },
    { key: "jabatan", label: "Master Jabatan", href: "/pengaturan/jabatan", count: counts?.roles },
    { key: "akses", label: "Pengguna & Akses", href: "/pengaturan/akses" },
    { key: "ai", label: "Konektor AI", href: "/pengaturan/ai" },
  ];

  return (
    <nav aria-label="Menu pengaturan" className={underlineTabsNavClass}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            onClick={(e) => {
              if (!isActive && unsavedStore.dirty && !window.confirm("Ada perubahan yang belum diterapkan. Pindah halaman dan buang perubahan?")) {
                e.preventDefault();
              }
            }}
            className={`${underlineTabClass(isActive)} flex items-center gap-2`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`min-w-5 text-center text-[10px] font-semibold leading-4 px-1.5 rounded-full tabular-nums transition-colors ${
                  isActive ? "bg-cyan-500/15 text-brand-ink" : "bg-panel-raised text-gray-400"
                }`}
              >
                {t.count}
              </span>
            )}
            {isActive && <TabIndicator group="pengaturan" />}
          </Link>
        );
      })}
    </nav>
  );
}
