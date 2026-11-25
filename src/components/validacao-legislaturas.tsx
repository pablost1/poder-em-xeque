import { connection } from "next/server";
import { validacaoLegislaturas } from "@/lib/queries";
import { fmtRho } from "@/lib/validacao";
import { rotuloLegislatura } from "@/lib/legislaturas";
import { fmtNum } from "@/lib/format";
import { NivelValidacao } from "@/components/nivel-validacao";
import { tableClass } from "@/components/ui";

function Tabela({ casa, titulo }: { casa: "C" | "S"; titulo: string }) {
  const linhas = validacaoLegislaturas(casa);
  if (!linhas.length) return null;
  return (
    <div className="mt-3">
      <h4 className="font-semibold text-ink-strong">{titulo}</h4>
      <div className="overflow-x-auto">
        <table className={tableClass.table}>
          <thead className={tableClass.head}>
            <tr>
              <th className="px-2 py-2">Legislatura</th>
              <th className="px-2 py-2 text-right">Pessoas no mapa</th>
              <th className="px-2 py-2 text-right">Votações</th>
              <th className="px-2 py-2 text-right">Estado × mapa</th>
              <th className="px-2 py-2 text-right">Partidos × mapa</th>
              <th className="px-2 py-2 text-right">Privilégios × mapa</th>
              {casa === "C" && <th className="px-2 py-2 text-right">Governo × mapa</th>}
              <th className="px-2 py-2">Leitura</th>
            </tr>
          </thead>
          <tbody className={tableClass.body}>
            {linhas.map((l) => (
              <tr key={l.legislatura}>
                <td className="px-2 py-2 font-semibold">{rotuloLegislatura(l.legislatura, true)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtNum(l.membros)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtNum(l.votacoes)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtRho(l.estado_d1)}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtRho(l.partidos_estado_d1)} <span className="text-xs text-muted">({l.n_partidos})</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtRho(l.privilegio_d1)}</td>
                {casa === "C" && <td className="px-2 py-2 text-right tabular-nums">{fmtRho(l.governo_d1)}</td>}
                <td className="px-2 py-2">
                  <NivelValidacao rho={l.estado_d1} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Teste independente por legislatura: o perfil de Estado contra o mapa de votos (que não usa marcação nenhuma). */
export async function ValidacaoLegislaturas() {
  await connection();
  if (!validacaoLegislaturas("C").length) return null;
  return (
    <div className="rounded-md border border-line bg-surface p-4 text-sm">
      <h3 className="font-bold text-ink-strong">Teste independente, legislatura por legislatura</h3>
      <p className="mt-2">
        O mapa de votos posiciona cada parlamentar só pelos votos dados, sem usar nenhuma marcação nossa, com o PL do lado
        positivo e o PT do negativo. Se o perfil de Estado faz sentido, quem aparece com mais Estado deve ficar do lado do PT, ou seja,
        a correlação (Spearman) deve ser <strong>negativa</strong>. É uma checagem independente das marcações, não uma prova de que
        estão certas.
      </p>
      <Tabela casa="C" titulo="Câmara dos Deputados" />
      <Tabela casa="S" titulo="Senado Federal" />
      <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted">
        <li>
          Na <strong className="text-ink">55ª, 56ª e 57ª</strong> a concordância é boa na Câmara. Nelas a coluna &quot;Governo × mapa&quot; mostra
          que a divisão dos votos também acompanha a orientação do Governo.
        </li>
        <li>
          Na <strong className="text-ink">52ª, 53ª e 54ª</strong> a primeira dimensão do mapa é, sobretudo, governo contra oposição (a coluna
          &quot;Governo × mapa&quot; fica perto de −0,9): o PT e seus aliados de um lado, PSDB, DEM e PPS do outro. Nessas legislaturas
          o perfil de Estado quase não se relaciona com essa divisão. Isso pode vir da pauta da época (o Governo também propunha medidas
          pró-mercado) e não de erro nas marcações, mas nós não sabemos separar as duas coisas. Por isso a tela História avisa.
        </li>
        <li>No Senado há poucos partidos com pessoas suficientes (4 a 7 por legislatura), então a correlação entre partidos é instável.</li>
        <li>
          A correlação de Privilégios com o mapa fica perto de zero em quase todas as legislaturas, o que é esperado: privilégio de políticos
          não é uma questão de esquerda e direita.
        </li>
      </ul>
    </div>
  );
}
