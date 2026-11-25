import Link from "next/link";
import { LEG_ATUAL, rotuloLegislatura } from "@/lib/legislaturas";
import { aprovacaoDoMandato, atividadeDoMandato, discursosDoMandato, getMandato } from "@/lib/queries";
import { fmtNum } from "@/lib/format";
import { Card, pct } from "@/components/ui";

/**
 * Porta de entrada para o mandato em andamento: o resumo do que a pessoa fez e o caminho para a página completa
 * (autoria, comissões, discursos, alinhamento). Antes, quem estava no primeiro mandato não tinha como chegar a essas seções.
 */
export function MandatoAtualResumo({ memberId, rawId, chamber }: { memberId: string; rawId: string; chamber: "C" | "S" }) {
  const m = getMandato(memberId, LEG_ATUAL);
  if (!m) return null;
  const ehC = chamber === "C";
  const at = ehC ? atividadeDoMandato(memberId, LEG_ATUAL) : null;
  const ap = ehC ? aprovacaoDoMandato(memberId, LEG_ATUAL) : null;
  const dc = discursosDoMandato(memberId, LEG_ATUAL);
  const itens: [string, string][] = [];
  if (at) {
    itens.push([
      fmtNum(at.projetos),
      ap?.coletado && ap.propostos > 0 ? `projetos de autoria, ${fmtNum(ap.leis)} viraram lei (${pct(ap.taxa ?? 0)})` : "projetos de autoria",
    ]);
    itens.push([fmtNum(at.comissoes), "comissões e outros órgãos"]);
  }
  if (dc.importado) itens.push([fmtNum(dc.pronunciamentos + dc.intervencoes), `discursos (${fmtNum(dc.pronunciamentos)} pronunciamentos)`]);
  return (
    <Card id="mandato-atual" title={`Mandato atual: ${rotuloLegislatura(LEG_ATUAL)}`} aside={<Link href={`/membro/${rawId}/mandato/${LEG_ATUAL}`} className="text-xs">Ver o mandato completo →</Link>}>
      {itens.length > 0 ? (
        <dl className="grid gap-4 sm:grid-cols-3">
          {itens.map(([n, rot]) => (
            <div key={rot}>
              <dt className="text-3xl font-extrabold tabular-nums text-ink-strong">{n}</dt>
              <dd className="text-xs text-muted">{rot}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted">Autoria de projetos e comissões do Senado ainda não estão disponíveis.</p>
      )}
      <p className="mt-3 text-xs">
        <Link href={`/membro/${rawId}/mandato/${LEG_ATUAL}#autoria`}>Autoria</Link>
        {ehC && (
          <>
            {" · "}
            <Link href={`/membro/${rawId}/mandato/${LEG_ATUAL}#comissoes`}>Comissões</Link>
          </>
        )}
        {" · "}
        <Link href={`/membro/${rawId}/mandato/${LEG_ATUAL}#discursos`}>Discursos</Link>
        {" · "}
        <Link href={`/membro/${rawId}/mandato/${LEG_ATUAL}#alinhamento-governo`}>Alinhamento com o Governo</Link>
      </p>
    </Card>
  );
}
