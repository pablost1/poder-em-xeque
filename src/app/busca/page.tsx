import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import { buscarParlamentares, buscarParlamentaresTodos, buscarProjetos, taxasDeParticipacao } from "@/lib/queries";
import { LEG_ATUAL } from "@/lib/legislaturas";
import { LinkParticipacao } from "@/components/link-participacao";
import { TOPIC_LABEL } from "@/lib/topics";
import { fmtData, plural } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, PageTitle, Tag, buttonClass, inputClass } from "@/components/ui";
import { projetoSlug } from "@/components/votacao-link";
import { ExParlamentarTag, VigenteToggle, lerVigente } from "@/components/legislatura-vigente";

export const metadata = { title: "Busca — Poder em Xeque" };

export default function BuscaPage(props: PageProps<"/busca">) {
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Busca" }]} />
      <PageTitle sub="Procure projetos por palavra (número, assunto, trecho da ementa) e parlamentares pelo nome. A busca ignora acentos.">
        Busca
      </PageTitle>
      <Suspense fallback={<PageSkeleton />}>
        <Resultados searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Resultados({ searchParams }: Pick<PageProps<"/busca">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const q = s("q");
  const tema = s("tema");
  const casa = s("casa") === "camara" ? "C" : s("casa") === "senado" ? "S" : undefined;
  const ano = s("ano");

  const projetos = q ? buscarProjetos(q, { topic: tema || undefined, casa, ano: ano || undefined, limit: 40 }) : [];
  const vigente = lerVigente(sp.vigente);
  const parlamentares: { id: string; name: string; chamber: string; party: string | null; uf: string | null; photo_url: string | null; atual?: number; ultima_leg?: number | null; ultimo_voto?: string | null }[] =
    q ? (vigente ? buscarParlamentares(q, 20) : buscarParlamentaresTodos(q, 20)) : [];
  const taxas = taxasDeParticipacao(parlamentares.map((m) => m.id), LEG_ATUAL);

  return (
    <>
      <form className="flex flex-wrap items-end gap-2 text-xs">
        <label className="grid gap-1 font-semibold">
          Buscar
          <input name="q" defaultValue={q} placeholder="ex.: reforma tributária, PEC 45, Bacelar" className={`${inputClass} w-72`} autoFocus={!q} />
        </label>
        <label className="grid gap-1 font-semibold">
          Tema
          <select name="tema" defaultValue={tema} className={inputClass}>
            <option value="">Todos</option>
            {Object.entries(TOPIC_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Casa
          <select name="casa" defaultValue={s("casa")} className={inputClass}>
            <option value="">Câmara e Senado</option>
            <option value="camara">Câmara</option>
            <option value="senado">Senado</option>
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Ano do projeto
          <input name="ano" defaultValue={ano} placeholder="2024" inputMode="numeric" maxLength={4} className={`${inputClass} w-24`} />
        </label>
        <button className={buttonClass.primary}>Buscar</button>
        <div className="flex basis-full items-center">
          <VigenteToggle vigente={vigente} />
        </div>
      </form>

      {!q && <p className="text-sm text-muted">Digite uma palavra para começar.</p>}

      {q && (
        <>
          <Card title={`Projetos (${projetos.length}${projetos.length === 40 ? "+" : ""})`}>
            {projetos.length === 0 ? (
              <p className="text-sm text-muted">Nenhum projeto com votação nominal encontrado.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {projetos.map((p) => (
                  <li key={p.bill_id} className="py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/projeto/${projetoSlug(p.bill_id)}`} className="font-bold">
                        {p.label}
                      </Link>
                      {p.topic && <Tag>{TOPIC_LABEL[p.topic] ?? p.topic}</Tag>}
                      <span className="text-xs text-muted">
                        {p.bill_id.startsWith("C:") ? "Câmara" : "Senado"} · {plural(p.votacoes, "votação", "votações")}
                        {p.ultima && <> · última em {fmtData(p.ultima)}</>}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{p.summary || p.ementa}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Parlamentares (${parlamentares.length})`}>
            {parlamentares.length === 0 ? (
              <p className="text-sm text-muted">Nenhum parlamentar encontrado.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {parlamentares.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/membro/${m.id.replace(":", "-")}`}
                      className="flex items-center gap-3 rounded-md border border-line p-2 text-ink hover:border-brand"
                    >
                      {m.photo_url ? (
                        <Image src={m.photo_url} alt="" width={32} height={42} unoptimized className="h-[42px] w-8 rounded object-cover" />
                      ) : (
                        <span className="h-[42px] w-8 rounded bg-surface-2" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink-strong">{m.name}</span>
                        <span className="text-xs text-muted">
                          {m.chamber === "C" ? "Deputado(a)" : "Senador(a)"} · {m.party ?? "–"} · {m.uf ?? "–"}
                        </span>
                        {m.atual === 0 && (
                          <span className="mt-0.5 block">
                            <ExParlamentarTag ultimaLeg={m.ultima_leg ?? null} ultimoVoto={m.ultimo_voto} />
                          </span>
                        )}
                      </span>
                    </Link>
                    <div className="px-1 pt-1">
                      <LinkParticipacao memberId={m.id} legislatura={m.atual === 0 ? (m.ultima_leg ?? undefined) : undefined} taxa={m.atual === 0 && m.ultima_leg && m.ultima_leg !== LEG_ATUAL ? null : taxas.get(m.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
