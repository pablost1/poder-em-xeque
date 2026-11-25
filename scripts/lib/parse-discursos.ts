/*
 * Discursos de parlamentares: leitura das respostas das APIs da Câmara e do Senado e classificação do tipo de fala.
 * Funções puras. Nunca guardamos a transcrição, só data, tipo, resumo e links.
 */

export type DiscursoCamara = {
  dataHoraInicio: string | null;
  tipoDiscurso: string | null;
  faseEvento?: { titulo: string | null } | null;
  sumario?: string | null;
  urlTexto?: string | null;
  urlVideo?: string | null;
};

export type PronunciamentoSenado = {
  CodigoPronunciamento: string;
  TipoUsoPalavra?: { Descricao?: string | null } | null;
  DataPronunciamento?: string | null;
  TextoResumo?: string | null;
  UrlTexto?: string | null;
};

/** Como a fala entra nas contas. */
export type GrupoDiscurso = "pronunciamento" | "intervencao" | "presidencia";

export type DiscursoLinha = {
  data: string;
  tipo: string;
  fase: string | null;
  grupo: GrupoDiscurso;
  sumario: string | null;
  url: string | null;
  video: string | null;
};

const semAcento = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();

/**
 * Pronunciamento = tempo próprio de fala (Breves Comunicações, Grande Expediente, Comunicação Parlamentar ou Inadiável, tribuna).
 * Intervenção = fala ligada ao andamento da sessão (pela ordem, encaminhamento, discussão, como líder, orientação, relator …).
 * Presidência = quem dirige a sessão; não é discurso próprio e fica fora das contas.
 */
export function grupoDoTipo(tipo: string | null | undefined): GrupoDiscurso {
  const t = semAcento(tipo ?? "");
  if (t.includes("PRESIDEN")) return "presidencia";
  if (/BREVES COMUNICA|GRANDE EXPEDIENTE|COMUNICA\S* PARLAMENTAR|COMUNICA\S* INADI|TRIBUNA|PRONUNCIAMENTO|HOMENAGEM|DISCURSO/.test(t)) return "pronunciamento";
  return "intervencao";
}

const texto = (s: string | null | undefined): string | null => {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  return v || null;
};

/** Resposta da API da Câmara → linhas. Sem data, ignora. */
export function discursosDaCamara(dados: DiscursoCamara[]): DiscursoLinha[] {
  const out: DiscursoLinha[] = [];
  for (const d of dados) {
    const data = d.dataHoraInicio?.slice(0, 10);
    if (!data) continue;
    const tipo = texto(d.tipoDiscurso) ?? "Discurso";
    out.push({ data, tipo, fase: texto(d.faseEvento?.titulo), grupo: grupoDoTipo(tipo), sumario: texto(d.sumario), url: texto(d.urlTexto), video: texto(d.urlVideo) });
  }
  return out;
}

/** A API do Senado devolve objeto quando há um só item e lista quando há vários. */
export function listaDoSenado(resposta: unknown): PronunciamentoSenado[] {
  const r = resposta as { DiscursosParlamentar?: { Parlamentar?: { Pronunciamentos?: { Pronunciamento?: PronunciamentoSenado | PronunciamentoSenado[] } } } };
  const p = r?.DiscursosParlamentar?.Parlamentar?.Pronunciamentos?.Pronunciamento;
  return !p ? [] : Array.isArray(p) ? p : [p];
}

export function discursosDoSenado(dados: PronunciamentoSenado[]): DiscursoLinha[] {
  const out: DiscursoLinha[] = [];
  for (const d of dados) {
    if (!d.DataPronunciamento) continue;
    const tipo = texto(d.TipoUsoPalavra?.Descricao) ?? "Pronunciamento";
    out.push({ data: d.DataPronunciamento.slice(0, 10), tipo, fase: null, grupo: grupoDoTipo(tipo), sumario: texto(d.TextoResumo), url: texto(d.UrlTexto), video: null });
  }
  return out;
}
