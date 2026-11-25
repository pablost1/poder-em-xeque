import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { contarDivergencias, reviewDivergencias, reviewQueue, votosPesados, type DivergenciaRow, type PesadaRow, type ReviewRow } from "@/lib/queries";
import { LEG_ATUAL, legislaturasDoHistorico, lerLegislatura, rotuloLegislatura } from "@/lib/legislaturas";
import { fmtNum } from "@/lib/format";
import { fmtData } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, PageTitle, Tag, buttonClass, inputClass } from "@/components/ui";
import { saveTag } from "./actions";
import { BillLabel } from "@/components/bill-link";

export const metadata = { title: "Revisar marcações — Poder em Xeque", robots: { index: false } };

const PAGE = 20;

export default function ReviewPage(props: PageProps<"/revisar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Review searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Review({ searchParams }: Pick<PageProps<"/revisar">, "searchParams">) {
  await connection();
  // Só disponível quando o servidor é iniciado localmente com ADMIN=1; o site público é somente leitura.
  if (process.env.ADMIN !== "1") notFound();
  const sp = await searchParams;
  const kind: "strong" | "uncertain" | "diverge" | "heavy" =
    sp.tipo === "fortes" ? "strong" : sp.tipo === "divergencias" ? "diverge" : sp.tipo === "pesados" ? "heavy" : "uncertain";
  const leg = lerLegislatura(typeof sp.legislatura === "string" ? sp.legislatura : undefined) ?? LEG_ATUAL;
  const nDiverg = contarDivergencias();
  const page = Math.max(1, Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1);
  const rows: (ReviewRow & Partial<DivergenciaRow> & Partial<PesadaRow>)[] =
    kind === "diverge"
      ? reviewDivergencias(PAGE + 1, (page - 1) * PAGE)
      : kind === "heavy"
        ? votosPesados(leg, PAGE + 1, (page - 1) * PAGE)
        : reviewQueue(kind, PAGE + 1, (page - 1) * PAGE);
  const shown = rows.slice(0, PAGE);
  const q = (k: "strong" | "uncertain" | "diverge" | "heavy", p: number, l = leg) =>
    `/revisar?tipo=${k === "strong" ? "fortes" : k === "diverge" ? "divergencias" : k === "heavy" ? "pesados" : "incertas"}&pagina=${p}${k === "heavy" ? `&legislatura=${l}` : ""}`;

  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Revisar marcações" }]} />
      <PageTitle sub="Corrija como um voto Sim foi marcado. As marcações humanas têm prioridade e o perfil de votação é recalculado ao salvar.">
        Revisar marcações
      </PageTitle>
      <div className="flex gap-2 text-sm font-semibold">
        {(["uncertain", "strong", "diverge", "heavy"] as const).map((k) => (
          <Link
            key={k}
            href={q(k, 1)}
            className={`rounded-full border px-4 py-1.5 ${
              kind === k ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"
            }`}
          >
            {k === "uncertain" ? "Baixa confiança" : k === "strong" ? "Afirmações fortes" : k === "heavy" ? "Mais pesadas" : `Divergências (${nDiverg})`}
          </Link>
        ))}
      </div>

      {kind === "heavy" && (
        <div className="space-y-2 text-xs">
          <p className="text-muted">
            As votações classificadas com direção que mais pesam nas barras desta legislatura (marcação × confiança × número de votantes). Uma
            marcação errada numa delas muda as barras de centenas de pessoas, então vale conferir estas primeiro. A correção vale para a
            legislatura que você escolher e recalcula os perfis.
          </p>
          <div className="flex flex-wrap gap-2 font-semibold">
            {legislaturasDoHistorico().map((n) => (
              <Link key={n} href={q("heavy", 1, n)} className={`rounded-full border px-3 py-1 ${n === leg ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"}`}>
                {rotuloLegislatura(n, true)}
              </Link>
            ))}
          </div>
        </div>
      )}

      {shown.map((r) => (
        <Card key={r.sv}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink-strong">
              <BillLabel billId={r.bill_id} label={r.bill_label} fallback={r.sv} />
            </span>
            <Tag className={r.source === "human" ? "bg-brand-soft text-brand" : undefined}>
              {r.source === "human" ? "humana" : "automática"}
            </Tag>
            <span className="text-xs text-muted">{fmtData(r.date)}</span>
            {r.influencia !== undefined && (
              <span className="text-xs text-muted">
                · {fmtNum(r.votantes ?? 0)} votantes Sim/Não · influência {fmtNum(Math.round(r.influencia))}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">{r.summary}</p>
          <p className="mb-3 text-xs text-muted">{r.description}</p>
          {r.kind && (
            <div className="mb-3 rounded border border-line bg-surface-2 p-3 text-xs">
              <p className="font-bold text-ink-strong">
                As duas marcações discordam ({r.kind === "sinal-oposto" ? "direção oposta" : "uma vê direção forte e a outra não"})
              </p>
              <p className="mt-1">
                <strong>Atual:</strong> econômico {r.economic}, privilégio {r.privilege}, confiança {r.confidence}. {r.rationale}
              </p>
              <p className="mt-1">
                <strong>Segunda marcação (às cegas):</strong> econômico {r.e_b}, privilégio {r.p_b}, confiança {r.c_b}. {r.why_b}
              </p>
              <form action={saveTag} className="mt-2">
                <input type="hidden" name="sv" value={r.sv} />
                <input type="hidden" name="economic" value={r.e_b} />
                <input type="hidden" name="privilege" value={r.p_b} />
                <input type="hidden" name="confidence" value={r.c_b} />
                <input type="hidden" name="rationale" value={`Revisão humana: adotada a segunda marcação. ${r.why_b ?? ""}`.slice(0, 280)} />
                <button className={buttonClass.secondary}>Usar a segunda marcação</button>
              </form>
            </div>
          )}
          <form action={saveTag} className="flex flex-wrap items-end gap-3 text-xs">
            <input type="hidden" name="sv" value={r.sv} />
            <label className="grid gap-1">
              econômico (−1…1)
              <input name="economic" type="number" step="0.1" min="-1" max="1" defaultValue={r.economic} className={`${inputClass} w-24`} />
            </label>
            <label className="grid gap-1">
              privilégio (−1…1)
              <input name="privilege" type="number" step="0.1" min="-1" max="1" defaultValue={r.privilege} className={`${inputClass} w-24`} />
            </label>
            <label className="grid gap-1">
              confiança (0…1)
              <input name="confidence" type="number" step="0.1" min="0" max="1" defaultValue={r.confidence} className={`${inputClass} w-24`} />
            </label>
            <label className="flex items-center gap-1.5 pb-2">
              <input name="procedural" type="checkbox" defaultChecked={r.procedural === 1} /> procedimental
            </label>
            <label className="grid min-w-48 flex-1 gap-1">
              justificativa
              <input name="rationale" defaultValue={r.rationale ?? ""} className={inputClass} />
            </label>
            <button className={buttonClass.primary}>Salvar</button>
          </form>
        </Card>
      ))}
      {shown.length === 0 && <p className="text-sm text-muted">Nada para revisar aqui.</p>}
      <div className="flex justify-between text-sm font-semibold">
        {page > 1 ? <Link href={q(kind, page - 1)}>← Anterior</Link> : <span />}
        {rows.length > PAGE && <Link href={q(kind, page + 1)}>Próxima →</Link>}
      </div>
    </div>
  );
}
