export type MesParticipacao = { mes: string; votacoes: number; votou: number };

const W = 880;
const H = 220;
const PAD = { l: 40, r: 12, t: 12, b: 36 };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const rotulo = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/** Todos os meses entre o primeiro e o último, inclusive os sem votação (que ficam em branco, não em zero). */
function completar(meses: MesParticipacao[]): (MesParticipacao | { mes: string; votacoes: 0; votou: 0 })[] {
  if (!meses.length) return [];
  const por = new Map(meses.map((m) => [m.mes, m]));
  const out: (MesParticipacao | { mes: string; votacoes: 0; votou: 0 })[] = [];
  let [a, m] = meses[0].mes.split("-").map(Number);
  const [fa, fm] = meses[meses.length - 1].mes.split("-").map(Number);
  while (a < fa || (a === fa && m <= fm)) {
    const k = `${a}-${String(m).padStart(2, "0")}`;
    out.push(por.get(k) ?? { mes: k, votacoes: 0, votou: 0 });
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return out;
}

/**
 * Participação mês a mês: cada barra é a parcela das votações do mês em que a pessoa registrou voto. A altura é a taxa e
 * o balão mostra os números. Meses sem votação nominal ficam vazios, e a linha tracejada é a média do período.
 */
export function BarrasMensais({ meses, media }: { meses: MesParticipacao[]; media: number | null }) {
  const todos = completar(meses);
  if (!todos.length) return null;
  const larg = (W - PAD.l - PAD.r) / todos.length;
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Participação nas votações, mês a mês" className="w-full rounded-md border border-line bg-surface">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" strokeDasharray={v === 0.5 ? "3 4" : "0"} />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {media !== null && <line x1={PAD.l} x2={W - PAD.r} y1={y(media)} y2={y(media)} stroke="var(--brand)" strokeDasharray="5 4" strokeWidth={1.5} />}
      {todos.map((m, i) => {
        const x = PAD.l + i * larg;
        const taxa = m.votacoes ? m.votou / m.votacoes : null;
        return (
          <g key={m.mes}>
            {taxa !== null && (
              <rect x={x + 2} y={y(taxa)} width={Math.max(3, larg - 4)} height={Math.max(1, H - PAD.b - y(taxa))} rx={2} fill={taxa < 0.5 ? "var(--iv-privilege)" : "var(--iv-right)"}>
                <title>{`${rotulo(m.mes)}: votou em ${m.votou} de ${m.votacoes} votações (${Math.round(taxa * 100)}%)`}</title>
              </rect>
            )}
            {(m.mes.endsWith("-01") || m.mes.endsWith("-04") || m.mes.endsWith("-07") || m.mes.endsWith("-10")) && (
              <text x={x + larg / 2} y={H - PAD.b + 16} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {rotulo(m.mes)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
