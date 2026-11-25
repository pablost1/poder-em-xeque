import Link from "next/link";
import { aprovacaoDoMandato, atividadeDoMandato, autoriaDoMandato, comparacaoAprovacao, comissoesDoMandato } from "@/lib/queries";
import { LEG_ATUAL } from "@/lib/legislaturas";
import { fmtData, fmtNum } from "@/lib/format";
import { Card, Tag, pct } from "@/components/ui";

const ROTULO_SITUACAO: Record<string, string> = {
  lei: "Viraram lei",
  senado: "Aguardando o Senado",
  veto: "Vetados",
  tramitando: "Ainda tramitando na Câmara",
  arquivada: "Arquivados",
  retirada: "Retirados ou devolvidos ao autor",
  outra: "Sem informação",
};

const PAGE = 15;

/** Autoria de proposições e comissões de um mandato de deputado. Senadores: aviso de que não há fonte. */
export function AtividadeMandato({ memberId, rawId, legislatura, chamber, pagina }: { memberId: string; rawId: string; legislatura: number; chamber: "C" | "S"; pagina: number }) {
  if (chamber === "S") {
    return (
      <Card id="autoria" title="Autoria e comissões">
        <p className="text-sm text-muted">Autoria de projetos e comissões do Senado ainda não estão disponíveis: não há fonte de dados abertos utilizável para isso.</p>
      </Card>
    );
  }
  const resumo = atividadeDoMandato(memberId, legislatura);
  const base = `/membro/${rawId}/mandato/${legislatura}`;
  const lista = autoriaDoMandato(memberId, legislatura, PAGE + 1, (pagina - 1) * PAGE);
  const comissoes = comissoesDoMandato(memberId, legislatura);
  const apr = aprovacaoDoMandato(memberId, legislatura);
  const cmp = apr.coletado && apr.propostos > 0 ? comparacaoAprovacao(legislatura) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card id="autoria" title="Projetos de autoria" aside={<span className="text-xs text-muted">{fmtNum(resumo.projetos)} no mandato</span>}>
        {resumo.projetos === 0 ? (
          <p className="text-sm text-muted">Nenhum projeto de autoria registrado neste mandato.</p>
        ) : (
          <>
            {apr.coletado && apr.propostos > 0 && (
              <div className="mb-4 space-y-3 rounded-md border border-line bg-surface-2 p-3">
                <p className="text-sm">
                  <strong className="text-2xl font-extrabold tabular-nums text-ink-strong">{pct(apr.taxa ?? 0)}</strong>{" "}
                  dos projetos propostos viraram lei: <strong className="tabular-nums">{fmtNum(apr.leis)}</strong> de <strong className="tabular-nums">{fmtNum(apr.propostos)}</strong>.
                </p>
                {cmp && (
                  <p className="text-xs text-muted">
                    Para comparar, entre os {fmtNum(cmp.n)} deputados desta legislatura com pelo menos 10 projetos, a taxa média é {pct(cmp.media)} e a mediana é {pct(cmp.mediana)}.
                  </p>
                )}
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line-soft">
                    {apr.porSituacao.map((g) => (
                      <tr key={g.grupo}>
                        <td className="py-1 pr-3">{ROTULO_SITUACAO[g.grupo] ?? g.grupo}</td>
                        <td className="w-1/3 py-1 pr-3">
                          <div className="h-2 overflow-hidden rounded-full bg-iv-empty" role="img" aria-label={`${ROTULO_SITUACAO[g.grupo] ?? g.grupo}: ${pct(g.pct)}`}>
                            <div className={`h-full ${g.grupo === "lei" ? "bg-iv-right" : "bg-muted"}`} style={{ width: `${Math.max(1, g.pct * 100)}%` }} />
                          </div>
                        </td>
                        <td className="py-1 text-right tabular-nums">{fmtNum(g.n)}</td>
                        <td className="w-12 py-1 text-right tabular-nums text-muted">{pct(g.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="w-full text-sm">
                  <thead className="text-xs font-bold uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-1 pr-3 text-left">Tipo</th>
                      <th className="py-1 pr-3 text-right">Propostos</th>
                      <th className="py-1 pr-3 text-right">% do total</th>
                      <th className="py-1 pr-3 text-right">Viraram lei</th>
                      <th className="py-1 text-right">Taxa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {apr.porTipo.map((t) => (
                      <tr key={t.tipo}>
                        <td className="py-1 pr-3 font-semibold">{t.tipo}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(t.n)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{pct(t.pct)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(t.leis)}</td>
                        <td className="py-1 text-right tabular-nums">{pct(t.taxaLei)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-muted">
                  PL: projeto de lei · PLP: lei complementar · PEC: emenda à Constituição · PDL: decreto legislativo · PRC: resolução · MPV: medida provisória.
                  {legislatura === LEG_ATUAL ? " A legislatura está em andamento: projetos recentes ainda tramitam, então a taxa tende a subir." : " Projetos dos últimos anos do mandato tiveram menos tempo de tramitar."}{" "}
                  A maioria dos projetos de qualquer deputado não vira lei, e muita lei nasce do Executivo, de comissões e da Mesa, que não contam aqui. Projeto apensado a outro conta como tramitando, mesmo que a ideia seja aproveitada.
                  Taxa de aprovação não mede produtividade nem qualidade. Situação do último andamento registrado pela Câmara.
                </p>
              </div>
            )}
            {!(apr.coletado && apr.propostos > 0) && (
            <p className="flex flex-wrap gap-1.5 text-xs">
              {resumo.porTipo.map((t) => (
                <Tag key={t.tipo} className="border border-line bg-surface text-ink">
                  {t.tipo} <strong className="ml-1 tabular-nums">{fmtNum(t.n)}</strong>
                </Tag>
              ))}
            </p>
            )}
            <ul className="mt-3 divide-y divide-line-soft">
              {lista.slice(0, PAGE).map((a) => (
                <li key={a.prop_id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="font-bold">
                        {a.tipo} {a.numero}/{a.ano} ↗
                      </a>
                    ) : (
                      <span className="font-bold">
                        {a.tipo} {a.numero}/{a.ano}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      apresentado em {fmtData(a.apresentacao)}
                      {a.coautores > 0 && ` · com ${fmtNum(a.coautores)} coautor${a.coautores > 1 ? "es" : ""}`}
                    </span>
                  </div>
                  {a.ementa && <p className="line-clamp-2 text-xs text-ink">{a.ementa}</p>}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between text-sm font-semibold">
              {pagina > 1 ? <Link href={`${base}?autoria=${pagina - 1}`}>← Mais recentes</Link> : <span />}
              {lista.length > PAGE && <Link href={`${base}?autoria=${pagina + 1}`}>Mais antigas →</Link>}
            </div>
          </>
        )}
        {resumo.outras > 0 && (
          <p className="mt-2 text-xs text-muted">
            Fora desta lista: {fmtNum(resumo.outras)} outras proposições de autoria (requerimentos, emendas, pareceres, indicações e similares).
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          Conta projetos de lei, emendas à Constituição, decretos, medidas provisórias e resoluções, e só quem propôs de fato, não quem apenas assinou como apoiador. Autoria não diz se o projeto andou ou foi aprovado. Fonte: dados abertos da Câmara.
        </p>
      </Card>

      <Card id="comissoes" title="Comissões e outros órgãos" aside={<span className="text-xs text-muted">{fmtNum(comissoes.length)} no mandato</span>}>
        {comissoes.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma participação em comissão registrada neste mandato.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {comissoes.map((c) => (
              <li key={c.sigla} className="py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-bold">{c.sigla}</span>
                  <span className="text-xs text-muted">{c.cargos.join(" · ")}</span>
                </div>
                {c.nome && <p className="text-xs text-ink">{c.nome}</p>}
                <p className="text-xs text-muted">
                  {fmtData(c.inicio)} a {c.fim ? fmtData(c.fim) : "hoje"}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Inclui comissões permanentes, especiais e outros órgãos; a Mesa Diretora aparece à parte. Fonte: dados abertos da Câmara.</p>
      </Card>
    </div>
  );
}
