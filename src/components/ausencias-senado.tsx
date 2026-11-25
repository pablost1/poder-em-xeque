import Link from "next/link";
import { LEG_ATUAL, rotuloLegislatura } from "@/lib/legislaturas";
import { ausenciasSenadoPorMotivo } from "@/lib/queries";
import { fmtNum } from "@/lib/format";
import { Card, pct } from "@/components/ui";

/** Ausências dos senadores por motivo oficial (aba Participação do ranking, quando a casa é o Senado). */
export function AusenciasSenado() {
  const motivos = ausenciasSenadoPorMotivo(LEG_ATUAL);
  if (!motivos.length) return null;
  const principais = motivos.slice(0, 4);
  return (
    <Card title="Ausências no Senado, por motivo oficial">
      <p className="text-sm text-muted">
        O Senado registra o motivo de cada ausência nas votações da {rotuloLegislatura(LEG_ATUAL)}. Uma ausência justificada (atividade parlamentar, missão, licença) não é falta de trabalho.
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody className="divide-y divide-line-soft">
          {motivos.map((m) => (
            <tr key={m.descricao}>
              <td className="py-1.5 pr-3">{m.descricao}</td>
              <td className="py-1.5 text-right tabular-nums">{fmtNum(m.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {principais.map((m) => (
          <div key={m.descricao}>
            <p className="text-xs font-semibold uppercase text-muted">Mais ausências: {m.descricao}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {m.senadores.map((s) => (
                <li key={s.member_id} className="flex justify-between gap-2">
                  <Link href={`/membro/${s.member_id.replace(":", "-")}/participacao`}>{s.name}</Link>
                  <span className="tabular-nums">
                    {fmtNum(s.n)} <span className="text-xs text-muted">({s.votacoes ? pct(s.n / s.votacoes) : "–"})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
