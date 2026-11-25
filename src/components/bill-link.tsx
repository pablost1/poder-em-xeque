import type { ReactNode } from "react";
import { proposicaoOficial } from "@/lib/links";

/**
 * Identificação de uma proposição (ex.: "PEC 45/2019") com link para a página oficial na Câmara ou no Senado
 * (tramitação, texto e votações). Sem id, mostra só o texto.
 */
export function BillLabel({
  billId,
  label,
  fallback = "Votação",
  className = "",
}: {
  billId: string | null | undefined;
  label: string | null | undefined;
  /** Texto quando não há identificação. */
  fallback?: ReactNode;
  className?: string;
}) {
  const texto = label ?? fallback;
  const oficial = proposicaoOficial(billId);
  if (!oficial || !label) return <span className={className}>{texto}</span>;
  return (
    <a
      href={oficial.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group/link underline-offset-2 hover:underline ${className}`}
      aria-label={`Abrir ${label} no site oficial: ${oficial.nome} (abre em nova aba)`}
      title={`Abrir ${label} no site da ${oficial.nome}`}
    >
      {label}
      <span aria-hidden className="ml-0.5 text-[0.75em] font-normal opacity-70 group-hover/link:opacity-100">
        ↗
      </span>
    </a>
  );
}
