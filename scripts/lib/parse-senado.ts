import { normalizeVote } from "../../src/lib/db";
import type { ParsedVotacao } from "./parsed";

export type VotoSenado = {
  codigoParlamentar: number;
  nomeParlamentar: string;
  siglaPartidoParlamentar: string | null;
  siglaUFParlamentar: string | null;
  siglaVotoParlamentar: string;
  descricaoVotoParlamentar?: string | null;
};
export type VotacaoSenado = {
  codigoSessaoVotacao: number;
  codigoMateria: number | null;
  dataSessao: string;
  descricaoVotacao: string | null;
  ementa: string | null;
  identificacao: string | null;
  resultadoVotacao: string | null; // 'A' aprovada, 'R' rejeitada
  votacaoSecreta: string; // 'S' | 'N'
  votos: VotoSenado[] | null;
};

/**
 * Só estes rótulos são votos de fato. AP, LS, MIS, NCom, P-NRV ("presente, não registrou voto"), "Votou" (votação
 * secreta) e o presidente da sessão não são, o que combina com a Câmara, onde quem não votou simplesmente não tem linha.
 */
const CONTADOS = new Set(["SIM", "NAO", "ABS", "OBS"]);

/** Rótulos que não são voto mas dizem por que a pessoa não votou. "Votou" é só o marcador das votações secretas. */
export function ausenciasDoSenado(v: VotacaoSenado): NonNullable<ParsedVotacao["ausencias"]> {
  if (v.votacaoSecreta === "S") return [];
  return (v.votos ?? [])
    .filter((x) => !CONTADOS.has(normalizeVote(x.siglaVotoParlamentar)) && x.siglaVotoParlamentar !== "Votou")
    .map((x) => ({ memberId: `S:${x.codigoParlamentar}`, codigo: x.siglaVotoParlamentar, descricao: x.descricaoVotoParlamentar ?? null }));
}

/** Converte uma votação do Senado; devolve null para votações secretas ou sem votos individuais. */
export function parseVotacaoSenado(v: VotacaoSenado): ParsedVotacao | null {
  if (v.votacaoSecreta === "S") return null;
  const votos = (v.votos ?? [])
    .map((x) => ({ x, code: normalizeVote(x.siglaVotoParlamentar) }))
    .filter((r) => CONTADOS.has(r.code));
  if (votos.length === 0) return null;
  return {
    chamber: "S",
    svId: `S:${v.codigoSessaoVotacao}`,
    date: v.dataSessao.slice(0, 10),
    description: v.descricaoVotacao,
    result: v.resultadoVotacao === "A" ? "approved" : v.resultadoVotacao === "R" ? "rejected" : null,
    nominal: true,
    bill: v.codigoMateria
      ? { id: `S:${v.codigoMateria}`, label: v.identificacao ?? `Matéria ${v.codigoMateria}`, ementa: v.ementa }
      : null,
    members: votos.map(({ x }) => ({
      id: `S:${x.codigoParlamentar}`,
      name: x.nomeParlamentar,
      party: x.siglaPartidoParlamentar,
      uf: x.siglaUFParlamentar,
      photo: `https://legis.senado.leg.br/senadores/fotos-oficiais/${x.codigoParlamentar}`,
    })),
    votes: votos.map(({ x, code }) => ({ memberId: `S:${x.codigoParlamentar}`, party: x.siglaPartidoParlamentar, vote: code })),
    orientations: [],
    ausencias: ausenciasDoSenado(v),
  };
}
