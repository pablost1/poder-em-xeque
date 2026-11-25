import Link from "next/link";
import type { ReactNode } from "react";
import { fmtPct } from "@/lib/format";

export const VOTE_LABEL: Record<string, string> = {
  SIM: "Sim",
  NAO: "Não",
  ABS: "Abstenção",
  OBS: "Obstrução",
  OUTRO: "Outro",
};

const VOTE_STYLE: Record<string, string> = {
  SIM: "bg-yes-bg text-yes-fg",
  NAO: "bg-no-bg text-no-fg",
  ABS: "bg-neutral-bg text-neutral-fg",
  OBS: "bg-neutral-bg text-neutral-fg",
  OUTRO: "bg-neutral-bg text-neutral-fg",
};

/** "Tag" no estilo gov.br: rótulo pequeno em formato de pílula. */
export function Tag({ children, className = "bg-neutral-bg text-neutral-fg" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

export function VoteChip({ vote }: { vote: string | null }) {
  if (!vote) return <span className="text-muted">–</span>;
  return <Tag className={VOTE_STYLE[vote] ?? VOTE_STYLE.OUTRO}>{VOTE_LABEL[vote] ?? vote}</Tag>;
}

export function Card({
  title,
  children,
  className = "",
  aside,
  id,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
  /** Âncora da seção: o menu lateral das páginas de parlamentar rola até ela e a destaca. */
  id?: string;
}) {
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className={`scroll-mt-24 rounded-md border border-line bg-surface p-5 outline-none ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="text-base font-bold text-ink-strong">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Título de página com a barra azul de destaque usada nas páginas gov.br. */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="border-l-4 border-brand pl-4">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-strong sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Caminho de navegação" className="mb-4 text-xs text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="hover:underline">
            Início
          </Link>
        </li>
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span aria-hidden>›</span>
            {it.href ? (
              <Link href={it.href} className="hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const btn = "inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition-colors";
export const buttonClass = {
  primary: `${btn} bg-brand-solid text-on-brand hover:brightness-110`,
  secondary: `${btn} border border-brand text-brand hover:bg-brand-soft`,
};

export const inputClass =
  "rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand";

/** Estilo de tabela no padrão gov.br (cabeçalho cinza, linhas finas). */
export const tableClass = {
  table: "w-full text-left text-sm",
  head: "bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted",
  body: "divide-y divide-line-soft",
};

/** Percentual no formato pt-BR (atalho para fmtPct). */
export const pct = fmtPct;

export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Carregando">
      <div className="h-6 w-1/3 rounded bg-surface-2" />
      <div className="h-24 rounded bg-surface-2" />
      <div className="h-24 rounded bg-surface-2" />
    </div>
  );
}
