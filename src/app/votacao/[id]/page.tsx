import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getVotacao, listPartyAcronyms, votacaoOrientacoes, votacaoPorPartido, votacaoVotos } from "@/lib/queries";
import { TOPIC_LABEL } from "@/lib/topics";
import { fmtData, fmtNum, plural } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, PageTitle, Tag, VOTE_LABEL, VoteChip, buttonClass, inputClass, tableClass } from "@/components/ui";
import { BillLabel } from "@/components/bill-link";
import { projetoSlug, votacaoIdDoSlug } from "@/components/votacao-link";

const PAGE = 50;

const RESULTADO: Record<string, { texto: string; cls: string }> = {
  approved: { texto: "Aprovada", cls: "bg-yes-bg text-yes-fg" },
  rejected: { texto: "Rejeitada", cls: "bg-no-bg text-no-fg" },
};

export default function VotacaoPage(props: PageProps<"/votacao/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Votacao params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Votacao({ params, searchParams }: Pick<PageProps<"/votacao/[id]">, "params" | "searchParams">) {
  await connection();
  const { id: slug } = await params;
  const sp = await searchParams;
  const id = votacaoIdDoSlug(slug);
  const v = getVotacao(id);
  if (!v) notFound();

  const voto = typeof sp.voto === "string" ? sp.voto : undefined;
  const partido = typeof sp.partido === "string" ? sp.partido : undefined;
  const pagina = Math.max(1, Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1);

  const porPartido = votacaoPorPartido(id);
  const orient = v.chamber === "C" ? votacaoOrientacoes(id) : [];
  const { rows, total } = votacaoVotos(id, { vote: voto, party: partido, limit: PAGE, offset: (pagina - 1) * PAGE });
  const ultima = Math.max(1, Math.ceil(total / PAGE));
  const parties = listPartyAcronyms();
  const soma = (k: "sim" | "nao" | "abs" | "obs") => porPartido.reduce((a, p) => a + p[k], 0);
  const totais = { SIM: soma("sim"), NAO: soma("nao"), ABS: soma("abs"), OBS: soma("obs") };
  const todos = porPartido.reduce((a, p) => a + p.total, 0);
  const outros = todos - (totais.SIM + totais.NAO + totais.ABS + totais.OBS);
  const resultado = v.result ? RESULTADO[v.result] : undefined;
  const qs = (o: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const m = { voto, partido, pagina, ...o };
    if (m.voto) q.set("voto", String(m.voto));
    if (m.partido) q.set("partido", String(m.partido));
    if (m.pagina && Number(m.pagina) > 1) q.set("pagina", String(m.pagina));
    const s = q.toString();
    return `/votacao/${slug}${s ? `?${s}` : ""}`;
  };

  const marcada = v.economic !== null && v.procedural === 0;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          ...(v.bill_id ? [{ href: `/projeto/${projetoSlug(v.bill_id)}`, label: v.bill_label ?? "Projeto" }] : []),
          { label: `Votação de ${fmtData(v.date)}` },
        ]}
      />
      <PageTitle sub={v.description ?? undefined}>
        <BillLabel billId={v.bill_id} label={v.bill_label} fallback="Votação" />
      </PageTitle>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Tag className="bg-brand-soft text-brand">{v.chamber === "C" ? "Câmara dos Deputados" : "Senado Federal"}</Tag>
        <span className="text-muted">{fmtData(v.date)}</span>
        {resultado ? <Tag className={resultado.cls}>{resultado.texto}</Tag> : <Tag>Resultado não informado</Tag>}
        {v.topic && <Tag>{TOPIC_LABEL[v.topic] ?? v.topic}</Tag>}
        {v.bill_id && (
          <Link className={buttonClass.secondary} href={`/projeto/${projetoSlug(v.bill_id)}`}>
            Ver o projeto e todas as suas votações
          </Link>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Placar">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            {(["SIM", "NAO", "ABS", "OBS"] as const).map((k) => (
              <div key={k} className="contents">
                <dt className="text-muted">{VOTE_LABEL[k]}</dt>
                <dd className="tabular-nums">{fmtNum(totais[k])}</dd>
              </div>
            ))}
            {outros > 0 && (
              <>
                <dt className="text-muted">Outros (ex.: presidente da sessão)</dt>
                <dd className="tabular-nums">{fmtNum(outros)}</dd>
              </>
            )}
            <dt className="text-muted">Total de votos</dt>
            <dd className="tabular-nums">{fmtNum(todos)}</dd>
          </dl>
          {v.summary && <p className="mt-3 text-sm text-muted">{v.summary}</p>}
          {v.ementa && <p className="mt-2 line-clamp-4 text-xs text-muted">{v.ementa}</p>}
        </Card>

        <Card title="Como esta votação foi marcada">
          {marcada ? (
            <div className="space-y-1.5 text-sm">
              <p>
                Um <strong>Sim</strong> aqui equivale a:
              </p>
              <ul className="list-inside list-disc text-muted">
                <li>
                  Econômico: <strong className="text-ink">{v.economic! > 0 ? "+" : ""}{v.economic!.toFixed(1).replace(".", ",")}</strong>{" "}
                  ({Math.abs(v.economic!) < 0.2 ? "sem direção econômica clara" : v.economic! < 0 ? "pró-Estado / esquerda" : "pró-mercado / direita"})
                </li>
                <li>
                  Privilégios: <strong className="text-ink">{v.privilege! > 0 ? "+" : ""}{v.privilege!.toFixed(1).replace(".", ",")}</strong>{" "}
                  ({Math.abs(v.privilege!) < 0.3 ? "sem relação clara" : v.privilege! > 0 ? "amplia privilégios de políticos" : "reduz privilégios de políticos"})
                </li>
                <li>Confiança: {Math.round((v.confidence ?? 0) * 100)}%</li>
              </ul>
              {v.rationale && <p className="text-xs text-muted">{v.rationale}</p>}
              <p className="text-xs text-muted">
                Marcação {v.tag_source === "human" ? "humana" : "automática"}. Veja a <Link href="/metodologia">metodologia</Link>.
              </p>
            </div>
          ) : v.procedural === 1 ? (
            <p className="text-sm text-muted">Votação procedimental (urgência, adiamento, recurso…). Fica fora do perfil de votação.</p>
          ) : (
            <p className="text-sm text-muted">Esta votação ainda não foi marcada.</p>
          )}
        </Card>
      </div>

      {orient.length > 0 && (
        <Card title="Orientações de bancada">
          <ul className="flex flex-wrap gap-2 text-sm">
            {orient.map((o) => (
              <li key={o.key} className="rounded-full border border-line px-3 py-1">
                <span className="font-semibold text-ink-strong">{o.key}</span>: {o.orientation}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Como cada partido votou">
        <div className="overflow-x-auto">
          <table className={tableClass.table}>
            <thead className={tableClass.head}>
              <tr>
                <th className="px-3 py-2">Partido</th>
                <th className="px-3 py-2 text-right">Sim</th>
                <th className="px-3 py-2 text-right">Não</th>
                <th className="px-3 py-2 text-right">Abst.</th>
                <th className="px-3 py-2 text-right">Obstr.</th>
                <th className="px-3 py-2">Posição</th>
                <th className="px-3 py-2">Orientação do partido</th>
              </tr>
            </thead>
            <tbody className={tableClass.body}>
              {porPartido.map((p) => (
                <tr key={p.party}>
                  <td className="px-3 py-1.5 font-bold">
                    {p.party === "Sem partido" ? (
                      p.party
                    ) : (
                      <Link href={qs({ partido: p.party, pagina: 1 })} title="Ver só os votos deste partido">
                        {p.party}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.sim)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.nao)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.abs)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.obs)}</td>
                  <td className="px-3 py-1.5">{p.pos ? <VoteChip vote={p.pos} /> : <span className="text-muted">–</span>}</td>
                  <td className="px-3 py-1.5 text-muted">{p.orientacao ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          A posição é a maioria dos votos Sim/Não do partido (sem posição em caso de empate ou com menos de dois votantes). Partidos
          dentro de federações ou blocos podem aparecer sem orientação própria; veja as orientações de bancada acima.
        </p>
      </Card>

      <Card title={`Votos individuais (${fmtNum(total)})`}>
        <form className="mb-3 flex flex-wrap items-end gap-2 text-xs">
          <label className="grid gap-1 font-semibold">
            Voto
            <select name="voto" defaultValue={voto ?? ""} className={inputClass}>
              <option value="">Todos</option>
              {(["SIM", "NAO", "ABS", "OBS"] as const).map((k) => (
                <option key={k} value={k}>
                  {VOTE_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-semibold">
            Partido
            <select name="partido" defaultValue={partido ?? ""} className={inputClass}>
              <option value="">Todos</option>
              {parties.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonClass.primary}>Filtrar</button>
        </form>
        <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1 text-sm">
              {r.photo_url ? (
                <Image src={r.photo_url} alt="" width={22} height={28} unoptimized className="h-7 w-[22px] rounded object-cover" />
              ) : (
                <span className="h-7 w-[22px] rounded bg-surface-2" />
              )}
              <Link href={`/membro/${r.id.replace(":", "-")}`} className="min-w-0 flex-1 truncate font-semibold">
                {r.name}
              </Link>
              <span className="text-xs text-muted">
                {r.party ?? "–"} · {r.uf ?? "–"}
              </span>
              <VoteChip vote={r.vote} />
            </li>
          ))}
          {rows.length === 0 && <li className="text-sm text-muted">Nenhum voto com este filtro.</li>}
        </ul>
        <div className="mt-3 flex items-center justify-between text-sm font-semibold">
          {pagina > 1 ? <Link href={qs({ pagina: pagina - 1 })}>← Anterior</Link> : <span />}
          <span className="text-xs font-normal text-muted">
            página {fmtNum(pagina)} de {fmtNum(ultima)} · {plural(total, "voto")}
          </span>
          {pagina < ultima ? <Link href={qs({ pagina: pagina + 1 })}>Próxima →</Link> : <span />}
        </div>
      </Card>
    </div>
  );
}
