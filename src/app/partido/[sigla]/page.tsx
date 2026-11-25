import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { listMembers, notableVotes, partyGoverno, partyIv, partySummary, partyTopBills, partyTopics, posicaoPartido } from "@/lib/queries";
import { EIXOS, type EixoSlug } from "@/lib/eixos";
import { fmtData, fmtNum, plural } from "@/lib/format";
import { NotaLegislatura } from "@/components/legislatura-vigente";
import { Breadcrumb, Card, PageSkeleton, PageTitle, VOTE_LABEL, buttonClass, pct } from "@/components/ui";
import { PerfilBarras } from "@/components/perfil-barras";
import { ParticipacaoPartido } from "@/components/participacao-partido";
import { NotableVotes, TopicSummary } from "@/components/summaries";
import { BillLabel } from "@/components/bill-link";

export default function PartyPage(props: PageProps<"/partido/[sigla]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Party params={props.params} />
    </Suspense>
  );
}

async function Party({ params }: Pick<PageProps<"/partido/[sigla]">, "params">) {
  await connection();
  const party = decodeURIComponent((await params).sigla);
  const s = partySummary(party);
  const members = listMembers({ party });
  const backed = partyTopBills(party, "SIM");
  const rejected = partyTopBills(party, "NAO");
  const iv = partyIv(party);
  const gov = partyGoverno(party);
  const posicoes = Object.fromEntries(EIXOS.map((e) => [e.slug, posicaoPartido(party, e)])) as Record<
    EixoSlug,
    { rank: number; total: number } | null
  >;
  const topics = partyTopics(party);
  const notable = notableVotes({ party });

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/partidos", label: "Partidos" }, { label: party }]} />
      <NotaLegislatura />
      <p className="text-xs">
        <Link href={`/historia?partido=${encodeURIComponent(party)}`}>Ver a evolução deste partido ao longo das legislaturas →</Link>
      </p>
      <PageTitle
        sub={`${plural(members.length, "parlamentar", "parlamentares")} · coesão de ${pct(s.cohesion)} em ${fmtNum(s.positions)} votações com posição clara do partido`}
      >
        {party}
      </PageTitle>
      <Link className={buttonClass.secondary} href={`/comparar?a=${encodeURIComponent(party)}`}>
        Comparar com outro partido
      </Link>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Perfil de votação (média do partido)">
          <PerfilBarras iv={iv} posicoes={posicoes} />
        </Card>
        <Card title="Votos dados">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            {(["SIM", "NAO", "ABS", "OBS", "OUTRO"] as const).map((k) => (
              <div key={k} className="contents">
                <dt className="text-muted">{VOTE_LABEL[k]}</dt>
                <dd className="tabular-nums">{fmtNum(s.byVote[k] ?? 0)}</dd>
              </div>
            ))}
            <dt className="mt-2 text-muted">Acompanhou a orientação do Governo</dt>
            <dd className="mt-2 tabular-nums">
              {gov ? (
                <>
                  <strong>{pct(gov.same / gov.shared)}</strong> dos votos ({fmtNum(gov.shared)})
                </>
              ) : (
                "–"
              )}
            </dd>
          </dl>
          <p className="mt-2 text-xs text-muted">Câmara apenas; só votações com orientação clara do Governo.</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TopicSummary kind="partido" title="Apoia e rejeita, por tema" rows={topics} unit="votações em que a maioria do partido disse Sim / Não" />
        <NotableVotes title="Posições recentes de destaque" rows={notable} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BillList title="Apoiou recentemente (partido votou Sim, ≥80% unido)" bills={backed} />
        <BillList title="Rejeitou recentemente (partido votou Não, ≥80% unido)" bills={rejected} />
      </div>

      <ParticipacaoPartido sigla={party} />

      <Card title="Parlamentares">
        <ul className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <li key={m.id}>
              <Link className="hover:underline" href={`/membro/${m.id.replace(":", "-")}`}>
                {m.name} <span className="text-muted">{m.uf}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function BillList({
  title,
  bills,
}: {
  title: string;
  bills: { label: string | null; bill_id: string | null; ementa: string | null; date: string; result: string | null }[];
}) {
  return (
    <Card title={title}>
      <ul className="space-y-3 text-sm">
        {bills.map((b, i) => (
          <li key={i}>
            <div className="font-bold text-ink-strong">
              <BillLabel billId={b.bill_id} label={b.label} /> <span className="text-xs font-normal text-muted">{fmtData(b.date)}</span>
            </div>
            <div className="line-clamp-2 text-xs text-muted">{b.ementa}</div>
          </li>
        ))}
        {bills.length === 0 && <li className="text-muted">Nenhum ainda.</li>}
      </ul>
    </Card>
  );
}
