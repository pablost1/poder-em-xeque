/** Votações que são moções sobre o próprio processo (urgência, adiamento, ordem de votação …): ficam fora do perfil. */
export const PROCEDURAL: RegExp[] = [
  /requerimento/i,
  /requisição/i,
  /quest[ãa]o de ordem/i,
  /\bretirada de pauta\b/i,
  /\badiamento\b/i,
  /\bsobrestamento\b/i,
  /\binversão de pauta\b/i,
  /\bprorroga[çc][ãa]o\b/i,
  /\bverifica[çc][ãa]o de quorum\b/i,
];

export function ehProcedural(descricao: string | null | undefined): boolean {
  return !!descricao && PROCEDURAL.some((re) => re.test(descricao));
}
