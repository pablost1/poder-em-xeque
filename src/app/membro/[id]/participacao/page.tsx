import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ausenciasDoMembro,
  comparacaoDeParticipacao,
  coberturaPresenca,
  contarAusencias,
  getMemberHistorico,
  mandatosDoMembro,
  participacaoDoMembro,
  participacaoMarcas,
  participacaoMeses,
  participacaoTipos,
  periodosDeExercicioDoMembro,
  periodosForaDoExercicio,
} from "@/lib/queries";
import { LEG_ATUAL, lerLegislatura, rotuloLegislatura } from "@/lib/legislaturas";
import { faltouMaisNasImportantes, taxa } from "@/lib/presenca";
import { fmtData, fmtNum } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, Tag, pct, tableClass } from "@/components/ui";
import { BarrasMensais } from "@/components/barras-mensais";
import { BillLabel } from "@/components/bill-link";
import { VotacaoLink } from "@/components/votacao-link";
import { ExParlamentarTag } from "@/components/legislatura-vigente";
import { PaginaComSumario, type ItemSumario } from "@/components/sumario";

const PAGE = 20;
const FILTROS = [["todas", "Todas"], ["apertadas", "Votações apertadas"], ["importantes", "Votações importantes"]] as const;

export const metadata = { title: "Participação — Poder em Xeque" };

export default function ParticipacaoPage(props: PageProps<"/membro/[id]/participacao">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Conteudo params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

/** Barra horizontal de uma taxa (0–1). */
function Barra({ valor, rotulo }: { valor: number | null; rotulo: string }) {
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-iv-empty" role="img" aria-label={rotulo}>
      {valor !== null && <div className="h-full bg-iv-right" style={{ width: `${Math.round(valor * 100)}%` }} />}
    </div>
  );
}

const Linha = ({ rotulo, n, total, nota }: { rotulo: string; n: number; total: number; nota?: string }) => (
  <tr>
    <td className="py-1.5 pr-3">
      {rotulo}
      {nota && <span className="block text-xs text-muted">{nota}</span>}
    </td>
    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(n)}</td>
    <td className="py-1.5 text-right tabular-nums text-muted">{total ? pct(n / total) : "–"}</td>
  </tr>
);

async function Conteudo({ params, searchParams }: Pick<PageProps<"/membro/[id]/participacao">, "params" | "searchParams">) {
  await connection();
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId).replace("-", ":");
  const pessoa = getMemberHistorico(id);
  const mandatos = mandatosDoMembro(id).filter((m) => participacaoDoMembro(id, m.legislatura));
  const pedida = lerLegislatura(sp.leg) ?? LEG_ATUAL;
  const leg = mandatos.some((m) => m.legislatura === pedida) ? pedida : (mandatos[0]?.legislatura ?? LEG_ATUAL);
  const p = participacaoDoMembro(id, leg);
  if (!pessoa || !p) notFound();

  const filtro = (FILTROS.find(([k]) => k === sp.filtro)?.[0] ?? "todas") as (typeof FILTROS)[number][0];
  const pagina = Math.max(1, Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1);
  const ehC = p.chamber === "C";
  const meses = participacaoMeses(id, leg);
  const tipos = participacaoTipos(id, leg);
  const marcas = participacaoMarcas(id, leg);
  const comp = comparacaoDeParticipacao(id, leg);
  const fora = periodosForaDoExercicio(id, leg);
  const periodos = periodosDeExercicioDoMembro(id, leg);
  const ausencias = ausenciasDoMembro(id, leg, filtro, PAGE + 1, (pagina - 1) * PAGE);
  const totalAus = contarAusencias(id, leg, filtro);
  const taxaGeral = taxa(p.votou, p.votacoes);
  const presentesSenado = p.votou + p.presente_sem_voto;
  const anos = new Map<string, { n: number; v: number }>();
  for (const m of meses) {
    const a = anos.get(m.mes.slice(0, 4)) ?? { n: 0, v: 0 };
    a.n += m.votacoes;
    a.v += m.votou;
    anos.set(m.mes.slice(0, 4), a);
  }
  const base = `/membro/${rawId}/participacao`;
  const q = (filtroNovo: string, pg: number) => `${base}?${new URLSearchParams({ leg: String(leg), filtro: filtroNovo, pagina: String(pg) })}`;
  const cob = ehC ? coberturaPresenca(leg) : null;
  const alertaImportantes = !!marcas && faltouMaisNasImportantes(taxaGeral, marcas.importantes ? marcas.importantes_votou / marcas.importantes : null, marcas.importantes);
  const emExercicioHoje = pessoa.atual === 1;

  const itens: ItemSumario[] = [
    { id: "votacoes-nominais", rotulo: "Participação nas votações" },
    { id: "presenca", rotulo: ehC ? "Presença nas sessões" : "Presença nas votações" },
    { id: "como-votou", rotulo: "Como votou" },
    { id: "comparacao", rotulo: "Comparação" },
    { id: "mes-a-mes", rotulo: "Mês a mês" },
    { id: "por-tipo", rotulo: "Por tipo de proposição" },
    { id: "apertadas", rotulo: "Apertadas e importantes" },
    { id: "sequencias", rotulo: "Sequências e períodos" },
    { id: "ausencias", rotulo: "Votações em que não votou" },
  ];

  return (
    <PaginaComSumario itens={itens}>
      <Breadcrumb items={[{ href: "/membros", label: "Parlamentares" }, { href: `/membro/${rawId}`, label: pessoa.name }, { label: "Participação" }]} />

      <div className="flex items-center gap-4">
        {pessoa.photo_url && <Image src={pessoa.photo_url} alt="" width={72} height={92} unoptimized className="h-23 w-18 rounded object-cover" />}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold text-ink-strong sm:text-3xl">Participação e presença</h1>
          <p className="text-lg font-semibold text-ink-strong">{pessoa.name}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Tag className="bg-brand-soft text-brand">{ehC ? "Deputado(a) federal" : "Senador(a)"}</Tag>
            <span>{rotuloLegislatura(leg)}</span>
            {!emExercicioHoje && <ExParlamentarTag ultimaLeg={pessoa.ultima_leg} ultimoVoto={pessoa.ultimo_voto} />}
            {p.cargo_mesa && <Tag className="border border-iv-privilege bg-surface text-ink-strong">Mesa Diretora: {p.cargo_mesa}</Tag>}
          </p>
        </div>
      </div>

      {mandatos.length > 1 && (
        <nav aria-label="Legislatura" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="text-muted">Legislatura:</span>
          {mandatos.map((m) => (
            <Link key={m.legislatura} href={`${base}?leg=${m.legislatura}`} className={`rounded-full border px-3 py-1 ${m.legislatura === leg ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"}`}>
              {rotuloLegislatura(m.legislatura, true)}
            </Link>
          ))}
        </nav>
      )}
      {leg !== LEG_ATUAL && (
        <div role="note" className="rounded-md border border-line bg-surface-2 p-3 text-sm">
          Mandato passado: os números valem para a {rotuloLegislatura(leg)}. A tabela de ranking só existe para a legislatura atual.
        </div>
      )}
      {cob && cob.realizadas === 0 && (
        <div role="note" className="rounded-md border border-line bg-surface-2 p-3 text-sm">
          A Câmara não publica o registro de presença nas sessões desta legislatura; só a participação nas votações está disponível.
        </div>
      )}
      {cob && cob.realizadas > 0 && cob.comLista < cob.realizadas && (
        <div role="note" className="rounded-md border border-line bg-surface-2 p-3 text-sm">
          Das {fmtNum(cob.realizadas)} sessões deliberativas desta legislatura, {fmtNum(cob.realizadas - cob.comLista)} não têm lista de presença publicada e ficam fora da conta de presença.
        </div>
      )}
      {p.cargo_mesa && (
        <div role="note" className="rounded-md border border-iv-privilege p-3 text-sm">
          <strong>Membro da Mesa Diretora.</strong>{" "}
          {p.cargo_mesa.split("; ").includes("Presidente")
            ? "Quem preside a Câmara preside as sessões e não vota: as votações do período na Presidência saem da conta e aparecem como \"presidiu\". "
            : "Quem está na Mesa preside sessões de vez em quando, e a página não consegue separar isso de uma falta. "}
          Por isso a participação nas votações não é comparável com a dos demais, e esta pessoa fica fora da posição e do ranking.
        </div>
      )}
      {p.janela === "estimada" && (
        <div role="note" className="rounded-md border border-line bg-surface-2 p-3 text-sm">
          Não há eventos oficiais de posse e saída para este mandato; o período considerado vai do primeiro ao último voto registrado, então a participação pode estar um pouco superestimada.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="votacoes-nominais" title="Participação nas votações nominais">
          <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{taxaGeral !== null ? pct(taxaGeral) : "–"}</p>
          <p className="mt-1 text-sm">
            Registrou voto em <strong className="tabular-nums">{fmtNum(p.votou)}</strong> de <strong className="tabular-nums">{fmtNum(p.votacoes)}</strong> votações nominais
            {p.primeira && <> entre {fmtData(p.primeira)} e {fmtData(p.ultima)}</>}.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Barra valor={taxaGeral} rotulo={`${taxaGeral !== null ? pct(taxaGeral) : "sem dados"} de participação`} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Conta só as votações em que a pessoa estava em exercício
            {ehC ? " (períodos de posse, descontando licenças e suplência)" : " (o Senado registra uma linha por senador em cada votação)"}. Votou = Sim, Não, Abstenção ou Obstrução.
          </p>
        </Card>
        <Card id="presenca" title={ehC ? "Presença nas sessões deliberativas" : "Presença nas votações"}>
          {ehC ? (
            p.sessoes > 0 ? (
              <>
                <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{pct(p.sessoes_presente / p.sessoes)}</p>
                <p className="mt-1 text-sm">
                  Presença registrada em <strong className="tabular-nums">{fmtNum(p.sessoes_presente)}</strong> de <strong className="tabular-nums">{fmtNum(p.sessoes)}</strong> sessões deliberativas do Plenário em que estava em exercício.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Barra valor={p.sessoes_presente / p.sessoes} rotulo="presença nas sessões" />
                </div>
                <p className="mt-2 text-xs text-muted">Fonte: registro de presença da Câmara. Estar presente na sessão não obriga a votar, então este número costuma ser maior que a participação nas votações.</p>
              </>
            ) : (
              <p className="text-sm text-muted">Sem registro de presença nas sessões para este mandato.</p>
            )
          ) : (
            <>
              <p className="text-3xl font-extrabold tabular-nums text-ink-strong">{p.votacoes ? pct(presentesSenado / p.votacoes) : "–"}</p>
              <p className="mt-1 text-sm">
                Presente em <strong className="tabular-nums">{fmtNum(presentesSenado)}</strong> de <strong className="tabular-nums">{fmtNum(p.votacoes)}</strong> votações: votou ou registrou presença sem votar.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Barra valor={p.votacoes ? presentesSenado / p.votacoes : null} rotulo="presença nas votações" />
              </div>
              <p className="mt-2 text-xs text-muted">O Senado informa o motivo de cada ausência, mostrado ao lado. A presença nas sessões em si não está disponível para o Senado.</p>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="como-votou" title="Como votou">
          <table className="w-full text-sm">
            <tbody className={tableClass.body}>
              <Linha rotulo="Sim" n={p.sim} total={p.votacoes} />
              <Linha rotulo="Não" n={p.nao} total={p.votacoes} />
              <Linha rotulo="Abstenção" n={p.abstencao} total={p.votacoes} />
              <Linha rotulo="Obstrução" n={p.obstrucao} total={p.votacoes} />
              <Linha rotulo="Não votou" n={p.ausente} total={p.votacoes} />
              {!ehC && p.ausente > 0 && (
                <>
                  <Linha rotulo="— atividade parlamentar, licenças e missões" n={p.justificadas} total={p.votacoes} />
                  <Linha rotulo="— presente, sem registrar voto" n={p.presente_sem_voto} total={p.votacoes} />
                  <Linha rotulo="— não compareceu" n={p.nao_compareceu} total={p.votacoes} />
                  {p.outras > 0 && <Linha rotulo="— outros motivos" n={p.outras} total={p.votacoes} />}
                </>
              )}
            </tbody>
          </table>
          {p.presidiu > 0 && (
            <p className="mt-2 text-xs text-muted">
              Em outras {fmtNum(p.presidiu)} votações a pessoa presidiu a sessão ({ehC ? "Presidência da Câmara ou \"Artigo 17\"" : "Presidente da sessão"}); elas ficam fora da conta, porque quem preside não vota.
            </p>
          )}
          {ehC && <p className="mt-2 text-xs text-muted">A Câmara não registra o motivo de uma ausência em votação; o que se sabe é se houve ou não voto.</p>}
        </Card>

        <Card id="comparacao" title="Comparação">
          {comp && comp.casa ? (
            <div className="space-y-2 text-sm">
              {[
                ["Esta pessoa", taxaGeral, null as string | null],
                [`Média ${ehC ? "da Câmara" : "do Senado"}`, comp.casa.media, `${fmtNum(comp.casa.n)} parlamentares`],
                ...(comp.partido ? [[`Média do ${comp.partido.sigla}`, comp.partido.media, `${fmtNum(comp.partido.n)} parlamentares`] as [string, number, string]] : []),
                ...(comp.uf ? [[`Média da bancada ${comp.uf.sigla}`, comp.uf.media, `${fmtNum(comp.uf.n)} parlamentares`] as [string, number, string]] : []),
              ].map(([rot, v, n]) => (
                <div key={String(rot)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={rot === "Esta pessoa" ? "font-bold text-ink-strong" : ""}>{rot}</span>
                    <span className="tabular-nums">
                      <strong>{v !== null ? pct(v as number) : "–"}</strong>
                      {n && <span className="ml-1 text-xs text-muted">({n})</span>}
                    </span>
                  </div>
                  <div className="mt-1 flex">
                    <Barra valor={v as number | null} rotulo={`${rot}: ${v !== null ? pct(v as number) : "sem dados"}`} />
                  </div>
                </div>
              ))}
              {comp.posicao ? (
                <p className="pt-1 font-semibold text-ink-strong">
                  Posição: {comp.posicao.rank}º de {fmtNum(comp.posicao.total)} {ehC ? "deputados" : "senadores"}
                </p>
              ) : (
                <p className="pt-1 text-xs text-muted">
                  {p.cargo_mesa ? "Membros da Mesa Diretora não entram na posição." : "Esteve em exercício em menos de 30% das votações da legislatura, então não entra na posição."}
                </p>
              )}
              <p className="text-xs text-muted">As médias e a posição consideram quem esteve em exercício em pelo menos 30% das votações da legislatura, sem a Mesa Diretora. A posição vai do maior para o menor.</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Sem dados para comparar.</p>
          )}
        </Card>
      </div>

      <Card id="mes-a-mes" title="Mês a mês" aside={<span className="text-xs text-muted">parcela das votações do mês com voto; linha tracejada = média do mandato</span>}>
        <BarrasMensais meses={meses} media={taxaGeral} />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={tableClass.head}>
              <tr>
                <th className="px-2 py-2 text-left">Ano</th>
                <th className="px-2 py-2 text-right">Votações</th>
                <th className="px-2 py-2 text-right">Com voto</th>
                <th className="px-2 py-2 text-right">Participação</th>
              </tr>
            </thead>
            <tbody className={tableClass.body}>
              {[...anos].map(([ano, a]) => (
                <tr key={ano}>
                  <td className="px-2 py-1.5">{ano}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(a.n)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(a.v)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.n ? pct(a.v / a.n) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Barras em amarelo: meses com menos da metade das votações com voto. Meses sem votação nominal ficam em branco. {[...anos.keys()].some((a) => [2006, 2010, 2014, 2018, 2022, 2026].includes(Number(a))) ? "Em ano de eleição geral há período de campanha, quando o Congresso costuma ter menos votações e menos presença." : ""}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="por-tipo" title="Por tipo de proposição">
          <table className="w-full text-sm">
            <thead className={tableClass.head}>
              <tr>
                <th className="px-2 py-2 text-left">Tipo</th>
                <th className="px-2 py-2 text-right">Votações</th>
                <th className="px-2 py-2 text-right">Com voto</th>
                <th className="px-2 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody className={tableClass.body}>
              {tipos.map((t) => (
                <tr key={t.tipo}>
                  <td className="px-2 py-1.5 font-semibold">{t.tipo}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(t.votacoes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(t.votou)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(t.votou / t.votacoes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">PEC: emenda à Constituição · PL: projeto de lei · PLP: lei complementar · MPV: medida provisória · PDL: decreto legislativo.</p>
        </Card>

        <Card id="apertadas" title="Votações apertadas e importantes">
          {marcas ? (
            <table className="w-full text-sm">
              <thead className={tableClass.head}>
                <tr>
                  <th className="px-2 py-2 text-left">Grupo</th>
                  <th className="px-2 py-2 text-right">Votações</th>
                  <th className="px-2 py-2 text-right">Com voto</th>
                  <th className="px-2 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className={tableClass.body}>
                <tr>
                  <td className="px-2 py-1.5">Todas</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(p.votacoes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(p.votou)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{taxaGeral !== null ? pct(taxaGeral) : "–"}</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5">Apertadas <span className="block text-xs text-muted">decididas por menos de 10% dos votos</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(marcas.apertadas)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(marcas.apertadas_votou)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{marcas.apertadas ? pct(marcas.apertadas_votou / marcas.apertadas) : "–"}</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5">Importantes <span className="block text-xs text-muted">classificadas com direção (Estado, Mercado ou privilégios)</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(marcas.importantes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(marcas.importantes_votou)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{marcas.importantes ? pct(marcas.importantes_votou / marcas.importantes) : "–"}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">Sem dados.</p>
          )}
          {alertaImportantes && marcas && (
            <p className="mt-2 rounded-md border border-iv-privilege p-2 text-sm">
              <strong>Falta mais nas importantes:</strong> votou em {pct(marcas.importantes_votou / marcas.importantes)} das votações classificadas com direção, contra {taxaGeral !== null ? pct(taxaGeral) : "–"} no geral. É um sinal para olhar com cuidado, não um julgamento.
            </p>
          )}
          <p className="mt-2 text-xs text-muted">Faltar quando a votação foi decidida por pouco, ou numa votação classificada, tem mais efeito que faltar numa votação com placar folgado.</p>
        </Card>
      </div>

      <Card id="sequencias" title="Sequências e períodos">
        <ul className="space-y-1.5 text-sm">
          <li>
            <strong>Maior sequência sem voto:</strong>{" "}
            {p.maior_seq > 0 ? (
              <>
                {fmtNum(p.maior_seq)} votação(ões) seguida(s), de {fmtData(p.seq_de)} a {fmtData(p.seq_ate)}.
              </>
            ) : (
              "nunca deixou de votar em votações seguidas."
            )}
          </li>
          {ehC && periodos.length > 0 && (
            <li>
              <strong>Períodos em exercício:</strong>{" "}
              {periodos.map((x, i) => (
                <span key={i}>
                  {i > 0 && "; "}
                  {fmtData(x.inicio)} a {x.fim ? fmtData(x.fim) : "hoje"}
                </span>
              ))}
              .
            </li>
          )}
          <li>
            <strong>Fora do exercício (licenças e afastamentos):</strong>{" "}
            {fora.length ? (
              fora.map((x, i) => (
                <span key={i}>
                  {i > 0 && "; "}
                  {fmtData(x.inicio)} a {x.fim ? fmtData(x.fim) : "hoje"} ({x.motivo})
                </span>
              ))
            ) : (
              "nenhum período registrado."
            )}
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">As votações desses períodos não contam como falta.</p>
      </Card>

      <Card id="ausencias" title="Votações em que não votou" aside={<span className="text-xs text-muted">{fmtNum(totalAus)} no filtro</span>}>
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
          {FILTROS.map(([k, rot]) => (
            <Link key={k} href={q(k, 1)} className={`rounded-full border px-3 py-1 ${filtro === k ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"}`}>
              {rot}
            </Link>
          ))}
        </div>
        <ul className="divide-y divide-line-soft">
          {ausencias.slice(0, PAGE).map((a) => (
            <li key={a.sv} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-ink-strong">
                  <BillLabel billId={a.bill_id} label={a.bill_label} fallback="Votação procedimental" />
                </span>
                {a.apertada === 1 && <Tag className="border border-iv-privilege bg-surface text-ink-strong">apertada</Tag>}
                {a.importante === 1 && <Tag className="bg-brand-soft text-brand">importante</Tag>}
                {a.motivo && <Tag>{a.motivo}</Tag>}
              </div>
              <div className="line-clamp-2 text-xs text-ink">{a.description}</div>
              <div className="mt-0.5 text-xs text-muted">
                {fmtData(a.date)} · <VotacaoLink sv={a.sv} />
                {a.sim !== null && a.nao !== null && <> · placar {fmtNum(a.sim)} a {fmtNum(a.nao)}</>}
              </div>
            </li>
          ))}
          {ausencias.length === 0 && <li className="py-4 text-sm text-muted">Nenhuma votação neste filtro.</li>}
        </ul>
        <div className="mt-3 flex justify-between text-sm font-semibold">
          {pagina > 1 ? <Link href={q(filtro, pagina - 1)}>← Mais recentes</Link> : <span />}
          {ausencias.length > PAGE && <Link href={q(filtro, pagina + 1)}>Mais antigas →</Link>}
        </div>
      </Card>

      <p className="rounded-md border border-line bg-surface-2 p-3 text-xs text-muted">
        <strong className="text-ink">O que este número mede e o que não mede.</strong> Participação é a parcela das votações nominais em que a pessoa registrou voto. Não mede a
        qualidade do trabalho, e uma ausência pode ser justificada (a Câmara não informa o motivo). Quem está em comissão, em missão ou em reunião externa pode faltar ao
        Plenário sem faltar ao trabalho. Veja a <Link href="/metodologia">metodologia</Link>.
      </p>
    </PaginaComSumario>
  );
}
