"use client";

import { useEffect, useState, type ReactNode } from "react";

export type ItemSumario = { id: string; rotulo: string };

/**
 * Sumário lateral das páginas de parlamentar: cada item rola suavemente até a seção e a faz brilhar por um instante.
 * Em telas largas fica fixo à esquerda; em telas estreitas vira uma faixa de atalhos no topo. Marca a seção visível.
 */
export function Sumario({ itens }: { itens: ItemSumario[] }) {
  const [ativo, setAtivo] = useState<string | null>(null);

  useEffect(() => {
    const alvos = itens.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!alvos.length || typeof IntersectionObserver === "undefined") return;
    const visiveis = new Set<string>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.id);
          else visiveis.delete(e.target.id);
        }
        const primeiro = itens.find((i) => visiveis.has(i.id));
        if (primeiro) setAtivo(primeiro.id);
      },
      { rootMargin: "-10% 0px -60% 0px" },
    );
    alvos.forEach((a) => obs.observe(a));
    return () => obs.disconnect();
  }, [itens]);

  function ir(e: React.MouseEvent, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setAtivo(id);
    // reinicia a animação mesmo se a mesma seção for clicada de novo
    el.classList.remove("secao-destaque");
    void el.offsetWidth;
    el.classList.add("secao-destaque");
    window.setTimeout(() => el.classList.remove("secao-destaque"), 2200);
    el.focus({ preventScroll: true });
  }

  const classe = (id: string) =>
    `block rounded px-2.5 py-1.5 text-sm hover:bg-surface-2 ${ativo === id ? "bg-brand-soft font-bold text-brand" : "text-ink"}`;
  return (
    <>
      {/* telas estreitas: faixa de atalhos que acompanha a rolagem */}
      <nav aria-label="Seções da página" className="sticky top-0 z-20 -mx-4 mb-4 flex gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-2 lg:hidden">
        {itens.map((i) => (
          <a
            key={i.id}
            href={`#${i.id}`}
            onClick={(e) => ir(e, i.id)}
            aria-current={ativo === i.id ? "true" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${ativo === i.id ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink"}`}
          >
            {i.rotulo}
          </a>
        ))}
      </nav>
      {/* telas largas: menu fixo à esquerda */}
      <nav aria-label="Seções da página" className="sticky top-6 hidden self-start lg:block">
        <p className="mb-1 px-2.5 text-xs font-bold uppercase tracking-wide text-muted">Nesta página</p>
        <ul className="space-y-0.5">
          {itens.map((i) => (
            <li key={i.id}>
              <a href={`#${i.id}`} onClick={(e) => ir(e, i.id)} aria-current={ativo === i.id ? "true" : undefined} className={classe(i.id)}>
                {i.rotulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** Página com o sumário à esquerda e o conteúdo à direita. */
export function PaginaComSumario({ itens, children }: { itens: ItemSumario[]; children: ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-8">
      <Sumario itens={itens} />
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
