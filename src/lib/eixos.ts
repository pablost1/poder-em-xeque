/**
 * Os três eixos do Perfil de votação. O slug aparece nas URLs; `key` é o nome interno usado no banco
 * (left_pct / right_pct / privilege_pct) e nas consultas.
 */
export type EixoKey = "left" | "right" | "privilege";
export type EixoSlug = "estado" | "mercado" | "privilegios";

export type Eixo = {
  slug: EixoSlug;
  key: EixoKey;
  /** Rótulo curto, usado nas barras e abas. */
  rotulo: string;
  /** Título do ranking: descreve quem aparece no topo, sem rotular a pessoa. */
  tituloRanking: string;
  /** Explicação de uma linha. */
  descricao: string;
  /** Qual contagem sustenta a barra. */
  contagem: "economico" | "privilegio";
  /** Mínimo de votos contados para entrar no ranking (mais exigente que o mínimo para ter a barra). */
  minimoRanking: number;
};

export const EIXOS: Eixo[] = [
  {
    slug: "estado",
    key: "left",
    rotulo: "Estado / Esquerda",
    tituloRanking: "Mais votos por maior papel do Estado",
    descricao:
      "Votos que empurraram para um Estado maior: gasto público, regulação, proteção ao trabalho, impostos sobre o capital.",
    contagem: "economico",
    minimoRanking: 20,
  },
  {
    slug: "mercado",
    key: "right",
    rotulo: "Mercado / Direita",
    tituloRanking: "Mais votos por menor papel do Estado",
    descricao:
      "Votos que empurraram para um Estado menor: corte de impostos, desregulamentação, privatização, flexibilização trabalhista.",
    contagem: "economico",
    minimoRanking: 20,
  },
  {
    slug: "privilegios",
    key: "privilege",
    rotulo: "Privilégios",
    tituloRanking: "Mais votos pró-privilégios de políticos",
    descricao:
      "Votos sobre benefícios, imunidade, fundos partidários e regras de responsabilização de políticos e ocupantes de cargos públicos.",
    contagem: "privilegio",
    minimoRanking: 8,
  },
];

export function eixoPorSlug(slug: string): Eixo | undefined {
  return EIXOS.find((e) => e.slug === slug);
}

export function eixoPorKey(key: EixoKey): Eixo {
  return EIXOS.find((e) => e.key === key)!;
}

/** Nome da coluna em member_iv / party_iv. */
export function colunaDoEixo(eixo: Eixo): "left_pct" | "right_pct" | "privilege_pct" {
  return `${eixo.key}_pct` as "left_pct" | "right_pct" | "privilege_pct";
}
