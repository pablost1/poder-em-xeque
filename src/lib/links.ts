/** Links para a página oficial de uma proposição. O id do banco é "C:{idProposicao}" ou "S:{codigoMateria}". */

export type CasaOficial = { nome: "Câmara dos Deputados" | "Senado Federal"; url: string };

export function proposicaoOficial(billId: string | null | undefined): CasaOficial | null {
  if (!billId) return null;
  const m = /^([CS]):(\d+)$/.exec(billId);
  if (!m) return null;
  return m[1] === "C"
    ? {
        nome: "Câmara dos Deputados",
        url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${m[2]}`,
      }
    : {
        nome: "Senado Federal",
        url: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${m[2]}`,
      };
}

/** Só a URL (ou null). */
export function urlProposicao(billId: string | null | undefined): string | null {
  return proposicaoOficial(billId)?.url ?? null;
}
