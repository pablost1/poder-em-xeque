import { LEG_ATUAL, rotuloLegislatura } from "@/lib/legislaturas";
import { Tag } from "@/components/ui";
import { fmtData } from "@/lib/format";

/**
 * Lê o parâmetro ?vigente= de uma URL. O padrão é LIGADO (só legislatura vigente). O formulário envia "0" e, se a caixa
 * estiver marcada, também "1" (por isso pode vir uma lista).
 */
export function lerVigente(v: string | string[] | undefined): boolean {
  if (Array.isArray(v)) return v.includes("1");
  return v !== "0";
}

/** Caixa "Só legislatura vigente", marcada por padrão. */
export function VigenteToggle({ vigente }: { vigente: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-ink-strong">
      <input type="hidden" name="vigente" value="0" />
      <input type="checkbox" name="vigente" value="1" defaultChecked={vigente} className="h-4 w-4 accent-[var(--brand)]" />
      Só legislatura vigente: {rotuloLegislatura(LEG_ATUAL, true)}
    </label>
  );
}

/** Aviso de que os números da página são da legislatura atual. */
export function NotaLegislatura() {
  return <p className="text-xs text-muted">Dados da {rotuloLegislatura(LEG_ATUAL)}, a legislatura em andamento.</p>;
}

/** Etiqueta de quem não está em exercício na legislatura atual. */
export function ExParlamentarTag({ ultimaLeg, ultimoVoto }: { ultimaLeg: number | null; ultimoVoto?: string | null }) {
  // Votou na legislatura atual mas já não está no cargo (saiu, foi cassado, era suplente): dizemos quando.
  const saiuNaAtual = ultimaLeg === LEG_ATUAL;
  return (
    <Tag className="bg-surface-2 text-muted">
      ex-parlamentar
      {saiuNaAtual
        ? ultimoVoto ? ` · deixou o cargo (último voto em ${fmtData(ultimoVoto)})` : " · deixou o cargo"
        : ultimaLeg ? ` · até a ${rotuloLegislatura(ultimaLeg, true)}` : ""}
    </Tag>
  );
}
