/*
 * Presença nas sessões da Câmara: arquivos em lote https://dadosabertos.camara.leg.br/arquivos/
 *   eventos/json/eventos-{ano}.json                              (tipo e local de cada evento)
 *   eventosPresencaDeputados/json/eventosPresencaDeputados-{ano}.json   (um registro por evento e deputado presente)
 */
export type EventoBulk = {
  id: number;
  dataHoraInicio: string;
  situacao?: string | null;
  descricaoTipo: string | null;
  localCamara?: { nome?: string | null } | null;
};
export type PresencaBulk = { idEvento: number; dataHoraInicio: string; idDeputado: number | string };

/** Sessão deliberativa do Plenário (não conta reunião de comissão, audiência, seminário nem sessão solene). */
export function ehSessaoDeliberativaDoPlenario(e: EventoBulk): boolean {
  return e.descricaoTipo === "Sessão Deliberativa" && (e.localCamara?.nome ?? "").startsWith("Plenário da Câmara");
}

export type SessaoPresenca = { id: number; data: string; hora: string; presentes: Set<number>; comPresenca: boolean };

/** Sessão cancelada não aconteceu: não conta nem como sessão sem lista. */
export const foiCancelada = (e: EventoBulk) => (e.situacao ?? "").toLowerCase().startsWith("cancelad");

/**
 * Junta eventos e presenças: devolve as sessões deliberativas do Plenário que não foram canceladas, com o conjunto de
 * deputados presentes. As que a Câmara não publicou lista de presença voltam com `comPresenca = false` (ficam fora das
 * contas, mas contam para dizer quanto da legislatura tem registro). Quem não está no conjunto estava ausente da sessão.
 */
export function montarSessoes(eventos: EventoBulk[], presencas: PresencaBulk[]): SessaoPresenca[] {
  const base = new Map<number, SessaoPresenca>();
  for (const e of eventos) {
    if (!ehSessaoDeliberativaDoPlenario(e) || foiCancelada(e)) continue;
    base.set(e.id, { id: e.id, data: e.dataHoraInicio.slice(0, 10), hora: e.dataHoraInicio.slice(11, 16), presentes: new Set(), comPresenca: false });
  }
  for (const p of presencas) base.get(p.idEvento)?.presentes.add(Number(p.idDeputado));
  for (const s of base.values()) s.comPresenca = s.presentes.size > 0;
  return [...base.values()].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
}
