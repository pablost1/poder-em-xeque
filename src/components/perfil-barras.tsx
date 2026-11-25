import Link from "next/link";
import type { IvScores, Posicao } from "@/lib/queries";
import { EIXOS, type EixoSlug } from "@/lib/eixos";
import { fmtNum, fmtPct } from "@/lib/format";

type Props = {
  /** Notas de um parlamentar/partido, ou null quando nada foi pontuado. */
  iv: IvScores | null;
  /** Caminho base das páginas de evidência, ex.: /membro/C-123/barras (acrescenta /estado|mercado|privilegios). */
  evidenceBase?: string;
  /** Posição no ranking de cada eixo (opcional). */
  posicoes?: Partial<Record<EixoSlug, Posicao | null>>;
};

const COR: Record<EixoSlug, string> = {
  estado: "bg-iv-left",
  mercado: "bg-iv-right",
  privilegios: "bg-iv-privilege",
};

const SEGMENTS = 20;

/** Perfil de votação: três barras segmentadas de 0 a 100. A barra fica apagada quando há votos de menos. */
export function PerfilBarras({ iv, evidenceBase, posicoes }: Props) {
  return (
    <div className="space-y-2.5" aria-label="Perfil de votação">
      {EIXOS.map((e) => {
        const v = iv ? iv[e.key] : null;
        const filled = v === null ? 0 : Math.round((v / 100) * SEGMENTS);
        const href = evidenceBase && v !== null ? `${evidenceBase}/${e.slug}` : null;
        const pos = posicoes?.[e.slug];
        return (
          <div key={e.slug} className="flex items-center gap-3 text-xs font-semibold">
            {href ? (
              <Link href={href} className="w-32 shrink-0 text-brand underline-offset-2 hover:underline">
                {e.rotulo}
              </Link>
            ) : (
              <span className="w-32 shrink-0 text-muted">{e.rotulo}</span>
            )}
            <div
              className="flex flex-1 gap-0.5"
              role="img"
              aria-label={`${e.rotulo}: ${v === null ? "sem nota" : Math.round(v)} de 100`}
            >
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <div key={i} className={`h-3 flex-1 rounded-sm ${i < filled ? COR[e.slug] : "bg-iv-empty"}`} />
              ))}
            </div>
            <span className="w-8 text-right tabular-nums text-ink-strong">{v === null ? "–" : Math.round(v)}</span>
            {pos && (
              <Link
                href={`/rankings?eixo=${e.slug}`}
                className="w-20 shrink-0 text-right font-normal text-muted hover:underline"
                title={`Posição no ranking: ${e.tituloRanking.toLowerCase()}`}
              >
                #{fmtNum(pos.rank)} de {fmtNum(pos.total)}
              </Link>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted">
        {iv && (iv.left !== null || iv.privilege !== null)
          ? `Com base em ${fmtNum(iv.nEconomic)} votos econômicos e ${fmtNum(iv.nPrivilege)} votos sobre privilégios com direção marcada. Clique numa barra para ver os votos.`
          : "Sem nota: poucos votos com direção marcada."}
      </p>
      {iv && iv.nSubst > 0 && (
        <p className="text-xs text-muted">
          <strong className="text-ink">Cobertura:</strong> {fmtNum(iv.nDirecao)} de {fmtNum(iv.nSubst)} votos Sim/Não (sem os
          procedimentais) tiveram direção marcada ({fmtPct(iv.nDirecao / iv.nSubst)}). Os demais não puderam ser avaliados e não pesam
          na nota.
          {(iv.leftRobust !== null || iv.privilegeRobust !== null) && (
            <>
              {" "}
              <strong className="text-ink">Robustez:</strong> usando só marcações de confiança de 50% ou mais, a nota ficaria em{" "}
              {[
                iv.leftRobust !== null && `Estado ${Math.round(iv.leftRobust)}`,
                iv.rightRobust !== null && `Mercado ${Math.round(iv.rightRobust)}`,
                iv.privilegeRobust !== null && `Privilégios ${Math.round(iv.privilegeRobust)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
              .
            </>
          )}
        </p>
      )}
    </div>
  );
}
