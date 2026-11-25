import Link from "next/link";
import { discursosDoMandato, discursosLista } from "@/lib/queries";
import { fmtData, fmtNum } from "@/lib/format";
import { Card, Tag } from "@/components/ui";

const PAGE = 15;

/** Discursos de um mandato: pronunciamentos (tempo próprio de fala) e intervenções na sessão, com resumo e link oficial. */
export function DiscursosMandato({ memberId, rawId, legislatura, grupo: escolhido, pagina }: { memberId: string; rawId: string; legislatura: number; grupo?: "pronunciamento" | "intervencao"; pagina: number }) {
  const r = discursosDoMandato(memberId, legislatura);
  if (!r.importado) return null;
  // Sem escolha explícita, abre na aba que tem conteúdo.
  const grupo = escolhido ?? (r.pronunciamentos > 0 || r.intervencoes === 0 ? "pronunciamento" : "intervencao");
  const base = `/membro/${rawId}/mandato/${legislatura}`;
  const lista = discursosLista(memberId, legislatura, grupo, PAGE + 1, (pagina - 1) * PAGE);
  const href = (g: string, p: number) => `${base}?${new URLSearchParams({ disc: g, dpag: String(p) })}`;
  const total = grupo === "pronunciamento" ? r.pronunciamentos : r.intervencoes;
  return (
    <Card id="discursos" title="Discursos" aside={<span className="text-xs text-muted">{fmtNum(r.pronunciamentos + r.intervencoes)} no mandato</span>}>
      <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
        {(
          [
            ["pronunciamento", `Pronunciamentos (${fmtNum(r.pronunciamentos)})`],
            ["intervencao", `Intervenções na sessão (${fmtNum(r.intervencoes)})`],
          ] as const
        ).map(([k, rot]) => (
          <Link key={k} href={href(k, 1)} className={`rounded-full border px-3 py-1 ${grupo === k ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"}`}>
            {rot}
          </Link>
        ))}
      </div>
      {r.porTipo.length > 0 && (
        <p className="mb-2 flex flex-wrap gap-1.5 text-xs">
          {r.porTipo.map((t) => (
            <Tag key={t.tipo} className="border border-line bg-surface text-ink">
              {t.tipo.toLowerCase()} <strong className="ml-1 tabular-nums">{fmtNum(t.n)}</strong>
            </Tag>
          ))}
        </p>
      )}
      {total === 0 ? (
        <p className="text-sm text-muted">Nenhum registro neste grupo.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {lista.slice(0, PAGE).map((d, i) => (
            <li key={`${d.data}-${i}`} className="py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-bold">{fmtData(d.data)}</span>
                <span className="text-xs text-muted">
                  {d.tipo.toLowerCase()}
                  {d.fase ? ` · ${d.fase.toLowerCase()}` : ""}
                </span>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-xs">
                    texto oficial ↗
                  </a>
                )}
                {d.video && (
                  <a href={d.video} target="_blank" rel="noreferrer" className="text-xs">
                    vídeo ↗
                  </a>
                )}
              </div>
              {d.sumario && <p className="line-clamp-3 text-xs text-ink">{d.sumario}</p>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-between text-sm font-semibold">
        {pagina > 1 ? <Link href={href(grupo, pagina - 1)}>← Mais recentes</Link> : <span />}
        {lista.length > PAGE && <Link href={href(grupo, pagina + 1)}>Mais antigas →</Link>}
      </div>
      <p className="mt-2 text-xs text-muted">
        Pronunciamentos são as falas em tempo próprio (breves comunicações, grande expediente, comunicações). Intervenções são falas ligadas ao andamento da sessão (pela ordem,
        encaminhamento de votação, discussão, como líder). {r.presidencia > 0 ? `As ${fmtNum(r.presidencia)} falas na condução da sessão (Presidência) não entram na conta. ` : ""}
        A quantidade de discursos não mede a qualidade nem o volume de trabalho: boa parte dele acontece em comissões e fora do Plenário. O texto completo fica no site oficial.
      </p>
    </Card>
  );
}
