import { LARGURA_INCERTA, type PontoHistoria } from "@/lib/historia";
import { rotuloLegislatura } from "@/lib/legislaturas";

export type SerieHistoria = { party: string; cor: string; pontos: Map<number, PontoHistoria> };

const W = 880;
const H = 340;
const PAD = { l: 46, r: 24, t: 14, b: 44 };

const fmt = (n: number) => `${Math.round(n)}%`;

/**
 * Linha do tempo por legislatura. Cada linha é um partido; onde não há base suficiente (ou a legislatura ainda não foi
 * classificada) a linha se interrompe: lacuna não é zero. Legislaturas sem classificação ficam sombreadas.
 */
export function LinhaTempo({ series, legs, naoClassificadas, eixo }: { series: SerieHistoria[]; legs: number[]; naoClassificadas: Set<number>; eixo: string }) {
  const x = (leg: number) => PAD.l + ((legs.indexOf(leg) + 0.5) / legs.length) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const larg = (W - PAD.l - PAD.r) / legs.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Linha do tempo: ${eixo} por partido, de ${rotuloLegislatura(legs[0], true)} a ${rotuloLegislatura(legs[legs.length - 1], true)}`} className="w-full rounded-md border border-line bg-surface">
      {legs.map((l) =>
        naoClassificadas.has(l) ? (
          <g key={`b${l}`}>
            <rect x={x(l) - larg / 2} y={PAD.t} width={larg} height={H - PAD.t - PAD.b} fill="var(--surface-2, var(--line-soft))" opacity={0.7} />
            <text x={x(l)} y={PAD.t + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
              ainda não classificada
            </text>
          </g>
        ) : null,
      )}
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" strokeDasharray={v === 50 ? "0" : "3 4"} />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
            {v}%
          </text>
        </g>
      ))}
      {legs.map((l) => (
        <g key={l}>
          <text x={x(l)} y={H - PAD.b + 18} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">
            {l}ª
          </text>
          <text x={x(l)} y={H - PAD.b + 33} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {rotuloLegislatura(l, true).replace(/^\d+ª \(/, "").replace(")", "")}
          </text>
        </g>
      ))}
      {series.map((s) => {
        const segmentos: PontoHistoria[][] = [];
        let atual: PontoHistoria[] = [];
        for (const l of legs) {
          const p = s.pontos.get(l);
          if (p && p.valor !== null) atual.push(p);
          else if (atual.length) {
            segmentos.push(atual);
            atual = [];
          }
        }
        if (atual.length) segmentos.push(atual);
        return (
          <g key={s.party} stroke={s.cor} fill={s.cor}>
            {segmentos.map((seg, i) =>
              seg.length > 1 ? (
                <polyline key={i} points={seg.map((p) => `${x(p.legislatura)},${y(p.valor!)}`).join(" ")} fill="none" strokeWidth={2.5} strokeLinejoin="round" />
              ) : null,
            )}
            {segmentos.flat().map((p) => {
              const iv = p.intervalo;
              const incerto = iv ? iv.max - iv.min > LARGURA_INCERTA : false;
              return (
                <g key={p.legislatura}>
                  {iv && <line x1={x(p.legislatura)} x2={x(p.legislatura)} y1={y(iv.min)} y2={y(iv.max)} strokeWidth={1.5} opacity={0.45} />}
                  <circle cx={x(p.legislatura)} cy={y(p.valor!)} r={4.5} strokeWidth={incerto ? 2 : 1.5} stroke={incerto ? s.cor : "var(--surface)"} fill={incerto ? "var(--surface)" : s.cor}>
                    <title>
                      {`${s.party}, ${rotuloLegislatura(p.legislatura, true)}: ${fmt(p.valor!)} (${eixo})${iv ? `, entre ${fmt(iv.min)} e ${fmt(iv.max)}` : ""}. Base: ${p.base} votações classificadas, ${p.contagens.map((c) => `${c.n} ${c.rotulo}`).join(" e ")}.${incerto ? " Pouca base: ponto incerto." : ""}`}
                    </title>
                  </circle>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
