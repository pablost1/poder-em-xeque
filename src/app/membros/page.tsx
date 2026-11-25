import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import { listMembers, listMembersTodos, taxasDeParticipacao, type MemberHistorico } from "@/lib/queries";
import { LEG_ATUAL } from "@/lib/legislaturas";
import { LinkParticipacao } from "@/components/link-participacao";
import { fmtNum, plural } from "@/lib/format";
import { Breadcrumb, PageSkeleton, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { ExParlamentarTag, VigenteToggle, lerVigente } from "@/components/legislatura-vigente";

export const metadata = { title: "Parlamentares — Poder em Xeque" };

export default function MembersPage(props: PageProps<"/membros">) {
  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Parlamentares" }]} />
      <PageTitle>Parlamentares</PageTitle>
      <Suspense fallback={<PageSkeleton />}>
        <MemberList searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function MemberList({ searchParams }: Pick<PageProps<"/membros">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const party = typeof sp.partido === "string" ? sp.partido : undefined;
  const chamber = typeof sp.casa === "string" ? sp.casa : undefined;
  const vigente = lerVigente(sp.vigente);
  const members: (Omit<MemberHistorico, "atual" | "ultima_leg" | "ultimo_voto"> & { atual?: number; ultima_leg?: number | null; ultimo_voto?: string | null })[] = vigente
    ? listMembers({ q, party, chamber })
    : listMembersTodos({ q, party, chamber });
  const taxas = taxasDeParticipacao(members.map((m) => m.id), LEG_ATUAL);
  return (
    <>
      <form className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="f-q">
          Nome
        </label>
        <input id="f-q" name="q" defaultValue={q} placeholder="Nome…" className={inputClass} />
        <label className="sr-only" htmlFor="f-party">
          Partido
        </label>
        <input id="f-party" name="partido" defaultValue={party} placeholder="Partido (ex.: PT)" className={`${inputClass} w-44`} />
        <label className="sr-only" htmlFor="f-chamber">
          Casa
        </label>
        <select id="f-chamber" name="casa" defaultValue={chamber ?? ""} className={inputClass}>
          <option value="">Deputados e senadores</option>
          <option value="C">Deputados federais</option>
          <option value="S">Senadores</option>
        </select>
        <button className={buttonClass.primary}>Filtrar</button>
        <div className="flex basis-full items-center">
          <VigenteToggle vigente={vigente} />
        </div>
      </form>
      <p className="text-xs text-muted">
        {members.length === 200 ? "Mostrando os 200 primeiros resultados." : plural(members.length, "resultado")}
        {vigente ? ". Só parlamentares em exercício na legislatura atual." : ". Inclui parlamentares de legislaturas anteriores, marcados como ex-parlamentar."}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <li key={m.id}>
            <Link
              href={`/membro/${m.id.replace(":", "-")}`}
              className="flex items-center gap-3 rounded-md border border-line bg-surface p-3 text-ink hover:border-brand"
            >
              {m.photo_url ? (
                <Image src={m.photo_url} alt="" width={44} height={56} unoptimized className="h-14 w-11 rounded object-cover" />
              ) : (
                <div className="h-14 w-11 rounded bg-surface-2" />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink-strong">{m.name}</div>
                <div className="text-xs text-muted">
                  {m.chamber === "C" ? "Deputado(a)" : "Senador(a)"} · {m.party ?? "–"} · {m.uf ?? "–"} · {fmtNum(m.votes)} votos
                </div>
                {m.atual === 0 && <ExParlamentarTag ultimaLeg={m.ultima_leg ?? null} ultimoVoto={m.ultimo_voto} />}
              </div>
            </Link>
            <div className="px-1 pt-1">
              <LinkParticipacao memberId={m.id} legislatura={m.atual === 0 ? (m.ultima_leg ?? undefined) : undefined} taxa={m.atual === 0 && m.ultima_leg && m.ultima_leg !== LEG_ATUAL ? null : taxas.get(m.id)} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
