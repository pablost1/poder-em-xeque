import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getProjeto, votacoesDoProjeto } from "@/lib/queries";
import { TOPIC_LABEL } from "@/lib/topics";
import { fmtData, fmtNum, plural } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, PageTitle, Tag, tableClass } from "@/components/ui";
import { BillLabel } from "@/components/bill-link";
import { votacaoSlug } from "@/components/votacao-link";
import Link from "next/link";

export default function ProjetoPage(props: PageProps<"/projeto/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Projeto params={props.params} />
    </Suspense>
  );
}

async function Projeto({ params }: Pick<PageProps<"/projeto/[id]">, "params">) {
  await connection();
  const { id: slug } = await params;
  const id = decodeURIComponent(slug).replace("-", ":");
  const p = getProjeto(id);
  if (!p) notFound();
  const votacoes = votacoesDoProjeto(id);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/busca", label: "Busca" }, { label: p.label }]} />
      <PageTitle sub={p.summary ?? undefined}>
        <BillLabel billId={p.id} label={p.label} />
      </PageTitle>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Tag className="bg-brand-soft text-brand">{p.chamber === "C" ? "Câmara dos Deputados" : "Senado Federal"}</Tag>
        {p.topic && <Tag>{TOPIC_LABEL[p.topic] ?? p.topic}</Tag>}
        <span className="text-muted">{plural(votacoes.length, "votação nominal", "votações nominais")}</span>
      </div>

      <Card title="Ementa">
        <p className="text-sm">{p.ementa ?? "Sem ementa."}</p>
        {p.keywords && <p className="mt-2 text-xs text-muted">Palavras-chave: {p.keywords}</p>}
      </Card>

      <Card title="Votações nominais deste projeto">
        <div className="overflow-x-auto">
          <table className={tableClass.table}>
            <thead className={tableClass.head}>
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">O que foi votado</th>
                <th className="px-3 py-2 text-right">Sim</th>
                <th className="px-3 py-2 text-right">Não</th>
                <th className="px-3 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody className={tableClass.body}>
              {votacoes.map((v) => (
                <tr key={v.id}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtData(v.date)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/votacao/${votacaoSlug(v.id)}`} className="line-clamp-2 hover:underline">
                      {v.description ?? "Votação"}
                    </Link>
                    {v.procedural === 1 && <Tag className="mt-1">procedimental</Tag>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(v.sim)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(v.nao)}</td>
                  <td className="px-3 py-2">
                    {v.result === "approved" ? "Aprovada" : v.result === "rejected" ? "Rejeitada" : <span className="text-muted">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
