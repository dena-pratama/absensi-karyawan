import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export const metadata: Metadata = {
  title: "Absensi Ekspedisi",
  description: "Portal operasional absensi harian karyawan ekspedisi",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" data-theme="dark" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head>
        {/* Terapkan tema tersimpan sebelum paint pertama (cegah kedip gelap→terang) */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* display=block: cegah teks nama ikon tampil sebelum font ikon siap */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans text-body-md selection:bg-primary-container selection:text-on-primary-fixed">
        {children}
      </body>
    </html>
  );
}
