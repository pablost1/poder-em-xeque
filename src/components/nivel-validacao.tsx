import { leituraValidacao } from "@/lib/validacao";
import { Tag } from "@/components/ui";

const ESTILO = {
  forte: "bg-yes-bg text-yes-fg",
  moderada: "bg-neutral-bg text-neutral-fg",
  fraca: "border border-iv-privilege bg-surface text-ink-strong",
} as const;

/** Etiqueta com a leitura do teste independente de uma legislatura. O balão explica o que significa. */
export function NivelValidacao({ rho }: { rho: number | null | undefined }) {
  const l = leituraValidacao(rho);
  if (!l) return <span className="text-xs text-muted">–</span>;
  return (
    <span title={l.explicacao}>
      <Tag className={ESTILO[l.nivel]}>{l.rotulo}</Tag>
    </span>
  );
}
