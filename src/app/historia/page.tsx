import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { historiaPartidos, legislaturasClassificadas, validacaoLegislaturas, HISTORIA_MIN_ECONOMICAS, HISTORIA_MIN_PRIVILEGIOS } from "@/lib/queries";
import { EIXOS, type EixoSlug } from "@/lib/eixos";
import { LEG_PRIMEIRA, LEG_ATUAL, rotuloLegislatura } from "@/lib/legislaturas";
import { alternarPartido, corDoPartidoHistoria, lerPartidos, partidosPadrao, pontoDaCelula, type PontoHistoria } from "@/lib/historia";
import { fmtNum } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, PageTitle, tableClass } from "@/components/ui";
import { LinhaTempo, type SerieHistoria } from "@/components/linha-tempo";
import { NivelValidacao } from "@/components/nivel-validacao";
import { leituraValidacao } from "@/lib/validacao";

export const metadata = { title: "História — Poder em Xeque" };

export default function HistoriaPage(props: PageProps<"/historia">) {
  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "História" }]} />
      <PageTitle sub="Como cada partido votou ao longo das legislaturas, nas votações que foram classificadas: quantas vezes a posição do partido (a maioria dos seus votantes) empurrou para o Estado, para o mercado ou para mais privilégios.">
        História
      </PageTitle>
      <Suspense fallback={<PageSkeleton />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Pick<PageProps<"/historia">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const casa: "C" | "S" = s("casa") === "senado" ? "S" : "C";
  const eixo: EixoSlug = (EIXOS.find((e) => e.slug === s("eixo"))?.slug ?? "estado") as EixoSlug;
  const eixoInfo = EIXOS.find((e) => e.slug === eixo)!;

  const celulas = historiaPartidos(casa);
  const cobertura = legislaturasClassificadas(casa);
  const legs: number[] = [];
  for (let n = LEG_PRIMEIRA; n <= LEG_ATUAL; n++) legs.push(n);
  const validacao = new Map(validacaoLegislaturas(casa).map((v) => [v.legislatura, v]));
  const fracas = legs.filter((l) => leituraValidacao(validacao.get(l)?.estado_d1)?.nivel === "fraca");
  const naoClassificadas = new Set(legs.filter((l) => (cobertura.find((c) => c.legislatura === l)?.classificadas ?? 0) === 0));

  const porPartido = new Map<string, Map<number, PontoHistoria>>();
  for (const c of celulas) {
    const m = porPartido.get(c.party) ?? new Map<number, PontoHistoria>();
    m.set(c.legislatura, pontoDaCelula(c, eixo));
    porPartido.set(c.party, m);
  }
  // partidos que têm pelo menos um ponto válido neste eixo
  const comDados = [...porPartido].filter(([, m]) => [...m.values()].some((p) => p.valor !== null)).map(([p]) => p).sort();
  const escolhidosUrl = lerPartidos(sp.partido, new Set(comDados));
  const escolhidos = escolhidosUrl.length ? escolhidosUrl : partidosPadrao(celulas, eixo);
  const series: SerieHistoria[] = escolhidos.map((p) => ({ party: p, cor: corDoPartidoHistoria(p, escolhidos), pontos: porPartido.get(p)! }));

  const url = (over: { casa?: string; eixo?: string; partido?: string[] }) => {
    const q = new URLSearchParams();
    const c = over.casa ?? (casa === "S" ? "senado" : "camara");
    if (c === "senado") q.set("casa", "senado");
    q.set("eixo", over.eixo ?? eixo);
    const ps = over.partido ?? escolhidos;
    if (ps.length) q.set("partido", ps.join(","));
    return `/historia?${q}`;
  };
  const minimo = eixo === "privilegios" ? HISTORIA_MIN_PRIVILEGIOS : HISTORIA_MIN_ECONOMICAS;
  const classificadas = legs.filter((l) => !naoClassificadas.has(l));

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold">
        <nav aria-label="Eixo" className="flex flex-wrap gap-2">
          {EIXOS.map((e) => (
            <Link key={e.slug} href={url({ eixo: e.slug })} className={`rounded-full border px-3 py-1 ${e.slug === eixo ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"}`}>
              {e.rotulo}
            </Link>
          ))}
        </nav>
        <nav aria-label="Casa" className="flex gap-2">
          {([["camara", "Câmara"], ["senado", "Senado"]] as const).map(([k, rot]) => (
            <Link key={k} href={url({ casa: k })} className={`rounded-full border px-3 py-1 ${(casa === "S") === (k === "senado") ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"}`}>
              {rot}
            </Link>
          ))}
        </nav>
      </div>

      <Card title={`${eixoInfo.rotulo} por legislatura`} aside={<span className="text-xs text-muted">{eixoInfo.descricao}</span>}>
        {classificadas.length === 0 ? (
          <p className="text-sm text-muted">Ainda não há votações classificadas nesta casa.</p>
        ) : (
          <LinhaTempo series={series} legs={legs} naoClassificadas={naoClassificadas} eixo={eixoInfo.rotulo} />
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Partidos no gráfico">
          {comDados.map((p) => {
            const ativo = escolhidos.includes(p);
            return (
              <Link
                key={p}
                href={url({ partido: alternarPartido(escolhidos, p) })}
                aria-pressed={ativo}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${ativo ? "border-ink text-ink-strong" : "border-line text-muted hover:border-brand"}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: ativo ? corDoPartidoHistoria(p, escolhidos) : "var(--line)" }} />
                {p}
              </Link>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          Cada ponto usa só votações classificadas. Com menos de {minimo} votações com direção neste eixo o ponto não aparece
          (lacuna, não zero). Passe o mouse num ponto para ver as contagens. Partidos aparecem pela linhagem (por exemplo,
          PMDB e MDB são o mesmo partido). Legislaturas sombreadas ainda não tiveram as votações classificadas
          {naoClassificadas.size ? `: ${[...naoClassificadas].map((l) => rotuloLegislatura(l, true)).join(", ")}` : ""}.
        </p>
      </Card>

      <Card title="Tabela: partido × legislatura" aside={<span className="text-xs text-muted">{eixoInfo.rotulo}: % e votações classificadas</span>}>
        <div className="overflow-x-auto">
          <table className={tableClass.table}>
            <thead className={tableClass.head}>
              <tr>
                <th className="px-2 py-2">Partido</th>
                {legs.map((l) => (
                  <th key={l} className="px-2 py-2 text-right">
                    {l}ª
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={tableClass.body}>
              <tr className="bg-surface-2">
                <td className="px-2 py-2 text-xs font-semibold text-muted">
                  <Link href="/metodologia">Teste independente</Link>
                </td>
                {legs.map((l) => (
                  <td key={l} className="px-2 py-2 text-right">
                    {naoClassificadas.has(l) ? <span className="text-xs text-muted">–</span> : <NivelValidacao rho={validacao.get(l)?.estado_d1} />}
                  </td>
                ))}
              </tr>
              {comDados.map((p) => (
                <tr key={p}>
                  <td className="px-2 py-2 font-bold">
                    <Link href={`/partido/${encodeURIComponent(p)}`}>{p}</Link>
                  </td>
                  {legs.map((l) => {
                    const pt = porPartido.get(p)?.get(l);
                    if (naoClassificadas.has(l) || !pt) return <td key={l} className="px-2 py-2 text-right text-muted">–</td>;
                    return (
                      <td key={l} className="px-2 py-2 text-right tabular-nums" title={pt.contagens.map((c) => `${c.n} ${c.rotulo}`).join(" · ")}>
                        {pt.valor === null ? (
                          <span className="text-xs text-muted">poucos dados ({pt.base})</span>
                        ) : (
                          <>
                            <strong>{Math.round(pt.valor)}%</strong> <span className="text-xs text-muted">({fmtNum(pt.base)})</span>
                            {pt.intervalo && (
                              <span className="block text-[11px] text-muted">
                                {Math.round(pt.intervalo.min)}–{Math.round(pt.intervalo.max)}%
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Entre parênteses, o número de votações classificadas com direção neste eixo em que o partido teve posição. Abaixo do
          percentual, a faixa de incerteza (intervalo aproximado de 95%, calculado com esse número de votações): quanto mais larga, menos
          firme é o ponto. No gráfico, a barra fina mostra a faixa e o ponto vazado indica pouca base. A linha
          &quot;Teste independente&quot; compara o perfil de Estado com o mapa de votos de cada legislatura (que não usa nenhuma marcação).
        </p>
        {fracas.length > 0 && (
          <p className="mt-2 rounded border border-iv-privilege p-2 text-xs text-ink">
            <strong>Atenção:</strong> na {fracas.map((l) => rotuloLegislatura(l, true)).join(", ")} a concordância com o mapa de votos é fraca.
            Nessas legislaturas a divisão dos votos é sobretudo governo contra oposição, e o perfil de Estado quase não acompanha essa
            divisão. Leia os números delas com cautela (<Link href="/metodologia">entenda por quê</Link>).
          </p>
        )}
      </Card>

      <p className="rounded-md border border-line bg-surface-2 p-3 text-xs text-muted">
        <strong className="text-ink">Como ler:</strong> o gráfico mostra o que foi votado e classificado em cada período, então reflete a pauta
        de cada legislatura tanto quanto o jeito de votar de cada partido. É uma interpretação a partir das ementas, não uma nota oficial, e
        partidos que mudaram de nome ou se fundiram foram agrupados de forma curada (veja a <Link href="/metodologia">metodologia</Link>).
      </p>
    </>
  );
}
