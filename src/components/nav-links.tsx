"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/membros", label: "Parlamentares", match: ["/membros", "/membro"] },
  { href: "/mandatos", label: "Mandatos", match: ["/mandatos"] },
  { href: "/partidos", label: "Partidos", match: ["/partidos", "/partido"] },
  { href: "/comparar", label: "Comparar", match: ["/comparar"] },
  { href: "/rankings", label: "Rankings", match: ["/rankings"] },
  { href: "/historia", label: "História", match: ["/historia"] },
  { href: "/mapa", label: "Mapa", match: ["/mapa"] },
  { href: "/busca", label: "Busca", match: ["/busca", "/projeto", "/votacao"] },
  { href: "/metodologia", label: "Metodologia", match: ["/metodologia"] },
];

const base = "border-b-4 px-0.5 py-3 text-sm font-semibold transition-colors";

/** Versão estática, usada como fallback do Suspense e na primeira pintura. */
export function NavLinksStatic() {
  return (
    <>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`${base} border-transparent text-ink hover:border-brand`}>
          {n.label}
        </Link>
      ))}
    </>
  );
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((n) => {
        const active = n.match.some((m) => pathname === m || pathname.startsWith(m + "/"));
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`${base} ${active ? "border-brand text-brand" : "border-transparent text-ink hover:border-brand"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
