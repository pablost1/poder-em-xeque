import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Raleway } from "next/font/google";
import "./globals.css";
import { NavLinks, NavLinksStatic } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { FooterStatus } from "@/components/footer-status";
import { Logo } from "@/components/logo";

// A Rawline (fonte do gov.br) não é de distribuição livre; a Raleway é a alternativa documentada.
const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Ícone em public/ (e não em app/icon.svg): as rotas de ícone do App Router quebram na pasta autossuficiente (standalone).
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  title: "Poder em Xeque — como votam deputados e senadores",
  description:
    "Votos nominais por parlamentar e por partido, comparações entre partidos, perfil de votação (Estado, Mercado e Privilégios) e rankings.",
};

// Roda durante a leitura do HTML, então o tema salvo é aplicado antes da primeira pintura.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning className={`${raleway.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#conteudo"
          className="absolute left-2 top-2 z-50 -translate-y-20 rounded bg-brand-solid px-3 py-2 text-sm text-on-brand focus:translate-y-0"
        >
          Ir para o conteúdo
        </a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4">
            <Link href="/" className="order-1 flex items-center gap-2 py-3 text-lg font-extrabold tracking-tight text-brand">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded bg-brand-solid text-on-brand">
                <Logo className="h-7 w-7" />
              </span>
              Poder em Xeque
            </Link>
            <nav aria-label="Principal" className="order-3 flex w-full flex-wrap items-end gap-x-5 sm:order-2 sm:w-auto sm:flex-1 sm:gap-x-3.5">
              <Suspense fallback={<NavLinksStatic />}>
                <NavLinks />
              </Suspense>
            </nav>
            <div className="order-2 ml-auto sm:order-3 sm:ml-0">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="mt-8 bg-brand-deep text-sm text-white/80">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-6">
            <p>
              Dados: dados abertos da Câmara dos Deputados e do Senado Federal. O perfil de votação é uma interpretação, não uma
              nota oficial — veja a <Link className="underline" href="/metodologia" style={{ color: "inherit" }}>metodologia</Link>.
            </p>
            <p className="text-white/60">Projeto independente. Sem vínculo com o Governo Federal.</p>
            <Suspense fallback={null}>
              <FooterStatus />
            </Suspense>
          </div>
        </footer>
      </body>
    </html>
  );
}
