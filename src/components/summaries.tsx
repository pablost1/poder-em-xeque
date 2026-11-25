import { Card, VoteChip } from "@/components/ui";
import { TOPIC_INFO, TOPIC_LABEL } from "@/lib/topics";
import { fmtData } from "@/lib/format";
import type { NotableRow, TopicRow } from "@/lib/queries";
import { BillLabel } from "@/components/bill-link";
import { VotacaoLink } from "@/components/votacao-link";

/**
 * O que o parlamentar/partido apoia (Sim) e rejeita (Não), por tema dos projetos votados.
 * Passar o mouse (ou focar/tocar) num tema mostra o que ele cobre e o que Sim e Não significam nele.
 */
export function TopicSummary({
  title,
  rows,
  unit,
  kind,
  id,
}: {
  id?: string;
  title: string;
  rows: TopicRow[];
  unit: string;
  kind: "parlamentar" | "partido";
}) {
  const max = Math.max(1, ...rows.map((r) => r.yes + r.no));
  const quem = kind === "partido" ? "a maioria do partido votou" : "votou";
  return (
    <Card id={id} title={title} aside={<span className="text-xs text-muted">{unit}</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Ainda sem temas marcados.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const info = TOPIC_INFO[r.topic];
            const id = `tema-${kind}-${r.topic}`;
            return (
              <li
                key={r.topic}
                className="group relative rounded text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                tabIndex={info ? 0 : undefined}
                aria-describedby={info ? id : undefined}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-strong">
                    {TOPIC_LABEL[r.topic] ?? r.topic}
                    {info && (
                      <span aria-hidden className="ml-1 text-xs font-normal text-muted">
                        ⓘ
                      </span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    <span className="text-yes-fg">{r.yes} sim</span> · <span className="text-no-fg">{r.no} não</span>
                  </span>
                </div>
                <div
                  className="mt-1 flex h-2 overflow-hidden rounded-full bg-iv-empty"
                  style={{ width: `${((r.yes + r.no) / max) * 100}%`, minWidth: "8%" }}
                >
                  <div className="bg-yes-fg" style={{ width: `${(r.yes / Math.max(1, r.yes + r.no)) * 100}%` }} />
                  <div className="bg-no-fg" style={{ width: `${(r.no / Math.max(1, r.yes + r.no)) * 100}%` }} />
                </div>
                {info && (
                  <div
                    id={id}
                    role="tooltip"
                    className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-80 max-w-[85vw] rounded-md border border-line bg-surface p-3 text-xs leading-relaxed text-ink shadow-lg group-hover:block group-focus-within:block"
                  >
                    <p className="font-bold text-ink-strong">{TOPIC_LABEL[r.topic]}</p>
                    <p className="mt-1">{info.descricao}</p>
                    <p className="mt-2">
                      <span className="font-bold text-yes-fg">Sim:</span> {quem} a favor, ou seja, apoiou {info.objeto}.
                    </p>
                    <p className="mt-1">
                      <span className="font-bold text-no-fg">Não:</span> {quem} contra, ou seja, rejeitou {info.objeto}.
                    </p>
                    <p className="mt-2 text-muted">
                      Sim e Não se referem ao texto em votação; em destaques e emendas, um Sim pode significar manter ou
                      adotar um trecho. Votações procedimentais (urgência, adiamento) ficam de fora.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function direcao(r: NotableRow): string {
  const partes: string[] = [];
  if (Math.abs(r.economic) >= 0.5) partes.push(r.economic < 0 ? "medida pró-Estado/esquerda" : "medida pró-mercado/direita");
  if (Math.abs(r.privilege) >= 0.5) partes.push(r.privilege > 0 ? "amplia privilégios de políticos" : "reduz privilégios de políticos");
  return partes.join(" · ");
}

/** Votos recentes com direção forte e bem marcada, em linguagem simples. */
export function NotableVotes({ title, rows, id }: { title: string; rows: NotableRow[]; id?: string }) {
  return (
    <Card id={id} title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhum ainda.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => (
            <li key={r.sv} className="flex items-start gap-3 py-2 text-sm">
              <VoteChip vote={r.vote} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-ink-strong">
                  <BillLabel billId={r.bill_id} label={r.bill_label} />
                </div>
                <div className="text-xs text-muted">{r.summary}</div>
                <div className="text-xs text-muted">
                  {fmtData(r.date)} · <VotacaoLink sv={r.sv} /> · Sim = {direcao(r)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
