import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  coberturaLegislatura,
  getMandato,
  getMemberHistorico,
  mandatoAlinhamento,
  mandatoIv,
  mandatosDoMembro,
  mandatoVotosPorTipo,
  discursosDoMandato,
  participacaoDoMembro,
  mandatoGoverno,
  votosDoMandato,
} from "@/lib/queries";
import { rotuloLegislatura } from "@/lib/legislaturas";
import { fmtData, fmtNum } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, Tag, VoteChip, VOTE_LABEL, pct } from "@/components/ui";
import { PerfilBarras } from "@/components/perfil-barras";
import { BillLabel } from "@/components/bill-link";
import { VotacaoLink } from "@/components/votacao-link";
import { CondicaoMandato, LicencasMandato, NaturezaMandato } from "@/components/natureza-mandato";
import { ExParlamentarTag } from "@/components/legislatura-vigente";
import { AtividadeMandato } from "@/components/atividade-mandato";
import { DiscursosMandato } from "@/components/discursos-mandato";
import { PaginaComSumario, type ItemSumario } from "@/components/sumario";

const PAGE_SIZE = 25;
/** Partidos com menos votações em comum que isto ficam apagados. */
const MIN_SHARED = 20;

export default function MandatoPage(props: PageProps<"/membro/[id]/mandato/[leg]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Mandato params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Mandato({ params, searchParams }: Pick<PageProps<"/membro/[id]/mandato/[leg]">, "params" | "searchParams">) {
  await connection();
  const { id: rawId, leg: rawLeg } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId).replace("-", ":");
  const leg = Number(rawLeg);
  if (!Number.isInteger(leg)) notFound();
  const mandato = getMandato(id, leg);
  const pessoa = getMemberHistorico(id);
  if (!mandato || !pessoa) notFound();

  const page = Math.max(1, Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1);
  const vote = typeof sp.voto === "string" ? sp.voto : undefined;
  const todos = mandatosDoMembro(id);
  const iv = mandatoIv(id, leg);
  const cobertura = coberturaLegislatura(leg);
  const porTipo = mandatoVotosPorTipo(id, leg);
  const alinh = mandatoAlinhamento(id, leg);
  const governo = mandatoGoverno(id, leg);
  const part = participacaoDoMembro(id, leg);
  const rows = votosDoMandato(id, leg, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE, vote);
  const shown = rows.slice(0, PAGE_SIZE);
  const hasNext = rows.length > PAGE_SIZE;
  const base = `/membro/${rawId}/mandato/${leg}`;
  const qs = (p: number, v?: string) => `${base}?${new URLSearchParams({ ...(v ? { voto: v } : {}), pagina: String(p) })}`;
  const emExercicioHoje = pessoa.atual === 1;

  const itens: ItemSumario[] = [
    { id: "perfil", rotulo: "Perfil de votação" },
    { id: "votos-mandato", rotulo: "Votos no mandato" },
    { id: "autoria", rotulo: "Projetos de autoria" },
    ...(pessoa.chamber === "C" ? [{ id: "comissoes", rotulo: "Comissões" }] : []),
    ...(discursosDoMandato(id, leg).importado ? [{ id: "discursos", rotulo: "Discursos" }] : []),
    { id: "alinhamento-governo", rotulo: "Alinhamento com o Governo" },
    { id: "partidos", rotulo: "Votos com cada partido" },
    { id: "votos", rotulo: "Votos do mandato" },
  ];

  return (
    <PaginaComSumario itens={itens}>
      <Breadcrumb
        items={[
          { href: "/membros", label: "Parlamentares" },
          { href: `/membro/${rawId}`, label: pessoa.name },
          { label: `Mandato ${rotuloLegislatura(leg, true)}` },
        ]}
      />

      <div className="flex items-center gap-4">
        {pessoa.photo_url && <Image src={pessoa.photo_url} alt="" width={72} height={92} unoptimized className="h-23 w-18 rounded object-cover" />}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold text-ink-strong sm:text-3xl">{pessoa.name}</h1>
          <p className="text-sm font-semibold text-ink-strong">Mandato na {rotuloLegislatura(leg)}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Tag className="bg-brand-soft text-brand">{pessoa.chamber === "C" ? "Deputado(a) federal" : "Senador(a)"}</Tag>
            <NaturezaMandato natureza={mandato.natureza} motivo={mandato.motivo} />
            <CondicaoMandato condicao={mandato.condicao} />
            {mandato.partido && (
              <span>
                {mandato.partido_sigla && mandato.partido_sigla !== mandato.partido ? `${mandato.partido_sigla} (hoje ${mandato.partido})` : mandato.partido}
              </span>
            )}
            {!emExercicioHoje && <ExParlamentarTag ultimaLeg={pessoa.ultima_leg} ultimoVoto={pessoa.ultimo_voto} />}
          </p>
          <p className="text-xs text-muted">
            {mandato.primeira && <>Votos de {fmtData(mandato.primeira)} a {fmtData(mandato.ultima)}. </>}
            {mandato.motivo && <>Motivo registrado na fonte oficial: {mandato.motivo}. </>}
            Fonte: dados abertos {pessoa.chamber === "C" ? "da Câmara dos Deputados" : "do Senado Federal"}.
          </p>
          <LicencasMandato licencas={mandato.licencas} />
        </div>
      </div>

      {todos.length > 1 && (
        <nav aria-label="Outros mandatos" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="text-muted">Mandatos:</span>
          {todos.map((m) => (
            <Link
              key={m.legislatura}
              href={`/membro/${rawId}/mandato/${m.legislatura}`}
              className={`rounded-full border px-3 py-1 ${m.legislatura === leg ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"}`}
            >
              {rotuloLegislatura(m.legislatura, true)}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="perfil" title="Perfil de votação neste mandato">
          <PerfilBarras iv={iv} />
          {cobertura.classificadas === 0 && (
            <p className="mt-2 rounded border border-line bg-surface-2 p-2 text-xs text-muted">
              As votações desta legislatura ainda não foram classificadas, por isso não há perfil. O restante da página usa só os votos.
            </p>
          )}
          {cobertura.classificadas > 0 && (
            <p className="mt-2 text-xs text-muted">
              Nesta legislatura, {fmtNum(cobertura.classificadas)} de {fmtNum(cobertura.total)} votações nominais foram classificadas.
            </p>
          )}
        </Card>
        <Card id="votos-mandato" title="Votos neste mandato">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            {(["SIM", "NAO", "ABS", "OBS", "OUTRO"] as const).map((k) => (
              <div key={k} className="contents">
                <dt className="text-muted">{VOTE_LABEL[k]}</dt>
                <dd className="tabular-nums">{fmtNum(porTipo[k] ?? 0)}</dd>
              </div>
            ))}
            {part && part.votacoes > 0 ? (
              <div className="contents">
                <dt className="text-muted">Participação</dt>
                <dd className="tabular-nums">
                  {fmtNum(part.votou)} de {fmtNum(part.votacoes)} votações nominais ({pct(part.votou / part.votacoes)})
                </dd>
              </div>
            ) : null}
            {alinh.fidelidade && (
              <div className="contents">
                <dt className="text-muted">Votou com o próprio partido</dt>
                <dd className="tabular-nums">
                  {pct(alinh.fidelidade.same / alinh.fidelidade.n)} ({fmtNum(alinh.fidelidade.same)} de {fmtNum(alinh.fidelidade.n)})
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-xs text-muted">
            A participação conta só as votações em que a pessoa estava em exercício (licenças e suplência ficam de fora).{" "}
            <Link href={`/membro/${rawId}/participacao?leg=${leg}`}>Ver participação em detalhe →</Link>
          </p>
        </Card>
      </div>

      <AtividadeMandato memberId={id} rawId={rawId} legislatura={leg} chamber={pessoa.chamber as "C" | "S"} pagina={Math.max(1, Number(typeof sp.autoria === "string" ? sp.autoria : 1) || 1)} />

      <DiscursosMandato memberId={id} rawId={rawId} legislatura={leg} grupo={sp.disc === "intervencao" ? "intervencao" : sp.disc === "pronunciamento" ? "pronunciamento" : undefined} pagina={Math.max(1, Number(typeof sp.dpag === "string" ? sp.dpag : 1) || 1)} />

      <Card id="alinhamento-governo" title="Alinhamento com a orientação do Governo">
        {governo ? (
          <p className="text-sm">
            Votou como o Governo orientou em <strong className="tabular-nums">{pct(governo.same / governo.shared)}</strong> ({fmtNum(governo.same)} de {fmtNum(governo.shared)} votações).
          </p>
        ) : (
          <p className="text-sm text-muted">
            {pessoa.chamber === "S"
              ? "Não disponível para o Senado: o Senado não registra orientação do Governo por votação."
              : "Sem votações com orientação clara do Governo (Sim ou Não) neste mandato."}
          </p>
        )}
      </Card>

      <Card
        id="partidos"
        title="Votos com cada partido neste mandato"
        aside={<span className="text-xs text-muted">% das votações em comum do lado da maioria do partido</span>}
      >
        {alinh.partidos.length === 0 ? (
          <p className="text-sm text-muted">Sem votações em comum suficientes.</p>
        ) : (
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
                {alinh.partidos.map((r) => {
                  const share = r.same / r.shared;
                  const thin = r.shared < MIN_SHARED;
                  return (
                    <tr key={r.party} className={thin ? "text-muted" : ""}>
                      <td className="py-2 pr-3 font-bold">
                        {r.party}
                        {r.party === mandato.partido && <Tag className="ml-2 bg-brand-soft text-brand">próprio partido</Tag>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(r.same)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(r.shared - r.same)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-iv-empty" role="img" aria-label={`${pct(share)} de concordância`}>
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
        )}
        <p className="mt-2 text-xs text-muted">
          Os partidos aparecem pela linhagem (por exemplo, PMDB e MDB são o mesmo partido). Linhas apagadas têm menos de {MIN_SHARED} votações em comum.
        </p>
      </Card>

      <Card id="votos" title="Votos deste mandato">
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
          {[undefined, "SIM", "NAO", "ABS", "OBS"].map((v) => (
            <Link
              key={v ?? "todos"}
              href={qs(1, v)}
              className={`rounded-full border px-3 py-1 ${vote === v ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"}`}
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
