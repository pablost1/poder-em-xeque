import { NATUREZA_INFO, type Natureza, type Tom } from "@/lib/mandato";
import { fmtData } from "@/lib/format";
import type { MandatoRow } from "@/lib/queries";
import { Tag } from "@/components/ui";

/* Estilos sem vermelho de "alarme": desfechos legais são fatos registrados, não juízo nosso. O texto da etiqueta sempre diz o que é. */
const ESTILO: Record<Tom, string> = {
  ok: "bg-yes-bg text-yes-fg",
  neutro: "bg-neutral-bg text-neutral-fg",
  aviso: "border border-iv-privilege bg-surface text-ink-strong",
  grave: "bg-ink-strong text-surface",
};

/** Etiqueta com a natureza do mandato. O balão explica o que significa e mostra o motivo oficial. */
export function NaturezaMandato({ natureza, motivo }: { natureza: Natureza; motivo?: string | null }) {
  const info = NATUREZA_INFO[natureza];
  // Em exercício não é um desfecho: mostramos só que o mandato é da legislatura atual.
  const title = `${info.explicacao}${motivo ? ` Motivo registrado: ${motivo}.` : ""}`;
  return (
    <span title={title}>
      <Tag className={ESTILO[info.tom]}>{info.rotulo}</Tag>
    </span>
  );
}

/** Etiqueta da condição (titular ou suplente). */
export function CondicaoMandato({ condicao }: { condicao: MandatoRow["condicao"] }) {
  if (!condicao) return null;
  return <Tag className="bg-brand-soft text-brand">{condicao}</Tag>;
}

/** Licenças e afastamentos do mandato, com o texto oficial. */
export function LicencasMandato({ licencas }: { licencas: MandatoRow["licencas"] }) {
  if (!licencas.length) return null;
  return (
    <p className="text-xs text-muted">
      <strong className="text-ink">Licenças e afastamentos ({licencas.length}):</strong>{" "}
      {licencas.map((l, i) => (
        <span key={i}>
          {i > 0 && "; "}
          {l.motivo}
          {l.data ? ` (${fmtData(l.data)})` : ""}
        </span>
      ))}
      .
    </p>
  );
}
