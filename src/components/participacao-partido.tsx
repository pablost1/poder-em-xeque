import Link from "next/link";
import { LEG_ATUAL } from "@/lib/legislaturas";
import { participacaoDoPartido } from "@/lib/queries";
import { fmtNum } from "@/lib/format";
import { Card, pct } from "@/components/ui";

/** Participação nas votações de quem está hoje no partido (legislatura atual). Fica na página do partido. */
export function ParticipacaoPartido({ sigla }: { sigla: string }) {
  const d = participacaoDoPartido(sigla, LEG_ATUAL);
  if (!d) return null;
  const { resumo: r } = d;
  const lista = (titulo: string, itens: typeof d.topo) => (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">{titulo}</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {itens.map((i) => (
          <li key={i.member_id} className="flex justify-between gap-2">
            <Link href={`/membro/${i.member_id.replace(":", "-")}/participacao`}>{i.name}</Link>
            <span className="tabular-nums">{pct(i.taxa)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Card title="Participação do partido" aside={<Link href={`/rankings?eixo=participacao&partido=${encodeURIComponent(sigla)}`} className="text-xs">Ver no ranking →</Link>}>
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct(r.media)}</p>
          <p className="text-xs text-muted">média de {fmtNum(r.n)} parlamentares</p>
        </div>
        <div>
          <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct(r.mediana)}</p>
          <p className="text-xs text-muted">mediana</p>
        </div>
        <div>
          <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct(r.min)}</p>
          <p className="text-xs text-muted">menor participação</p>
        </div>
        <div>
          <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct(r.max)}</p>
          <p className="text-xs text-muted">maior participação</p>
        </div>
      </div>
      <div className="relative mt-4 h-2.5 rounded-full bg-iv-empty" role="img" aria-label={`Participação de ${pct(r.min)} a ${pct(r.max)}, média ${pct(r.media)}`}>
        <div className="absolute h-full rounded-full bg-iv-right" style={{ left: `${r.min * 100}%`, width: `${Math.max(1, (r.max - r.min) * 100)}%` }} />
        <div className="absolute -top-1 h-4.5 w-0.5 bg-ink-strong" style={{ left: `${r.media * 100}%` }} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {lista("Maiores participações", d.topo)}
        {lista("Menores participações", d.fundo)}
      </div>
      <p className="mt-3 text-xs text-muted">
        Entram quem está no cargo hoje, esteve em exercício em pelo menos 30% das votações e não é da Mesa Diretora
        {d.fora > 0 ? ` (${fmtNum(d.fora)} do partido ficaram de fora por isso)` : ""}. Participação não é nota de trabalho: ausências podem ser justificadas.
      </p>
    </Card>
  );
}
