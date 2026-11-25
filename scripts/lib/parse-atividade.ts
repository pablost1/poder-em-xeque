/*
 * Atividade parlamentar da Câmara a partir dos arquivos em lote: autoria de proposições e participação em órgãos.
 * Funções puras, testadas com registros no formato real dos arquivos.
 */

export type AutorBulk = { idProposicao: number; uriAutor: string | null; proponente: string | number | null; ordemAssinatura?: string | number | null };
export type PropBulk = {
  id: number;
  siglaTipo: string | null;
  numero: number | null;
  ano: number | null;
  ementa: string | null;
  dataApresentacao: string | null;
  urlInteiroTeor: string | null;
  ultimoStatus?: { descricaoSituacao?: string | null; idSituacao?: number | string | null; data?: string | null } | null;
};
export type OrgaoBulk = {
  siglaOrgao: string;
  nomeOrgao: string;
  nomePublicacaoOrgao?: string | null;
  cargo: string;
  dataInicio: string;
  dataFim: string | null;
  uriDeputado: string;
};

/** Id do deputado quando o autor é um deputado ("…/deputados/74041"); órgãos, Senado e outros viram null. */
export function idDoDeputadoAutor(uriAutor: string | null | undefined): string | null {
  const m = /\/deputados\/(\d+)\s*$/.exec(uriAutor ?? "");
  return m ? `C:${m[1]}` : null;
}

/** Quem propõe de fato (proponente = 1). Apoiadores que só assinam não contam como autoria. */
export const ehProponente = (a: AutorBulk): boolean => String(a.proponente ?? "") === "1";

/** Autores deputados proponentes de cada proposição. */
export function autoresPorProposicao(autores: AutorBulk[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const a of autores) {
    const dep = idDoDeputadoAutor(a.uriAutor);
    if (!dep || !ehProponente(a)) continue;
    const l = out.get(a.idProposicao) ?? [];
    if (!l.includes(dep)) l.push(dep);
    out.set(a.idProposicao, l);
  }
  return out;
}

/** Rótulo "PL 4148/2023". */
export const rotuloProposicao = (p: Pick<PropBulk, "siglaTipo" | "numero" | "ano">): string =>
  p.siglaTipo && p.numero != null && p.ano != null ? `${p.siglaTipo} ${p.numero}/${p.ano}` : (p.siglaTipo ?? "Proposição");

export type CargoComissao = "Presidente" | "1º Vice-Presidente" | "2º Vice-Presidente" | "3º Vice-Presidente" | "Titular" | "Suplente" | "Outro";

/** Cargo num órgão, como a Câmara escreve. Tudo que não for um dos conhecidos vira "Outro" com o texto original preservado. */
export function cargoDaComissao(cargo: string): string {
  return cargo.trim() || "Outro";
}

/** Linha de órgão que conta como comissão: não é a Mesa Diretora, que tem tabela própria. */
export const ehComissao = (o: OrgaoBulk): boolean => o.siglaOrgao !== "MESA";

/** Em que pé está a proposição, agrupado para as contas. */
export type GrupoSituacao = "lei" | "senado" | "veto" | "arquivada" | "retirada" | "tramitando" | "outra";

const semAcento = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * Agrupa o último andamento (descricaoSituacao) de uma proposição.
 *   lei        = "Transformado em Norma Jurídica" (lei, emenda constitucional, decreto legislativo, resolução promulgados);
 *   senado     = já saiu da Câmara e espera o Senado;
 *   veto       = vetado totalmente;
 *   arquivada  = arquivada, perdeu a eficácia ou prejudicada;
 *   retirada   = retirada ou devolvida ao autor;
 *   tramitando = ainda em andamento na Câmara (aguardando relator, parecer, pauta, apensada a outra …);
 *   outra      = sem informação ou andamento que não se encaixa (não conta como aprovada nem como parada).
 * Projeto apensado a outro ("Tramitando em Conjunto") conta como tramitando, não como aprovado, mesmo que a ideia vire lei por outro projeto.
 */
export function grupoDaSituacao(descricao: string | null | undefined): GrupoSituacao {
  const s = semAcento(descricao ?? "");
  if (!s || s.startsWith("<")) return "outra";
  if (s.startsWith("transformado em norma")) return "lei";
  if (s.startsWith("vetado")) return "veto";
  if (/senado federal/.test(s) && /(aprecia|enviad|envio)/.test(s)) return "senado";
  if (s.startsWith("arquivada") || s.startsWith("perdeu a eficacia") || s.startsWith("prejudicialidade")) return "arquivada";
  if (s.startsWith("retirado") || s.startsWith("devolvida")) return "retirada";
  if (s.startsWith("aguardando") || s.startsWith("tramitando") || s.startsWith("pronta para pauta") || s.startsWith("enviada ao congresso") || s.startsWith("comissao em funcionamento")) return "tramitando";
  return "outra";
}
