import { connection } from "next/server";
import { getConsistencia } from "@/lib/queries";
import { fmtNum } from "@/lib/format";

/** Faixas usuais para ler o kappa de Cohen (Landis e Koch). */
function lerKappa(k: number | null): string {
  if (k === null) return "sem medida";
  if (k < 0.2) return "fraca";
  if (k < 0.4) return "razoável";
  if (k < 0.6) return "moderada";
  if (k < 0.8) return "boa";
  return "muito boa";
}
const dec = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? "–" : x.toFixed(d).replace(".", ",").replace("-", "−"));
const pc = (x: number | null | undefined) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);

/** Resultado da segunda marcação independente. Só aparece quando a comparação já foi feita. */
export async function ConsistenciaCard() {
  await connection();
  const c = getConsistencia();
  const n = c["atual_n"]?.valor;
  if (!n) return null;
  const ecoOpostos = c["atual_eco_sinal_oposto"];
  const privOpostos = c["atual_priv_sinal_oposto"];
  return (
    <div className="rounded-md border border-line bg-surface p-4 text-sm">
      <h3 className="font-bold text-ink-strong">Quanto as marcações concordam entre si</h3>
      <p className="mt-2">
        Uma segunda marcação independente, feita sem acesso à primeira e com o mesmo roteiro e as mesmas informações, avaliou{" "}
        <strong>{fmtNum(n)}</strong> votações. Comparando as duas (medido antes de resolvermos as divergências, quando as marcações
        ainda eram independentes):
      </p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
        <li>
          <strong className="text-ink">Direção econômica:</strong> as duas concordaram na categoria (Estado, neutro ou Mercado) em{" "}
          {pc(c["atual_eco_acordo"]?.valor)} das votações; kappa de Cohen {dec(c["atual_eco_kappa"]?.valor)} (concordância{" "}
          {lerKappa(c["atual_eco_kappa"]?.valor ?? null)}). Entre os {fmtNum(ecoOpostos?.n)} votos com direção nas duas, em{" "}
          {fmtNum(ecoOpostos?.valor)} elas apontaram para lados opostos.
        </li>
        <li>
          <strong className="text-ink">Privilégios:</strong> concordância de {pc(c["atual_priv_acordo"]?.valor)}; kappa{" "}
          {dec(c["atual_priv_kappa"]?.valor)} ({lerKappa(c["atual_priv_kappa"]?.valor ?? null)}). Entre os {fmtNum(privOpostos?.n)}{" "}
          votos com direção nas duas, {fmtNum(privOpostos?.valor)} ficaram em lados opostos.
        </li>
        <li>
          <strong className="text-ink">Notas dos parlamentares:</strong> calculando o perfil com cada marcação, a ordenação dos
          parlamentares da Câmara tem correlação de Spearman {dec(c["notas_C_estado"]?.valor)} em Estado e{" "}
          {dec(c["notas_C_privilegio"]?.valor)} em Privilégios; no Senado, {dec(c["notas_S_estado"]?.valor)} e{" "}
          {dec(c["notas_S_privilegio"]?.valor)}.
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted">
        Concordar entre si não prova que as duas estão certas: ambas partem das mesmas informações e do mesmo roteiro e são do mesmo
        tipo de modelo de IA, então podem errar do mesmo jeito. O que a medida mostra é o quanto o resultado depende de quem marca.
        Os votos em que as duas discordam vão para uma fila de revisão humana.
      </p>
    </div>
  );
}
