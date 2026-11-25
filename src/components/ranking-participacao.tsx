import Link from "next/link";
import { LEG_ATUAL, rotuloLegislatura } from "@/lib/legislaturas";
import { listPartyAcronyms, listUfs, mediaDoRanking, rankingParticipacao } from "@/lib/queries";
import { fmtNum } from "@/lib/format";
import { faltouMaisNasImportantes } from "@/lib/presenca";
import { AusenciasSenado } from "@/components/ausencias-senado";
import { Card, buttonClass, inputClass, pct, tableClass } from "@/components/ui";

const PAGE = 25;

type Filtros = { casa?: "C" | "S"; partido?: string; uf?: string; ordem: "maior" | "menor"; pagina: number };

function href(f: Filtros, over: Partial<Filtros> = {}): string {
  const m = { ...f, ...over };
  const q = new URLSearchParams({ eixo: "participacao" });
  if (m.casa) q.set("casa", m.casa === "S" ? "senado" : "camara");
  if (m.partido) q.set("partido", m.partido);
  if (m.uf) q.set("uf", m.uf);
  if (m.ordem === "menor") q.set("ordem", "menor");
  if (m.pagina > 1) q.set("pagina", String(m.pagina));
  return `/rankings?${q}`;
}

/** Ranking de participação nas votações nominais da legislatura atual (aba "Participação" de /rankings). */
export function RankingParticipacao({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f: Filtros = {
    casa: s("casa") === "senado" ? "S" : s("casa") === "camara" ? "C" : undefined,
    partido: s("partido") || undefined,
    uf: s("uf") || undefined,
    ordem: s("ordem") === "menor" ? "menor" : "maior",
    pagina: Math.max(1, Number(s("pagina")) || 1),
  };
  const { rows, total } = rankingParticipacao({ chamber: f.casa, party: f.partido, uf: f.uf, ordem: f.ordem, limit: PAGE, offset: (f.pagina - 1) * PAGE }, LEG_ATUAL);
  const media = mediaDoRanking(LEG_ATUAL, f.casa);
  const inicio = (f.pagina - 1) * PAGE;
  return (
    <>
      <Card title="Participação nas votações nominais">
        <p className="text-sm text-muted">
          Parcela das votações nominais da {rotuloLegislatura(LEG_ATUAL)} em que a pessoa registrou voto, contando só os períodos em que
          estava em exercício. Licenças e suplência não contam contra.
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
          <li>Entram só quem está no cargo hoje, esteve em exercício em pelo menos 30% das votações da legislatura e não é da Mesa Diretora (que preside sessões).</li>
          <li>Não é uma nota de qualidade do trabalho: uma ausência pode ser justificada, e a Câmara não informa o motivo. Quem está em comissão ou em missão pode faltar ao Plenário sem faltar ao trabalho.</li>
          <li>A coluna Em votações importantes é a participação só nas votações classificadas com direção (Estado, Mercado ou privilégios). O aviso aparece quando ela é 15 pontos ou mais menor que a geral, com ao menos 20 votações assim.</li>
          <li>Participação é diferente de presença na sessão: quem está presente pode não votar. A presença nas sessões aparece na página de cada pessoa.</li>
          {media !== null && <li>Média {f.casa === "S" ? "do Senado" : f.casa === "C" ? "da Câmara" : "geral"}: <strong className="text-ink">{pct(media)}</strong>.</li>}
        </ul>
      </Card>

      {f.casa === "S" && <AusenciasSenado />}

      <form className="flex flex-wrap items-end gap-2 text-xs" action="/rankings">
        <input type="hidden" name="eixo" value="participacao" />
        <label className="grid gap-1 font-semibold">
          Casa
          <select name="casa" defaultValue={s("casa") ?? ""} className={inputClass}>
            <option value="">Deputados e senadores</option>
            <option value="camara">Câmara</option>
            <option value="senado">Senado</option>
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Partido
          <select name="partido" defaultValue={f.partido ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {listPartyAcronyms().map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          UF
          <select name="uf" defaultValue={f.uf ?? ""} className={inputClass}>
            <option value="">Todas</option>
            {listUfs().map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Ordem
          <select name="ordem" defaultValue={f.ordem} className={inputClass}>
            <option value="maior">Maior participação primeiro</option>
            <option value="menor">Menor participação primeiro</option>
          </select>
        </label>
        <button className={buttonClass.primary}>Filtrar</button>
      </form>

      <p className="text-xs text-muted">
        {fmtNum(total)} parlamentares no ranking, ordenados da {f.ordem === "maior" ? "maior para a menor" : "menor para a maior"} participação.
      </p>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className={tableClass.table}>
          <thead className={tableClass.head}>
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Parlamentar</th>
              <th className="px-3 py-2">Partido</th>
              <th className="px-3 py-2">UF</th>
              <th className="px-3 py-2 text-right">Votou</th>
              <th className="px-3 py-2 text-right">Participação</th>
              <th className="px-3 py-2 text-right">Em votações importantes</th>
              <th className="px-3 py-2 text-right">Presença nas sessões</th>
            </tr>
          </thead>
          <tbody className={tableClass.body}>
            {rows.map((r, i) => (
              <tr key={r.member_id}>
                <td className="px-3 py-2 tabular-nums text-muted">{inicio + i + 1}</td>
                <td className="px-3 py-2 font-bold">
                  <Link href={`/membro/${r.member_id.replace(":", "-")}/participacao`}>{r.name}</Link>
                </td>
                <td className="px-3 py-2">{r.party ?? "–"}</td>
                <td className="px-3 py-2">{r.uf ?? "–"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtNum(r.votou)} <span className="text-xs text-muted">de {fmtNum(r.votacoes)}</span>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{pct(r.taxa)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.importantes ? pct((r.importantes_votou ?? 0) / r.importantes) : "–"}
                  {faltouMaisNasImportantes(r.taxa, r.importantes ? (r.importantes_votou ?? 0) / r.importantes : null, r.importantes ?? 0) && (
                    <span className="block text-xs text-ink-strong" title="Participação nas votações importantes pelo menos 15 pontos abaixo da geral">falta mais nas importantes</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{r.sessoes ? pct(r.sessoes_presente / r.sessoes) : "–"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-muted">
                  Ninguém com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm font-semibold">
        {f.pagina > 1 ? <Link href={href(f, { pagina: f.pagina - 1 })}>← Anterior</Link> : <span />}
        {f.pagina * PAGE < total && <Link href={href(f, { pagina: f.pagina + 1 })}>Próxima →</Link>}
      </div>
    </>
  );
}
