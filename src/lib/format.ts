/** Formatação pt-BR compartilhada. */

/** "2026-11-23" -> "23/11/2026" (sem passar por Date, para não sofrer com fuso). */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** 1234567 -> "1.234.567" */
export function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? "–" : n.toLocaleString("pt-BR");
}

/** 0.987 -> "99%"; com casas: "98,7%". */
export function fmtPct(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined
    ? "–"
    : `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Plural simples: plural(1, "voto") -> "1 voto"; plural(2, "voto") -> "2 votos". */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${fmtNum(n)} ${n === 1 ? singular : (pluralForm ?? singular + "s")}`;
}
