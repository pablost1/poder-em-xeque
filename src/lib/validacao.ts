/*
 * Leitura em palavras do teste independente por legislatura: correlação de Spearman entre a nota de Estado de cada
 * parlamentar (que depende das marcações) e a posição dele no mapa de votos (que não usa marcação nenhuma). No mapa o PL
 * fica do lado positivo e o PT do negativo, então um perfil que faz sentido (mais Estado à esquerda) dá correlação NEGATIVA.
 */

export type Nivel = "forte" | "moderada" | "fraca";

export type Leitura = { nivel: Nivel; rotulo: string; explicacao: string };

/** Forte: ρ ≤ −0,6. Moderada: entre −0,6 e −0,3. Fraca: acima de −0,3, o que inclui correlação de sinal contrário. */
export function leituraValidacao(rho: number | null | undefined): Leitura | null {
  if (rho === null || rho === undefined || Number.isNaN(rho)) return null;
  if (rho <= -0.6) return { nivel: "forte", rotulo: "concordância forte", explicacao: "O perfil de Estado concorda bem com a divisão que aparece só nos votos." };
  if (rho <= -0.3) return { nivel: "moderada", rotulo: "concordância moderada", explicacao: "O perfil de Estado concorda em parte com a divisão que aparece só nos votos." };
  return {
    nivel: "fraca",
    rotulo: "concordância fraca",
    explicacao:
      rho > 0.3
        ? "O perfil de Estado vai no sentido contrário ao da divisão que aparece só nos votos. Leia os números dessa legislatura com cautela."
        : "O perfil de Estado quase não se relaciona com a divisão que aparece só nos votos. Leia os números dessa legislatura com cautela.",
  };
}

/** Formata ρ em pt-BR com o sinal de menos tipográfico. */
export function fmtRho(r: number | null | undefined): string {
  return r === null || r === undefined ? "–" : r.toFixed(2).replace(".", ",").replace("-", "−");
}
