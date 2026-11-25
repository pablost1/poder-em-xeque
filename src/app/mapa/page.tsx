import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { mapaMeta, mapaPontos, validacao } from "@/lib/queries";
import { fmtNum, fmtPct } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, PageTitle, Tag } from "@/components/ui";

export const metadata = { title: "Mapa de votos — Poder em Xeque" };

const W = 880;
const H = 560;
const PAD = 40;

export default function MapaPage(props: PageProps<"/mapa">) {
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Mapa de votos" }]} />
      <PageTitle sub="Cada ponto é um parlamentar. Quem vota parecido fica perto. A posição vem só dos votos, sem nenhuma marcação feita por nós.">
        Mapa de votos
      </PageTitle>
      <Suspense fallback={<PageSkeleton />}>
        <Mapa searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

/** Um matiz por partido, em ordem de tamanho, espaçados para ficarem distintos; a luminosidade vem do tema. */
function corDoPartido(ordem: string[], party: string | null): string {
  const i = party ? ordem.indexOf(party) : -1;
  if (i < 0) return "var(--muted)";
  return `hsl(${(i * 137.5) % 360} 72% var(--map-l))`;
}

function rho(v: { valor: number | null } | undefined): string {
  return v && v.valor !== null ? v.valor.toFixed(2).replace(".", ",").replace("-", "−") : "–";
}

async function Mapa({ searchParams }: Pick<PageProps<"/mapa">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const ch: "C" | "S" = s("casa") === "senado" ? "S" : "C";
  const destaque = s("partido");
  const membro = s("membro")?.replace("-", ":");

  const pontos = mapaPontos(ch);
  const meta = mapaMeta(ch);
  const val = validacao();
  if (!meta || pontos.length === 0) return <p className="text-sm text-muted">O mapa ainda não foi calculado. Rode npm run derive.</p>;

  // escala igual nos dois eixos, para que distâncias sejam comparáveis
  const xs = pontos.map((p) => p.d1);
  const ys = pontos.map((p) => p.d2);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const escala = Math.min((W - 2 * PAD) / (x1 - x0 || 1), (H - 2 * PAD) / (y1 - y0 || 1));
  const cx = (x: number) => W / 2 + (x - (x0 + x1) / 2) * escala;
  const cy = (y: number) => H / 2 - (y - (y0 + y1) / 2) * escala; // y para cima

  const contagem = new Map<string, number>();
  for (const p of pontos) if (p.party) contagem.set(p.party, (contagem.get(p.party) ?? 0) + 1);
  const ordem = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const href = (o: { casa?: string; partido?: string | null }) => {
    const q = new URLSearchParams();
    const casa = o.casa ?? (ch === "S" ? "senado" : "");
    if (casa) q.set("casa", casa);
    if (o.partido) q.set("partido", o.partido);
    const t = q.toString();
    return `/mapa${t ? `?${t}` : ""}`;
  };
  const alvo = membro ? pontos.find((p) => p.id === membro) : undefined;
  const k = ch === "C" ? "C" : "S";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="text-muted">Casa:</span>
        {(
          [
            ["C", "Câmara", ""],
            ["S", "Senado", "senado"],
          ] as const
        ).map(([v, label, casa]) => (
          <Link
            key={v}
            href={href({ casa, partido: null })}
            className={`rounded-full border px-3 py-1 ${
              ch === v ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"
            }`}
          >
            {label}
          </Link>
        ))}
        {destaque && (
          <Link href={href({ partido: null })} className="ml-2">
            Limpar destaque ({destaque})
          </Link>
        )}
      </div>

      <Card>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mapa de votos da ${ch === "C" ? "Câmara" : "Senado"}`} className="h-auto w-full">
          <rect x="0" y="0" width={W} height={H} fill="var(--surface)" />
          <line x1={PAD} x2={W - PAD} y1={cy(0)} y2={cy(0)} stroke="var(--line)" strokeDasharray="4 4" />
          <line x1={cx(0)} x2={cx(0)} y1={PAD} y2={H - PAD} stroke="var(--line)" strokeDasharray="4 4" />
          <text x={PAD} y={H - 12} fontSize="12" fill="var(--muted)">
            ← lado do PT
          </text>
          <text x={W - PAD} y={H - 12} fontSize="12" textAnchor="end" fill="var(--muted)">
            lado do PL →
          </text>
          <text x={W / 2} y={H - 12} fontSize="12" textAnchor="middle" fill="var(--muted)">
            Dimensão 1 · explica {fmtPct(meta.var1)} da variação
          </text>
          <text x={14} y={H / 2} fontSize="12" textAnchor="middle" fill="var(--muted)" transform={`rotate(-90 14 ${H / 2})`}>
            Dimensão 2 · explica {fmtPct(meta.var2)}
          </text>
          {pontos.map((p) => {
            const apagado = destaque && p.party !== destaque;
            return (
              <a key={p.id} href={`/membro/${p.id.replace(":", "-")}`}>
                <circle
                  cx={cx(p.d1)}
                  cy={cy(p.d2)}
                  r={destaque && !apagado ? 6 : 4.5}
                  fill={corDoPartido(ordem, p.party)}
                  fillOpacity={apagado ? 0.12 : 0.85}
                  stroke="var(--surface)"
                  strokeWidth="0.8"
                >
                  <title>{`${p.name} (${p.party ?? "sem partido"}-${p.uf})`}</title>
                </circle>
              </a>
            );
          })}
          {alvo && (
            <g pointerEvents="none">
              <circle cx={cx(alvo.d1)} cy={cy(alvo.d2)} r="10" fill="none" stroke="var(--ink-strong)" strokeWidth="2" />
              <text x={cx(alvo.d1) + 14} y={cy(alvo.d2) + 4} fontSize="13" fontWeight="700" fill="var(--ink-strong)">
                {alvo.name}
              </text>
            </g>
          )}
        </svg>
        <p className="mt-2 text-xs text-muted">
          {fmtNum(meta.membros)} parlamentares com votos suficientes, em {fmtNum(meta.votacoes)} votações que dividiram a casa. Passe o
          mouse ou toque num ponto para ver o nome; clique para abrir a página da pessoa.
        </p>
      </Card>

      <Card title="Partidos">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {ordem.map((party) => (
            <li key={party}>
              <Link
                href={href({ partido: destaque === party ? null : party })}
                className={`inline-flex items-center gap-1.5 ${destaque === party ? "font-bold" : ""}`}
                aria-pressed={destaque === party}
              >
                <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: corDoPartido(ordem, party) }} />
                {party} <span className="text-xs text-muted">{contagem.get(party)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Clique num partido para destacá-lo. As cores servem só para distinguir partidos.</p>
      </Card>

      <Card title="Isto confirma o perfil de votação?">
        <div className="space-y-2 text-sm">
          <p>
            O mapa não usa nenhuma das nossas marcações, então serve de teste. Correlação de Spearman entre a posição no mapa e as notas
            do perfil ({ch === "C" ? "Câmara" : "Senado"}, 1 = mesma ordem, −1 = ordem inversa):
          </p>
          <div className="overflow-x-auto">
            <table className="w-full max-w-xl text-left text-sm">
              <thead className="text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 pr-3">Medida</th>
                  <th className="py-1 pr-3 text-right">Dimensão 1</th>
                  <th className="py-1 pr-3 text-right">Dimensão 2</th>
                  <th className="py-1 text-right">Parlamentares</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {[
                  ["Estado / Esquerda", `${k}_estado`],
                  ["Privilégios", `${k}_privilegio`],
                  ...(ch === "C" ? [["Acompanhou o Governo", "C_governo"]] : []),
                ].map(([rot, nome]) => (
                  <tr key={nome}>
                    <td className="py-1.5 pr-3 font-semibold">{rot}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{rho(val[`${nome}_d1`])}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{rho(val[`${nome}_d2`])}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtNum(val[`${nome}_d1`]?.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted">
            {ch === "C" ? (
              <>
                Na Câmara, a dimensão 1 acompanha de perto a nota de <strong>Estado</strong> e quase coincide com o quanto o parlamentar
                seguiu o <strong>Governo</strong>. Isso mostra que as barras captam um padrão real dos votos. Mas também mostra o limite:
                nesta legislatura &quot;governo × oposição&quot; e &quot;Estado × mercado&quot; andam juntos, então os votos sozinhos não
                separam as duas coisas. A dimensão 2 se relaciona mais com a nota de <strong>Privilégios</strong>.
              </>
            ) : (
              <>
                No Senado há poucas votações nominais (e muitos votos secretos), então o mapa e as correlações são bem menos firmes.
                Trate este gráfico como ilustração.
              </>
            )}
          </p>
          <Tag>
            <Link href="/metodologia" className="no-underline">
              ver metodologia
            </Link>
          </Tag>
        </div>
      </Card>
    </>
  );
}
