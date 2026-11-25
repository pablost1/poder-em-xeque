/*
 * Legislaturas: períodos de 4 anos que começam em 1º de fevereiro (a 57ª vai de 2023-02-01 a 2027-01-31).
 * A numeração segue a da Câmara dos Deputados (`/legislaturas`), que é a mesma usada no Senado.
 */

/** Legislatura em andamento: o site inteiro (rankings, mapa, perfil) fala dela. O histórico fica por baixo. */
export const LEG_ATUAL = 57;

/** Primeira legislatura coberta pelo histórico (a 52ª começa em 2003-02-01). */
export const LEG_PRIMEIRA = 52;

/** Número da legislatura de uma data AAAA-MM-DD. Janeiro ainda pertence à legislatura que está terminando. */
export function legislaturaDaData(data: string): number {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const a = mes === 1 ? ano - 1 : ano;
  return 51 + Math.floor((a - 1999) / 4);
}

/** Início e fim (AAAA-MM-DD) de uma legislatura. */
export function periodoDaLegislatura(n: number): { inicio: string; fim: string } {
  const ano = 1999 + (n - 51) * 4;
  return { inicio: `${ano}-02-01`, fim: `${ano + 4}-01-31` };
}

/** Rótulo para a interface: "57ª legislatura (2023–2027)". */
export function rotuloLegislatura(n: number, curto = false): string {
  const { inicio, fim } = periodoDaLegislatura(n);
  const anos = `${inicio.slice(0, 4)}–${fim.slice(0, 4)}`;
  return curto ? `${n}ª (${anos})` : `${n}ª legislatura (${anos})`;
}

/**
 * Legislatura pedida na URL (?leg=). Sem valor, vale a atual (padrão do site); "todas" desliga o filtro; um número
 * fora do histórico também cai na atual, para ninguém ver uma lista vazia por engano.
 */
export function lerLegislatura(v: string | string[] | undefined): number | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return LEG_ATUAL;
  if (s === "todas") return undefined;
  const n = Number(s);
  return Number.isInteger(n) && n >= LEG_PRIMEIRA && n <= LEG_ATUAL ? n : LEG_ATUAL;
}

/** Lista de legislaturas do histórico, da mais recente para a mais antiga. */
export function legislaturasDoHistorico(): number[] {
  const out: number[] = [];
  for (let n = LEG_ATUAL; n >= LEG_PRIMEIRA; n--) out.push(n);
  return out;
}

/** Expressão SQL equivalente a legislaturaDaData(coluna). */
export function sqlLegislatura(coluna: string): string {
  // O deslocamento de 400 anos mantém o dividendo positivo: a divisão inteira do SQLite trunca para zero, Math.floor não.
  return `(51 + ((CAST(strftime('%Y', ${coluna}, '-1 month') AS INTEGER) - 1999 + 400) / 4 - 100))`;
}
