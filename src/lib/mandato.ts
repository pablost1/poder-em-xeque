import { LEG_ATUAL, periodoDaLegislatura } from "./legislaturas";

/*
 * Natureza do mandato: como terminou (ou se continua). Vem SEMPRE do motivo registrado nas fontes oficiais, com as
 * palavras da fonte: "cassado" só quando o registro diz "Perda de Mandato por Resolução" (decidida pela Casa).
 * "Ato da Mesa", "recontagem de votos" e "decisão judicial" são coisas diferentes e têm rótulos próprios.
 * Quando o motivo não é reconhecido, mostramos o texto oficial em vez de inventar uma categoria.
 */

export type Natureza =
  | "em_exercicio"
  | "em_curso"
  | "cumprido"
  | "cassado"
  | "perda_ato_mesa"
  | "perda_mandato"
  | "renunciou"
  | "faleceu"
  | "aposentou"
  | "recontagem"
  | "decisao_judicial"
  | "suplencia_encerrada"
  | "nao_assumiu"
  | "licenciado"
  | "indefinido";

export type Tom = "ok" | "neutro" | "aviso" | "grave";

export const NATUREZA_INFO: Record<Natureza, { rotulo: string; tom: Tom; explicacao: string }> = {
  em_exercicio: { rotulo: "Legislatura atual", tom: "ok", explicacao: "Está no cargo hoje, segundo a lista oficial. Isso é a situação de hoje, não um desfecho." },
  em_curso: { rotulo: "Mandato em curso", tom: "neutro", explicacao: "Mandato de 8 anos do Senado: continuava na legislatura seguinte." },
  cumprido: { rotulo: "Mandato cumprido", tom: "neutro", explicacao: "Ficou até o fim da legislatura (término registrado na fonte oficial)." },
  cassado: { rotulo: "Cassado", tom: "grave", explicacao: "Perda de mandato por resolução da Casa, como registrado na fonte oficial." },
  perda_ato_mesa: {
    rotulo: "Perdeu o mandato (ato da Mesa)",
    tom: "grave",
    explicacao: "Perda de mandato declarada por ato da Mesa Diretora (por exemplo, por faltas, suspensão de direitos políticos ou decisão judicial). Não é a mesma coisa que cassação por resolução.",
  },
  perda_mandato: { rotulo: "Perdeu o mandato", tom: "grave", explicacao: "Perda de mandato, como registrada na fonte oficial (a fonte não detalha o tipo)." },
  renunciou: { rotulo: "Renunciou", tom: "aviso", explicacao: "Renúncia ao mandato registrada na fonte oficial." },
  faleceu: { rotulo: "Faleceu", tom: "neutro", explicacao: "Mandato encerrado por falecimento." },
  aposentou: { rotulo: "Aposentou-se", tom: "neutro", explicacao: "Mandato encerrado por aposentadoria, como registrado na fonte oficial." },
  recontagem: {
    rotulo: "Vaga alterada por recontagem de votos",
    tom: "aviso",
    explicacao: "A Mesa alterou quem ocupa a vaga após uma recontagem de votos. Não é cassação.",
  },
  decisao_judicial: { rotulo: "Afastado por decisão judicial", tom: "aviso", explicacao: "Afastamento por decisão de tribunal, como registrado na fonte oficial." },
  suplencia_encerrada: { rotulo: "Suplência encerrada", tom: "neutro", explicacao: "Era suplente e deixou o exercício quando o titular voltou ou o mandato acabou." },
  nao_assumiu: { rotulo: "Não assumiu o mandato", tom: "neutro", explicacao: "Foi convocado(a), mas não assumiu (impossibilidade de assumir)." },
  licenciado: { rotulo: "Licenciado(a)", tom: "aviso", explicacao: "Estava afastado(a) do exercício, com licença, no fim do período registrado." },
  indefinido: { rotulo: "Situação não registrada", tom: "neutro", explicacao: "A fonte oficial não informa como esse mandato terminou." },
};

/**
 * Naturezas que dizem COMO o mandato terminou. "Em exercício" fica de fora: é a situação de hoje, que a legislatura atual
 * e o botão "Só legislatura vigente" já indicam, e não um desfecho.
 */
export const NATUREZAS_DESFECHO = (Object.keys(NATUREZA_INFO) as Natureza[]).filter((n) => n !== "em_exercicio");

export type EventoMandato = {
  data: string | null; // AAAA-MM-DD
  situacao: string | null;
  condicao: string | null; // Titular | Suplente
  descricao: string | null; // texto oficial do motivo
};

export type Licenca = { data: string | null; motivo: string };

export type Mandato = {
  legislatura: number;
  natureza: Natureza;
  /** Texto oficial do motivo da saída (quando houve), para o usuário conferir. */
  motivo: string | null;
  condicao: "Titular" | "Suplente" | null;
  inicio: string | null;
  fim: string | null;
  licencas: Licenca[];
};

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Último trecho do texto oficial, que é o motivo ("Saída - Afastamento definitivo - Renúncia" → "Renúncia"). */
function motivoDe(descricao: string | null): string | null {
  if (!descricao) return null;
  const partes = descricao.split(" - ");
  return partes[partes.length - 1].trim() || descricao.trim();
}

/** Natureza correspondente ao motivo de uma saída definitiva; null se o texto não for uma saída conhecida. */
function naturezaDaSaida(descricao: string, situacao: string | null): Natureza | null {
  const d = norm(descricao);
  if (d.includes("perda de mandato por recontagem")) return "recontagem";
  if (d.includes("perda de mandato por resolucao")) return "cassado";
  if (d.includes("perda de mandato por ato da mesa")) return "perda_ato_mesa";
  if (d.includes("perda de mandato")) return "perda_mandato";
  if (d.includes("renuncia")) return "renunciou";
  if (d.includes("falecimento")) return "faleceu";
  if (d.includes("aposentadoria")) return "aposentou";
  if (d.includes("termino da legislatura") || d.includes("termino do mandato")) return "cumprido";
  if (d.includes("decisao de tribunal") || d.includes("decisao judicial")) return "decisao_judicial";
  if (d.startsWith("saida - afastamento definitivo") || situacao === "VACANCIA") return "indefinido";
  return null;
}

/**
 * Natureza do mandato de um(a) deputado(a) numa legislatura, a partir dos eventos do histórico oficial
 * (somente os dessa legislatura, em ordem de data).
 */
export function classificarMandatoCamara(
  eventos: EventoMandato[],
  opt: { legislatura: number; emExercicio: boolean },
): Mandato {
  const { inicio: iniLeg, fim: fimLeg } = periodoDaLegislatura(opt.legislatura);
  const ev = [...eventos].sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
  let condicao: Mandato["condicao"] = null;
  let inicio: string | null = null;
  let terminal: { natureza: Natureza; motivo: string | null; data: string | null } | null = null;
  let ultimaLicenca: Licenca | null = null; // licença ainda não encerrada por uma reassunção
  let naoAssumiu = false;
  let suplenciaEncerrada = false;
  const licencas: Licenca[] = [];

  for (const e of ev) {
    const d = norm(e.descricao);
    const sit = e.situacao ?? "";
    if (d.startsWith("entrada")) {
      if (!condicao) condicao = d.includes("posse de suplente") ? "Suplente" : d.includes("posse de eleito titular") ? "Titular" : null;
      if (!inicio && !d.includes("reassuncao")) inicio = e.data;
      terminal = null; // entrou de novo depois de uma saída (ex.: recontagem de votos): a saída não vale mais
      ultimaLicenca = null;
      naoAssumiu = false;
      suplenciaEncerrada = false;
      continue;
    }
    if (d.startsWith("saida") || d.startsWith("diverso")) {
      const nat = d.startsWith("saida - afastamento definitivo") || sit === "VACANCIA" || sit === "FIM_MANDATO" ? naturezaDaSaida(e.descricao ?? "", sit) : null;
      if (nat) {
        terminal = { natureza: nat, motivo: motivoDe(e.descricao), data: e.data };
        continue;
      }
      if (sit === "Licença" || sit === "Afastado" || sit === "SUSPENSO") {
        const l = { data: e.data, motivo: motivoDe(e.descricao) ?? sit };
        licencas.push(l);
        ultimaLicenca = l;
        continue;
      }
      if (sit === "SUPLENCIA") {
        if (d.includes("negativas de recusa") || d.includes("impossibilidade de assumir")) naoAssumiu = true;
        else if (d.includes("deixa a condicao de licenciado")) ultimaLicenca = null;
        else suplenciaEncerrada = true;
      }
    }
  }

  const base = { legislatura: opt.legislatura, condicao, inicio: inicio ?? (ev.length ? iniLeg : null), licencas };
  const fim = terminal?.data ?? null;
  if (terminal) return { ...base, natureza: terminal.natureza, motivo: terminal.motivo, fim };
  if (opt.legislatura === LEG_ATUAL && opt.emExercicio) return { ...base, natureza: "em_exercicio", motivo: null, fim: null };
  if (naoAssumiu && !inicio) return { ...base, natureza: "nao_assumiu", motivo: "Impossibilidade de assumir o mandato", fim: null };
  if (suplenciaEncerrada) return { ...base, natureza: "suplencia_encerrada", motivo: "Afastamento de suplente", fim: null };
  if (ultimaLicenca) return { ...base, natureza: "licenciado", motivo: ultimaLicenca.motivo, fim: null };
  void fimLeg;
  return { ...base, natureza: "indefinido", motivo: null, fim: null };
}

/* ----- Senado ----- */

export type ExercicioSenado = {
  inicio: string | null;
  fim: string | null;
  /** Sigla da causa de afastamento: TER, REN, PER, DJ, LSP, LP, LS, AFO, RET … */
  causa: string | null;
  descricao: string | null;
};

const CAUSA_LICENCA = new Set(["LSP", "LP", "LS", "LCS", "AFO", "LIC", "LI"]);

/** Natureza do mandato de um(a) senador(a) numa legislatura, a partir dos exercícios do mandato de 8 anos. */
export function classificarMandatoSenado(
  exercicios: ExercicioSenado[],
  opt: { legislatura: number; emExercicio: boolean; participacao: string | null; mandatoAte: string | null },
): Mandato {
  const { inicio: iniLeg, fim: fimLeg } = periodoDaLegislatura(opt.legislatura);
  const naJanela = exercicios.filter((e) => (e.inicio ?? "0000") <= fimLeg && (e.fim ?? "9999") >= iniLeg);
  const condicao: Mandato["condicao"] = /suplente/i.test(opt.participacao ?? "") ? "Suplente" : opt.participacao ? "Titular" : null;
  const licencas: Licenca[] = naJanela
    .filter((e) => e.causa && CAUSA_LICENCA.has(e.causa.trim()))
    .map((e) => ({ data: e.fim, motivo: e.descricao ?? e.causa ?? "" }));
  const inicio = naJanela.map((e) => e.inicio).filter(Boolean).sort()[0] ?? null;
  const base = { legislatura: opt.legislatura, condicao, inicio: inicio && inicio < iniLeg ? iniLeg : inicio, licencas };
  if (opt.legislatura === LEG_ATUAL && opt.emExercicio) return { ...base, natureza: "em_exercicio", motivo: null, fim: null };
  // Saída definitiva dentro da janela: a última com causa conclusiva.
  const saidas = naJanela.filter((e) => e.causa && !CAUSA_LICENCA.has(e.causa.trim()) && e.causa.trim() !== "RET" && e.fim && e.fim <= fimLeg);
  const ultima = saidas.sort((a, b) => (a.fim ?? "").localeCompare(b.fim ?? "")).at(-1);
  if (ultima) {
    const c = (ultima.causa ?? "").trim();
    // CAS = "Cassação de registro/diploma pela Justiça Eleitoral": decisão judicial, não cassação pelo Senado.
    const natureza: Natureza =
      c === "REN" ? "renunciou" : c === "PER" ? "perda_mandato" : c === "DJ" || c === "CAS" ? "decisao_judicial" : c === "FAL" ? "faleceu" : c === "TER" ? "cumprido" : "indefinido";
    return { ...base, natureza, motivo: ultima.descricao, fim: ultima.fim };
  }
  // Suplente cujo último exercício terminou com "Retorno do titular": a suplência acabou.
  if (condicao === "Suplente" && naJanela.some((e) => (e.causa ?? "").trim() === "RET")) {
    const r = naJanela.filter((e) => (e.causa ?? "").trim() === "RET").sort((a, b) => (a.fim ?? "").localeCompare(b.fim ?? "")).at(-1)!;
    return { ...base, natureza: "suplencia_encerrada", motivo: r.descricao, fim: r.fim };
  }
  // Sem saída na janela: se o mandato segue depois do fim da legislatura, ele continuou.
  if (opt.mandatoAte && opt.mandatoAte > fimLeg) return { ...base, natureza: "em_curso", motivo: null, fim: null };
  return { ...base, natureza: "indefinido", motivo: null, fim: null };
}

/** Agrupa eventos por legislatura (ignorando os sem legislatura). */
export function agruparPorLegislatura<T extends { legislatura: number | null }>(eventos: T[]): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const e of eventos) {
    if (e.legislatura == null) continue;
    const l = m.get(e.legislatura);
    if (l) l.push(e);
    else m.set(e.legislatura, [e]);
  }
  return m;
}
