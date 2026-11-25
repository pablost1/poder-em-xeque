import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import { listarMandatos, partidosDosMandatos, taxasDeParticipacao } from "@/lib/queries";
import { LinkParticipacao } from "@/components/link-participacao";
import { NATUREZA_INFO, NATUREZAS_DESFECHO } from "@/lib/mandato";
import { LEG_ATUAL, legislaturasDoHistorico, lerLegislatura, rotuloLegislatura } from "@/lib/legislaturas";
import { fmtData, fmtNum, plural } from "@/lib/format";
import { Breadcrumb, PageSkeleton, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { CondicaoMandato, NaturezaMandato } from "@/components/natureza-mandato";

export const metadata = { title: "Mandatos — Poder em Xeque" };
const PAGE = 50;

export default function MandatosPage(props: PageProps<"/mandatos">) {
  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Mandatos" }]} />
      <PageTitle sub="Consulte mandatos de qualquer legislatura desde 2003: um mandato é uma pessoa numa legislatura. Cada um mostra como terminou, o partido da época e quantos votos teve.">
        Mandatos
      </PageTitle>
      <Suspense fallback={<PageSkeleton />}>
        <Lista searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Lista({ searchParams }: Pick<PageProps<"/mandatos">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const leg = lerLegislatura(s("leg") || undefined);
  const casa = s("casa") === "C" || s("casa") === "S" ? s("casa") : undefined;
  const partido = s("partido") || undefined;
  const natureza = s("natureza") || undefined;
  const condicao = s("condicao") || undefined;
  const q = s("q") || undefined;
  const pagina = Math.max(1, Number(s("pagina")) || 1);
  const { total, rows } = listarMandatos({ legislatura: leg, chamber: casa, partido, natureza, condicao, q, limit: PAGE, offset: (pagina - 1) * PAGE });
  const partidos = partidosDosMandatos();
  const link = (p: number) => `/mandatos?${new URLSearchParams({ leg: leg ? String(leg) : "todas", ...(casa ? { casa } : {}), ...(partido ? { partido } : {}), ...(natureza ? { natureza } : {}), ...(condicao ? { condicao } : {}), ...(q ? { q } : {}), pagina: String(p) })}`;

  return (
    <>
      <form className="flex flex-wrap items-end gap-2 text-xs">
        <label className="grid gap-1 font-semibold">
          Legislatura
          <select name="leg" defaultValue={leg ? String(leg) : "todas"} className={inputClass}>
            <option value="todas">Todas</option>
            {legislaturasDoHistorico().map((n) => (
              <option key={n} value={n}>
                {rotuloLegislatura(n, true)}
                {n === LEG_ATUAL ? " · atual" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Casa
          <select name="casa" defaultValue={casa ?? ""} className={inputClass}>
            <option value="">Deputados e senadores</option>
            <option value="C">Deputados federais</option>
            <option value="S">Senadores</option>
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Partido (linhagem)
          <select name="partido" defaultValue={partido ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {partidos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Como terminou
          <select name="natureza" defaultValue={natureza ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {NATUREZAS_DESFECHO.map((k) => (
              <option key={k} value={k}>
                {NATUREZA_INFO[k].rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Condição
          <select name="condicao" defaultValue={condicao ?? ""} className={inputClass}>
            <option value="">Titular ou suplente</option>
            <option value="Titular">Titular</option>
            <option value="Suplente">Suplente</option>
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Nome
          <input name="q" defaultValue={q} placeholder="Nome…" className={`${inputClass} w-44`} />
        </label>
        <button className={buttonClass.primary}>Filtrar</button>
      </form>

      <p className="text-xs text-muted">
        {leg ? `Mostrando a ${rotuloLegislatura(leg)}${leg === LEG_ATUAL ? ", a legislatura atual (escolha \"Todas\" para ver o histórico)" : ""}. ` : "Mostrando todas as legislaturas. "}
        {plural(total, "mandato")}
        {total > PAGE ? `, mostrando ${fmtNum((pagina - 1) * PAGE + 1)} a ${fmtNum(Math.min(pagina * PAGE, total))}` : ""}. A natureza do mandato vem do motivo
        registrado na fonte oficial; veja a <Link href="/metodologia">metodologia</Link>.
      </p>

      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((m) => (
          <li key={`${m.member_id}-${m.legislatura}`}>
            <Link
              href={`/membro/${m.member_id.replace(":", "-")}/mandato/${m.legislatura}`}
              className="flex items-start gap-3 rounded-md border border-line bg-surface p-3 text-ink hover:border-brand"
            >
              {m.photo_url ? (
                <Image src={m.photo_url} alt="" width={44} height={56} unoptimized className="h-14 w-11 shrink-0 rounded object-cover" />
              ) : (
                <div className="h-14 w-11 shrink-0 rounded bg-surface-2" />
              )}
              <div className="min-w-0 space-y-1">
                <div className="truncate text-sm font-bold text-ink-strong">{m.name}</div>
                <div className="text-xs text-muted">
                  {rotuloLegislatura(m.legislatura, true)} · {m.chamber === "C" ? "Deputado(a)" : "Senador(a)"} · {m.partido_sigla ?? "–"}
                  {m.partido && m.partido_sigla && m.partido !== m.partido_sigla ? ` (hoje ${m.partido})` : ""} · {fmtNum(m.votos)} votos
                </div>
                {m.primeira && (
                  <div className="text-xs text-muted">
                    votos de {fmtData(m.primeira)} a {fmtData(m.ultima)}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <NaturezaMandato natureza={m.natureza} motivo={m.motivo} />
                  <CondicaoMandato condicao={m.condicao} />
                </div>
              </div>
            </Link>
            <div className="px-1 pt-1">
              <LinkParticipacao memberId={m.member_id} legislatura={m.legislatura} taxa={taxasDeParticipacao([m.member_id], m.legislatura).get(m.member_id)} />
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-muted">Nenhum mandato com esses filtros.</li>}
      </ul>
      <div className="flex justify-between text-sm font-semibold">
        {pagina > 1 ? <Link href={link(pagina - 1)}>← Anteriores</Link> : <span />}
        {pagina * PAGE < total && <Link href={link(pagina + 1)}>Próximos →</Link>}
      </div>
    </>
  );
}
