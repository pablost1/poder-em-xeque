import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { listParties } from "@/lib/queries";
import { fmtNum } from "@/lib/format";
import { NotaLegislatura } from "@/components/legislatura-vigente";
import { Breadcrumb, PageSkeleton, PageTitle, pct, tableClass } from "@/components/ui";

export const metadata = { title: "Partidos — Poder em Xeque" };

export default function PartiesPage() {
  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Partidos" }]} />
      <PageTitle
        sub={
          <>
            <strong>Coesão</strong> é a parcela média dos votantes de um partido que acompanhou a maioria do próprio partido, em
            todas as votações nominais.
          </>
        }
      >
        Partidos
      </PageTitle>
      <NotaLegislatura />
      <Suspense fallback={<PageSkeleton />}>
        <PartyTable />
      </Suspense>
    </div>
  );
}

async function PartyTable() {
  await connection();
  const parties = listParties();
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className={tableClass.table}>
        <thead className={tableClass.head}>
          <tr>
            <th className="px-4 py-2.5">Partido</th>
            <th className="px-4 py-2.5 text-right">Parlamentares</th>
            <th className="px-4 py-2.5 text-right">Votos dados</th>
            <th className="px-4 py-2.5 text-right">Coesão</th>
            <th className="px-4 py-2.5 text-right" title="Parcela dos votos dos parlamentares do partido que acompanharam a orientação do Governo (Câmara)">
              Com o Governo
            </th>
          </tr>
        </thead>
        <tbody className={tableClass.body}>
          {parties.map((p) => (
            <tr key={p.party}>
              <td className="px-4 py-2.5">
                <Link className="font-bold" href={`/partido/${encodeURIComponent(p.party)}`}>
                  {p.party}
                </Link>
                <Link className="ml-2 text-xs" href={`/rankings?eixo=participacao&partido=${encodeURIComponent(p.party)}`}>
                  participação
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(p.members)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(p.votes)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{pct(p.cohesion)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{pct(p.governo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
