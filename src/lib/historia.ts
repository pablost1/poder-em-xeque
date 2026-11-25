import { HISTORIA_MIN_ECONOMICAS, HISTORIA_MIN_PRIVILEGIOS, type HistoriaCelula } from "./queries";
import type { EixoSlug } from "./eixos";

/*
 * Lógica pura da linha do tempo: qual valor e quais contagens aparecem em cada eixo, e quando um ponto vira lacuna.
 * Fica separada da página para ser testada com números calculados à mão.
 */

/** Intervalo aproximado (95%) de uma proporção, de 0 a 100. */
export type Intervalo = { min: number; max: number };

/**
 * Intervalo de Wilson para uma proporção. `valor` está em 0–100 e `n` é o número de votações classificadas com direção
 * (uma estimativa conservadora do tamanho da amostra: cada votação conta uma vez, mesmo com centenas de votantes por trás).
 * Serve para mostrar o quanto confiar num ponto: 78% com 287 votações é bem mais firme que 60% com 12.
 */
export function intervaloWilson(valor: number, n: number, z = 1.96): Intervalo | null {
  if (!(n > 0) || valor < 0 || valor > 100) return null;
  const p = valor / 100;
  const z2 = z * z;
  const centro = (p + z2 / (2 * n)) / (1 + z2 / n);
  const meia = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { min: Math.max(0, (centro - meia) * 100), max: Math.min(100, (centro + meia) * 100) };
}

/** Largura (em pontos percentuais) a partir da qual o ponto é desenhado vazado: pouca base, muita incerteza. */
export const LARGURA_INCERTA = 30;

export type PontoHistoria = {
  legislatura: number;
  /** Percentual 0–100, ou null quando não há base suficiente (lacuna). */
  valor: number | null;
  /** Quantas votações classificadas sustentam o ponto, em cada lado. */
  contagens: { rotulo: string; n: number }[];
  /** Votações classificadas com direção neste eixo. */
  base: number;
  /** Intervalo aproximado de 95% para o valor (null sem valor). */
  intervalo: Intervalo | null;
  /** Mínimo exigido para mostrar o ponto. */
  minimo: number;
};

/** Valor, base e contagens de uma célula (partido × legislatura) em um eixo. */
export function pontoDaCelula(c: HistoriaCelula, eixo: EixoSlug): PontoHistoria {
  if (eixo === "privilegios") {
    const base = c.n_priv_mais + c.n_priv_menos;
    return {
      legislatura: c.legislatura,
      valor: base >= HISTORIA_MIN_PRIVILEGIOS ? c.privilege_pct : null,
      contagens: [
        { rotulo: "ampliaria privilégios", n: c.n_priv_mais },
        { rotulo: "reduziria privilégios", n: c.n_priv_menos },
      ],
      base,
      intervalo: base >= HISTORIA_MIN_PRIVILEGIOS && c.privilege_pct !== null ? intervaloWilson(c.privilege_pct, base) : null,
      minimo: HISTORIA_MIN_PRIVILEGIOS,
    };
  }
  const base = c.n_estado + c.n_mercado;
  const valor = eixo === "estado" ? c.left_pct : c.right_pct;
  return {
    legislatura: c.legislatura,
    valor: base >= HISTORIA_MIN_ECONOMICAS ? valor : null,
    contagens: [
      { rotulo: "para o Estado", n: c.n_estado },
      { rotulo: "para o mercado", n: c.n_mercado },
    ],
    base,
    intervalo: base >= HISTORIA_MIN_ECONOMICAS && valor !== null ? intervaloWilson(valor, base) : null,
    minimo: HISTORIA_MIN_ECONOMICAS,
  };
}

/** Partidos a destacar por padrão: os que mais tiveram posição na legislatura mais recente com dados. */
export function partidosPadrao(celulas: HistoriaCelula[], eixo: EixoSlug, quantos = 6): string[] {
  const comDados = celulas.filter((c) => pontoDaCelula(c, eixo).valor !== null);
  if (!comDados.length) return [];
  const ultima = Math.max(...comDados.map((c) => c.legislatura));
  return comDados
    .filter((c) => c.legislatura === ultima)
    .sort((a, b) => b.n_votacoes - a.n_votacoes || a.party.localeCompare(b.party))
    .slice(0, quantos)
    .map((c) => c.party);
}

/** Lê ?partido=PT,PL (ignora o que não existe nos dados). */
export function lerPartidos(v: string | string[] | undefined, existentes: Set<string>): string[] {
  const s = Array.isArray(v) ? v.join(",") : (v ?? "");
  return [...new Set(s.split(",").map((x) => x.trim()).filter((x) => existentes.has(x)))];
}

/** Liga ou desliga um partido na lista (para os botões da legenda). */
export function alternarPartido(lista: string[], party: string): string[] {
  return lista.includes(party) ? lista.filter((p) => p !== party) : [...lista, party];
}

/** Cor estável por partido (as mesmas em toda a página), com ângulo áureo para separar tons vizinhos. */
export function corDoPartidoHistoria(party: string, todos: string[]): string {
  const i = Math.max(0, todos.indexOf(party));
  return `hsl(${Math.round((i * 137.5) % 360)} 65% var(--map-l))`;
}
