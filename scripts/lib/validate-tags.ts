/** Validação das marcações antes de gravar. Função pura: fácil de testar. */
export const TOPICS = [
  "economy", "taxes", "labor", "social-security", "health", "education", "security", "environment",
  "rights-customs", "politics-elections", "public-administration", "agriculture-land",
  "infrastructure-energy", "international", "other",
];

export type TagOut = {
  bills?: { bill: string; topic: string; summary: string }[];
  votes?: { sv: string; e: number; p: number; proc: boolean; c: number; why?: string }[];
};

/** Devolve a lista de problemas (vazia = arquivo válido). */
export function validarTags(out: TagOut, svIds: Set<string>, billIds: Set<string>): string[] {
  const errors: string[] = [];
  for (const b of out.bills ?? []) {
    if (!billIds.has(b.bill)) errors.push(`unknown bill ${b.bill}`);
    if (!TOPICS.includes(b.topic)) errors.push(`bad topic "${b.topic}" for ${b.bill}`);
    if (!b.summary || b.summary.length < 5) errors.push(`missing summary for ${b.bill}`);
  }
  for (const v of out.votes ?? []) {
    if (!svIds.has(v.sv)) errors.push(`unknown vote ${v.sv}`);
    if (!(v.e >= -1 && v.e <= 1)) errors.push(`${v.sv}: e out of range (${v.e})`);
    if (!(v.p >= -1 && v.p <= 1)) errors.push(`${v.sv}: p out of range (${v.p})`);
    if (!(v.c >= 0 && v.c <= 1)) errors.push(`${v.sv}: c out of range (${v.c})`);
    if (typeof v.proc !== "boolean") errors.push(`${v.sv}: proc must be boolean`);
  }
  return errors;
}

export type Traducao = { bills?: Record<string, string>; votes?: Record<string, string> };

/** Troca resumos e justificativas pelos textos em português, quando existirem; o resto fica como está. */
export function aplicarTraducao(out: TagOut, pt: Traducao): TagOut {
  return {
    bills: out.bills?.map((b) => ({ ...b, summary: pt.bills?.[b.bill] ?? b.summary })),
    votes: out.votes?.map((v) => ({ ...v, why: pt.votes?.[v.sv] ?? v.why })),
  };
}
