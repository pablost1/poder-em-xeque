import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  getMember,
  getMemberHistorico,
  mandatosDoMembro,
  memberIv,
  memberPartyAgreement,
  memberSummary,
  memberTopics,
  memberVotes,
  memberAlinhamento,
  notableVotes,
  estaNoMapa,
  posicaoMembro,
} from "@/lib/queries";
import { EIXOS, type EixoSlug } from "@/lib/eixos";
import { LEG_ATUAL } from "@/lib/legislaturas";
import { fmtData, fmtNum } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, Tag, VoteChip, pct, VOTE_LABEL } from "@/components/ui";
import { PerfilBarras } from "@/components/perfil-barras";
import { NotableVotes, TopicSummary } from "@/components/summaries";
import { BillLabel } from "@/components/bill-link";
import { VotacaoLink } from "@/components/votacao-link";
import { ExMembro } from "@/components/ex-membro";
import { MandatosAnteriores } from "@/components/mandatos-anteriores";
import { ParticipacaoResumo } from "@/components/participacao-resumo";
import { MandatoAtualResumo } from "@/components/mandato-atual-resumo";
import { PaginaComSumario, type ItemSumario } from "@/components/sumario";

const PAGE_SIZE = 25;
/** Linhas de partido com menos votações em comum que isto ficam apagadas. */
const MIN_SHARED = 20;

export default function MemberPage(props: PageProps<"/membro/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Member params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Member({
  params,
  searchParams,
}: Pick<PageProps<"/membro/[id]">, "params" | "searchParams">) {
  await connection();
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId).replace("-", ":");
  const member = getMember(id);
  if (!member) {
    // Quem não está na legislatura atual tem uma página própria, mais enxuta, marcada como ex-parlamentar.
    const ex = getMemberHistorico(id);
    if (!ex) notFound();
    return <ExMembro membro={ex} />;
  }

  const page = Math.max(1, Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1);
  const vote = typeof sp.voto === "string" ? sp.voto : undefined;
  const summary = memberSummary(id);
  const partyAgreement = memberPartyAgreement(id);
  const iv = memberIv(id);
  const alinh = memberAlinhamento(id);
  const noMapa = estaNoMapa(id);
  const posicoes = Object.fromEntries(EIXOS.map((e) => [e.slug, posicaoMembro(id, e)?.geral ?? null])) as Record<
    EixoSlug,
    { rank: number; total: number } | null
  >;
  const mandatos = mandatosDoMembro(id);
  const topics = memberTopics(id);
  const notable = notableVotes({ memberId: id });
  const rows = memberVotes(id, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE, vote);
  const hasNext = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);
  const base = `/membro/${rawId}`;
  const qs = (p: number, v?: string) => `${base}?${new URLSearchParams({ ...(v ? { voto: v } : {}), pagina: String(p) })}`;

  const itens: ItemSumario[] = [
    { id: "perfil", rotulo: "Perfil de votação" },
    { id: "resumo-votos", rotulo: "Resumo dos votos" },
    { id: "alinhamento-governo", rotulo: "Alinhamento com o Governo" },
    { id: "participacao", rotulo: "Participação" },
    ...(mandatos.some((m) => m.legislatura === LEG_ATUAL) ? [{ id: "mandato-atual", rotulo: "Mandato atual" }] : []),
    ...(mandatos.some((m) => m.legislatura !== LEG_ATUAL) ? [{ id: "mandatos-anteriores", rotulo: "Mandatos anteriores" }] : []),
    { id: "temas", rotulo: "Apoia e rejeita, por tema" },
    { id: "destaques", rotulo: "Votos de destaque" },
    { id: "partidos", rotulo: "Votos com cada partido" },
    { id: "historico", rotulo: "Histórico de votações" },
  ];

  return (
    <PaginaComSumario itens={itens}>
      <Breadcrumb items={[{ href: "/membros", label: "Parlamentares" }, { label: member.name }]} />
      <div className="flex items-center gap-4">
        {member.photo_url && (
          <Image src={member.photo_url} alt="" width={72} height={92} unoptimized className="h-23 w-18 rounded object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-ink-strong sm:text-3xl">{member.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Tag className="bg-brand-soft text-brand">{member.chamber === "C" ? "Deputado(a) federal" : "Senador(a)"}</Tag>
            {member.party ? (
              <Link className="font-semibold" href={`/partido/${encodeURIComponent(member.party)}`}>
                {member.party}
              </Link>
            ) : (
              "sem partido"
            )}
            <span>· {member.uf}</span>
          </p>
          <p className="mt-2 text-xs">
            <Link href={`/membro/${rawId}/participacao`}>Participação e presença</Link>
            {" · "}
            <Link href={`/comparar?modo=parlamentares&m=${encodeURIComponent(member.id)}`}>Comparar com outro parlamentar</Link>
            {noMapa && (
              <>
                {" · "}
                <Link href={`/mapa?${member.chamber === "S" ? "casa=senado&" : ""}membro=${rawId}`}>Ver posição no mapa de votos</Link>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="perfil" title="Perfil de votação">
          <PerfilBarras iv={iv} evidenceBase={`/membro/${rawId}/barras`} posicoes={posicoes} />
        </Card>
        <Card id="resumo-votos" title="Histórico de votos">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            {(["SIM", "NAO", "ABS", "OBS", "OUTRO"] as const).map((k) => (
              <div key={k} className="contents">
                <dt className="text-muted">{VOTE_LABEL[k]}</dt>
                <dd className="tabular-nums">{fmtNum(summary.byVote[k] ?? 0)}</dd>
              </div>
            ))}
            <dt className="text-muted">Participação</dt>
            <dd className="tabular-nums">
              {fmtNum(summary.cast)} de {fmtNum(summary.total)} votações nominais (
              {pct(summary.total ? summary.cast / summary.total : null)})
            </dd>
            <dt className="text-muted">Votou com o próprio partido</dt>
            <dd className="tabular-nums">
              {summary.loyalty ? `${pct(summary.loyalty.same / summary.loyalty.n)} (${fmtNum(summary.loyalty.n)} votações)` : "–"}
            </dd>
          </dl>
        </Card>
      </div>

      <Card id="alinhamento-governo" title="Alinhamento com a orientação do Governo">
        {member.chamber === "S" ? (
          <p className="text-sm text-muted">
            A orientação do Governo não está disponível para o Senado, então esta medida só existe para deputados.
          </p>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Como o Governo orientou</dt>
              <dd className="tabular-nums">
                {alinh.governo ? (
                  <>
                    <strong>{pct(alinh.governo.same / alinh.governo.shared)}</strong> ({fmtNum(alinh.governo.same)} de{" "}
                    {fmtNum(alinh.governo.shared)} votações)
                  </>
                ) : (
                  "–"
                )}
              </dd>
            </dl>
            <p className="mt-2 text-xs text-muted">
              Contam só votações em que o Governo deu orientação clara de Sim ou Não e o parlamentar votou Sim ou Não; orientações
              &quot;liberado&quot;, obstrução e abstenção ficam de fora. Votar com o Governo não é bom nem ruim: só mostra a
              proximidade com a orientação dele.
            </p>
          </>
        )}
      </Card>

      <ParticipacaoResumo memberId={id} rawId={rawId} />

      <MandatoAtualResumo memberId={id} rawId={rawId} chamber={member.chamber as "C" | "S"} />

      <MandatosAnteriores rawId={rawId} mandatos={mandatos} titulo="Mandatos anteriores" />

      <div className="grid gap-4 md:grid-cols-2">
        <TopicSummary id="temas" kind="parlamentar" title="Apoia e rejeita, por tema" rows={topics} unit="votos Sim / Não em projetos, sem votações procedimentais" />
        <NotableVotes id="destaques" title="Votos recentes de destaque" rows={notable} />
      </div>

      <Card
        id="partidos"
        title="Votos com cada partido"
        aside={<span className="text-xs text-muted">% das votações em comum do lado da maioria do partido</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs font-bold uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Partido</th>
                <th className="py-2 pr-3 text-right">Iguais</th>
                <th className="py-2 pr-3 text-right">Contrários</th>
                <th className="w-1/3 py-2 pr-3">Concordância</th>
                <th className="py-2 text-right">Votações em comum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {partyAgreement.map((r) => {
                const share = r.same / r.shared;
                const thin = r.shared < MIN_SHARED;
                const own = r.party === member.party;
                return (
                  <tr key={r.party} className={thin ? "text-muted" : ""}>
                    <td className="py-2 pr-3">
                      <Link className="font-bold" href={`/membro/${rawId}/vs/${encodeURIComponent(r.party)}`}>
                        {r.party}
                      </Link>
                      {own && <Tag className="ml-2 bg-brand-soft text-brand">próprio partido</Tag>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(r.same)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(r.shared - r.same)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 flex-1 overflow-hidden rounded-full bg-iv-empty"
                          role="img"
                          aria-label={`${pct(share)} de concordância`}
                        >
                          <div className={`h-full ${thin ? "bg-muted" : "bg-iv-right"}`} style={{ width: `${share * 100}%` }} />
                        </div>
                        <span className="w-10 text-right text-xs font-semibold tabular-nums">{pct(share)}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmtNum(r.shared)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Linhas apagadas têm menos de {MIN_SHARED} votações em comum; interprete com cautela. Clique em um partido para ver as
          votações por trás do número.
        </p>
      </Card>

      <Card id="historico" title="Histórico de votações">
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
          {[undefined, "SIM", "NAO", "ABS", "OBS"].map((v) => (
            <Link
              key={v ?? "todos"}
              href={qs(1, v)}
              className={`rounded-full border px-3 py-1 ${
                vote === v ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"
              }`}
            >
              {v ? VOTE_LABEL[v] : "Todos"}
            </Link>
          ))}
        </div>
        <ul className="divide-y divide-line-soft">
          {shown.map((r) => (
            <li key={r.session_vote_id} className="flex items-start gap-3 py-2.5 text-sm">
              <VoteChip vote={r.vote} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-ink-strong">
                  <BillLabel billId={r.bill_id} label={r.bill_label} fallback="Votação procedimental" />
                </div>
                <div className="line-clamp-2 text-xs text-ink">{r.description}</div>
                <div className="line-clamp-1 text-xs text-muted">{r.ementa}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {fmtData(r.date)} · <VotacaoLink sv={r.session_vote_id} />
                  {r.result && <> · {r.result === "approved" ? "aprovada" : "rejeitada"}</>}
                  {r.party_pos && <> · maioria do partido: {VOTE_LABEL[r.party_pos]}</>}
                </div>
              </div>
            </li>
          ))}
          {shown.length === 0 && <li className="py-4 text-sm text-muted">Nenhum voto.</li>}
        </ul>
        <div className="mt-3 flex justify-between text-sm font-semibold">
          {page > 1 ? <Link href={qs(page - 1, vote)}>← Mais recentes</Link> : <span />}
          {hasNext && <Link href={qs(page + 1, vote)}>Mais antigos →</Link>}
        </div>
      </Card>
    </PaginaComSumario>
  );
}
