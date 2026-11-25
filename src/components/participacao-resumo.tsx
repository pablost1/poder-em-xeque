import Link from "next/link";
import { LEG_ATUAL } from "@/lib/legislaturas";
import { comparacaoDeParticipacao, participacaoDoMembro } from "@/lib/queries";
import { fmtNum } from "@/lib/format";
import { Card, Tag, pct } from "@/components/ui";

/** Resumo da participação na legislatura atual, com link para a página de detalhes. Fica na página do parlamentar. */
export function ParticipacaoResumo({ memberId, rawId }: { memberId: string; rawId: string }) {
  const p = participacaoDoMembro(memberId, LEG_ATUAL);
  if (!p || p.votacoes === 0) return null;
  const ehC = p.chamber === "C";
  const comp = comparacaoDeParticipacao(memberId, LEG_ATUAL);
  const t = p.votou / p.votacoes;
  return (
    <Card id="participacao" title="Participação" aside={<Link href={`/membro/${rawId}/participacao`} className="text-xs">Ver detalhes →</Link>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct(t)}</p>
          <p className="text-xs text-muted">
            votou em {fmtNum(p.votou)} de {fmtNum(p.votacoes)} votações nominais
          </p>
        </div>
        <div>
          {ehC && p.sessoes > 0 ? (
            <>
              <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct(p.sessoes_presente / p.sessoes)}</p>
              <p className="text-xs text-muted">
                presente em {fmtNum(p.sessoes_presente)} de {fmtNum(p.sessoes)} sessões deliberativas
              </p>
            </>
          ) : !ehC ? (
            <>
              <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct((p.votou + p.presente_sem_voto) / p.votacoes)}</p>
              <p className="text-xs text-muted">presente nas votações (votou ou registrou presença)</p>
            </>
          ) : null}
        </div>
        <div>
          {comp?.casa && (
            <>
              <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct(comp.casa.media)}</p>
              <p className="text-xs text-muted">
                média {ehC ? "da Câmara" : "do Senado"}
                {comp.posicao && <> · posição {comp.posicao.rank}º de {fmtNum(comp.posicao.total)}</>}
              </p>
            </>
          )}
        </div>
      </div>
      {p.cargo_mesa && (
        <p className="mt-3 text-xs text-muted">
          <Tag className="border border-iv-privilege bg-surface text-ink-strong">Mesa Diretora: {p.cargo_mesa}</Tag> Quem está na Mesa preside sessões, então esta participação não é comparável com a dos demais.
        </p>
      )}
    </Card>
  );
}
