/*
 * Participação e presença. Lógica pura (sem banco), para ser testada com números calculados à mão.
 *
 * Duas medidas, com nomes diferentes porque medem coisas diferentes:
 *   - participação nas votações nominais: votações em que a pessoa registrou voto ÷ votações nominais da casa nos
 *     períodos em que estava em exercício;
 *   - presença nas sessões deliberativas (Câmara): sessões do Plenário com presença registrada ÷ sessões deliberativas
 *     nos períodos em que estava em exercício.
 * Faltar a uma votação não é o mesmo que faltar à sessão: quem está presente pode não votar.
 */

export type EventoPeriodo = { data: string | null; situacao: string | null; descricao: string | null };

export type Periodo = {
  /** Primeiro dia em exercício (inclusive). */
  inicio: string;
  /** Primeiro dia fora do exercício (exclusive); null = ainda em exercício. */
  fim: string | null;
  motivoFim: string | null;
};

export type ForaExercicio = { inicio: string; fim: string | null; motivo: string };

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Último trecho do texto oficial ("Saída - Afastamento sem prazo determinado - Ministro de Estado" → "Ministro de Estado"). */
function motivoDe(descricao: string | null): string {
  if (!descricao) return "motivo não registrado";
  const p = descricao.split(" - ");
  return p[p.length - 1].trim() || descricao.trim();
}

/**
 * Períodos em que um(a) deputado(a) esteve em exercício, a partir dos eventos do histórico oficial (em ordem de data).
 * Uma entrada (posse, reassunção) abre o período; licença, afastamento, suspensão, fim da suplência, vacância e término
 * o fecham. As licenças e afastamentos de titular também entram em `fora`, com o motivo oficial. Eventos que só
 * mudam nome ou partido não contam.
 */
export function periodosDeExercicio(eventos: EventoPeriodo[]): { periodos: Periodo[]; fora: ForaExercicio[] } {
  const ev = [...eventos].filter((e) => e.data).sort((a, b) => (a.data as string).localeCompare(b.data as string));
  const periodos: Periodo[] = [];
  const fora: ForaExercicio[] = [];
  let aberto: string | null = null;
  let foraAberto: ForaExercicio | null = null;
  for (const e of ev) {
    const d = norm(e.descricao);
    const data = e.data as string;
    const sit = e.situacao ?? "";
    if (d.startsWith("entrada")) {
      if (aberto === null) aberto = data;
      if (foraAberto) {
        foraAberto.fim = data;
        foraAberto = null;
      }
      continue;
    }
    const saida = d.startsWith("saida") || (d.startsWith("diverso") && (sit === "VACANCIA" || sit === "Licença"));
    if (!saida) continue;
    const afastamentoDeTitular = sit === "Licença" || sit === "Afastado" || sit === "SUSPENSO";
    const encerra = afastamentoDeTitular || sit === "SUPLENCIA" || sit === "VACANCIA" || sit === "FIM_MANDATO";
    if (!encerra) continue;
    if (aberto !== null) {
      periodos.push({ inicio: aberto, fim: data, motivoFim: motivoDe(e.descricao) });
      aberto = null;
    }
    if (afastamentoDeTitular && !foraAberto) {
      foraAberto = { inicio: data, fim: null, motivo: motivoDe(e.descricao) };
      fora.push(foraAberto);
    }
  }
  if (aberto !== null) periodos.push({ inicio: aberto, fim: null, motivoFim: null });
  return { periodos, fora };
}

/** A data cai dentro de algum período (início inclusive, fim exclusive)? */
export function emExercicioNaData(data: string, periodos: Periodo[]): boolean {
  return periodos.some((p) => data >= p.inicio && (p.fim === null || data < p.fim));
}

/* ----- Senado ----- */

export type CategoriaSenado = "votou" | "presente_sem_voto" | "presente_obstrucao" | "justificada" | "nao_compareceu" | "presidente" | "nao_se_aplica" | "outro";

/**
 * Categoria de cada sigla de /votacao do Senado (siglaVotoParlamentar). Os textos oficiais, que também guardamos, são:
 * P-NRV "Presente, não registrou voto", P-OD "Presente, obstrução declarada", AP "Atividade parlamentar", LS "Licença
 * saúde", LP "Licença particular", LG/LAP/LA licenças gestante, paternidade e adotante, MIS "Missão da Casa no país/exterior",
 * REP "Representação em solenidade", NCom "Não compareceu", NA "Dispositivo não citado". Siglas sem descrição oficial
 * (como MERC) ficam em "outro": não adivinhamos.
 */
export function categoriaSenado(sigla: string): CategoriaSenado {
  const s = sigla.trim();
  if (["Sim", "Não", "Abstenção", "Obstrução"].includes(s) || ["SIM", "NAO", "ABS", "OBS"].includes(s)) return "votou";
  if (s === "P-NRV") return "presente_sem_voto";
  if (s === "P-OD") return "presente_obstrucao";
  if (["AP", "LS", "LP", "LG", "LAP", "LA", "MIS", "REP", "LIC", "LSP"].includes(s)) return "justificada";
  if (s === "NCom") return "nao_compareceu";
  if (s === "NA") return "nao_se_aplica";
  if (s.toLowerCase().startsWith("presidente") || s.toLowerCase().startsWith("sim - presidente")) return "presidente";
  return "outro";
}

/* ----- Votações: margem, mês, tipo ----- */

/** Margem da votação: |Sim − Não| ÷ (Sim + Não). Sem votantes Sim/Não devolve 1 (não é apertada). */
export function margemDaVotacao(sim: number, nao: number): number {
  const t = sim + nao;
  return t > 0 ? Math.abs(sim - nao) / t : 1;
}

/** Votação apertada: decidida por menos de 10% dos votantes Sim/Não. */
export const MARGEM_APERTADA = 0.1;
export function ehApertada(sim: number, nao: number): boolean {
  return sim + nao > 0 && margemDaVotacao(sim, nao) < MARGEM_APERTADA;
}

/** AAAA-MM de uma data AAAA-MM-DD. */
export const mesDaData = (data: string) => data.slice(0, 7);

/** Sigla do tipo de proposição a partir do rótulo ("PEC 45/2019" → "PEC"; sem rótulo → "Sem projeto"). */
export function tipoDeProposicao(rotulo: string | null | undefined): string {
  const m = (rotulo ?? "").trim().match(/^([A-Za-zÀ-ú]+)\b/);
  return m ? m[1].toUpperCase() : "Sem projeto";
}

/**
 * Maior sequência de votações seguidas em que a pessoa não votou, entre as votações em que estava em exercício (em ordem de data).
 * `votou[i]` diz se votou na votação i. Devolve o tamanho e os índices de início e fim, ou null se nunca faltou.
 */
export function maiorSequenciaDeAusencias(votou: boolean[]): { tamanho: number; de: number; ate: number } | null {
  let melhor: { tamanho: number; de: number; ate: number } | null = null;
  let ini = -1;
  for (let i = 0; i <= votou.length; i++) {
    const falta = i < votou.length && !votou[i];
    if (falta && ini < 0) ini = i;
    if (!falta && ini >= 0) {
      const tam = i - ini;
      if (!melhor || tam > melhor.tamanho) melhor = { tamanho: tam, de: ini, ate: i - 1 };
      ini = -1;
    }
  }
  return melhor;
}

/** Percentual 0–1, ou null quando o denominador é zero. */
export const taxa = (parte: number, total: number): number | null => (total > 0 ? parte / total : null);

/** Quantos pontos percentuais abaixo da participação geral a participação nas votações importantes precisa estar. */
export const LIMITE_FALTA_IMPORTANTES = 0.15;
/** Mínimo de votações importantes para o alerta valer (com poucas, a taxa oscila demais). */
export const MIN_IMPORTANTES = 20;

/**
 * Alerta "falta mais nas importantes": a taxa nas votações classificadas com direção está pelo menos 15 pontos
 * percentuais abaixo da taxa geral, e há ao menos 20 votações importantes no período. É um sinal para olhar, não um juízo.
 */
export function faltouMaisNasImportantes(geral: number | null, importantes: number | null, nImportantes: number): boolean {
  if (geral === null || importantes === null || nImportantes < MIN_IMPORTANTES) return false;
  return geral - importantes >= LIMITE_FALTA_IMPORTANTES - 1e-9;
}

export type ResumoDistribuicao = { n: number; media: number; mediana: number; min: number; max: number };

/** Média, mediana, mínimo e máximo de uma lista de taxas. Lista vazia: null. */
export function resumoDistribuicao(valores: number[]): ResumoDistribuicao | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = v.length >> 1;
  const mediana = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  return { n: v.length, media: v.reduce((a, b) => a + b, 0) / v.length, mediana, min: v[0], max: v[v.length - 1] };
}
