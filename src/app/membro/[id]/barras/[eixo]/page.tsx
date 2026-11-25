import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getMember, ivEvidence, memberIv } from "@/lib/queries";
import { eixoPorSlug } from "@/lib/eixos";
import { fmtData } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, PageTitle, Tag, VoteChip } from "@/components/ui";
import { BillLabel } from "@/components/bill-link";
import { VotacaoLink } from "@/components/votacao-link";

export default function EvidencePage(props: PageProps<"/membro/[id]/barras/[eixo]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Evidence params={props.params} />
    </Suspense>
  );
}

async function Evidence({ params }: Pick<PageProps<"/membro/[id]/barras/[eixo]">, "params">) {
  await connection();
  const { id: rawId, eixo: rawEixo } = await params;
  const eixo = eixoPorSlug(rawEixo);
  if (!eixo) notFound();
  const member = getMember(decodeURIComponent(rawId).replace("-", ":"));
  if (!member) notFound();

  const iv = memberIv(member.id);
  const rows = ivEvidence(member.id, eixo.key);
  // Em Estado/Mercado, mostra primeiro os votos que empurraram para o lado da barra, depois os do lado oposto.
  const wanted = eixo.key === "left" ? -1 : 1;
  const forBar = rows.filter((r) => (eixo.key === "privilege" ? r.push > 0 : r.push === wanted));
  const against = rows.filter((r) => !forBar.includes(r));
  const score = iv ? iv[eixo.key] : null;

  const list = (items: typeof rows) => (
    <ul className="divide-y divide-line-soft">
      {items.map((r) => (
        <li key={r.sv} className="flex items-start gap-3 py-2.5 text-sm">
          <VoteChip vote={r.vote} />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-ink-strong">
              <BillLabel billId={r.bill_id} label={r.bill_label} />
            </div>
            <div className="text-xs text-muted">{r.summary ?? r.description}</div>
            <div className="mt-0.5 text-xs text-muted">
              {fmtData(r.date)} · <VotacaoLink sv={r.sv} /> · um Sim aqui = {r.value > 0 ? "+" : ""}
              {r.value.toFixed(1).replace(".", ",")} · confiança {Math.round(r.confidence * 100)}% · {r.rationale}{" "}
              {r.source === "human" && <Tag className="bg-brand-soft text-brand">revisão humana</Tag>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { href: "/membros", label: "Parlamentares" },
          { href: `/membro/${rawId}`, label: member.name },
          { label: eixo.rotulo },
        ]}
      />
      <PageTitle sub={eixo.descricao}>
        {member.name} — {eixo.rotulo}: {score === null ? "sem nota" : Math.round(score)}
      </PageTitle>
      <Card
        title={
          eixo.key === "privilege"
            ? "Votos a favor de mais privilégios"
            : `Votos que empurraram ${eixo.key === "left" ? "para o Estado" : "para o mercado"}`
        }
      >
        {forBar.length ? list(forBar) : <p className="text-sm text-muted">Nenhum.</p>}
      </Card>
      <Card title={eixo.key === "privilege" ? "Votos contra mais privilégios" : "Votos que empurraram para o outro lado"}>
        {against.length ? list(against) : <p className="text-sm text-muted">Nenhum.</p>}
      </Card>
      <p className="text-xs text-muted">
        As marcações foram feitas com base em um roteiro escrito e podem estar erradas; cada uma mostra sua justificativa. Veja a
        página de metodologia.
      </p>
    </div>
  );
}
