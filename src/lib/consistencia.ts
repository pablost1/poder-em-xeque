/**
 * Medidas de consistência entre duas marcações independentes do mesmo conjunto de votações.
 * Funções puras: não dependem do banco.
 */
import { ECONOMIC_MIN_MAGNITUDE, PRIVILEGE_MIN_MAGNITUDE } from "./derive";
import { spearman } from "./mapa";

export type Marca = { sv: string; e: number; p: number; proc: boolean; c: number };

export type CatEco = "ESTADO" | "NEUTRO" | "MERCADO";
export type CatPriv = "CONTRA" | "NEUTRO" | "PRO";

export function catEconomica(e: number): CatEco {
  return e <= -ECONOMIC_MIN_MAGNITUDE ? "ESTADO" : e >= ECONOMIC_MIN_MAGNITUDE ? "MERCADO" : "NEUTRO";
}
export function catPrivilegio(p: number): CatPriv {
  return p <= -PRIVILEGE_MIN_MAGNITUDE ? "CONTRA" : p >= PRIVILEGE_MIN_MAGNITUDE ? "PRO" : "NEUTRO";
}

/** Kappa de Cohen entre duas classificações (1 = concordância total, 0 = no nível do acaso). */
export function kappa<T extends string>(pares: [T, T][]): number | null {
  const n = pares.length;
  if (n === 0) return null;
  const cats = [...new Set(pares.flat())];
  const a = new Map<T, number>();
  const b = new Map<T, number>();
  let iguais = 0;
  for (const [x, y] of pares) {
    a.set(x, (a.get(x) ?? 0) + 1);
    b.set(y, (b.get(y) ?? 0) + 1);
    if (x === y) iguais++;
  }
  const po = iguais / n;
  const pe = cats.reduce((s, c) => s + ((a.get(c) ?? 0) / n) * ((b.get(c) ?? 0) / n), 0);
  return pe === 1 ? null : (po - pe) / (1 - pe);
}

export type Comparacao = {
  n: number;
  /** Economia: concordância bruta, kappa, e inversões de sinal entre os que ambos acharam com direção. */
  eco: { acordo: number; kappa: number | null; ambosComDirecao: number; sinalOposto: number; erroMedio: number };
  /** Privilégios, mesma ideia. */
  priv: { acordo: number; kappa: number | null; ambosComDirecao: number; sinalOposto: number; erroMedio: number };
  /** Um marcou como procedimental e o outro não. */
  procDiverge: number;
};

/** Compara duas marcações nos votos que as duas têm (ignora quem as duas acham procedimental). */
export function compararMarcacoes(a: Marca[], b: Marca[]): Comparacao {
  const mb = new Map(b.map((m) => [m.sv, m]));
  const pares = a.filter((x) => mb.has(x.sv)).map((x) => [x, mb.get(x.sv)!] as const);
  const subst = pares.filter(([x, y]) => !(x.proc && y.proc));
  const procDiverge = subst.filter(([x, y]) => x.proc !== y.proc).length;
  const ambosSubst = subst.filter(([x, y]) => !x.proc && !y.proc);

  const medir = (cat: (v: number) => string, val: (m: Marca) => number, lim: number) => {
    const cats = ambosSubst.map(([x, y]) => [cat(val(x)), cat(val(y))] as [string, string]);
    const acordo = cats.length ? cats.filter(([p, q]) => p === q).length / cats.length : 0;
    const comDir = ambosSubst.filter(([x, y]) => Math.abs(val(x)) >= lim && Math.abs(val(y)) >= lim);
    const oposto = comDir.filter(([x, y]) => Math.sign(val(x)) !== Math.sign(val(y))).length;
    const erro = ambosSubst.length ? ambosSubst.reduce((s, [x, y]) => s + Math.abs(val(x) - val(y)), 0) / ambosSubst.length : 0;
    return { acordo, kappa: kappa(cats), ambosComDirecao: comDir.length, sinalOposto: oposto, erroMedio: erro };
  };
  return {
    n: ambosSubst.length,
    eco: medir((v) => catEconomica(v), (m) => m.e, ECONOMIC_MIN_MAGNITUDE),
    priv: medir((v) => catPrivilegio(v), (m) => m.p, PRIVILEGE_MIN_MAGNITUDE),
    procDiverge,
  };
}

export type VotoMembro = { membro: string; vote: "SIM" | "NAO"; e: number; p: number; c: number };

/**
 * Notas Estado e Privilégios de cada parlamentar sob uma marcação (mesma fórmula do perfil de votação):
 * peso = |valor| × confiança; Sim = +valor, Não = −valor.
 */
export function pontuarMembros(
  votos: VotoMembro[],
  minEco: number,
  minPriv: number,
): Map<string, { estado: number | null; privilegio: number | null }> {
  const acc = new Map<string, { lw: number; rw: number; ne: number; pf: number; pw: number; np: number }>();
  for (const v of votos) {
    const a = acc.get(v.membro) ?? { lw: 0, rw: 0, ne: 0, pf: 0, pw: 0, np: 0 };
    const d = v.vote === "SIM" ? 1 : -1;
    if (Math.abs(v.e) >= ECONOMIC_MIN_MAGNITUDE) {
      a.ne++;
      if (d * v.e < 0) a.lw += Math.abs(v.e) * v.c;
      else a.rw += Math.abs(v.e) * v.c;
    }
    if (Math.abs(v.p) >= PRIVILEGE_MIN_MAGNITUDE) {
      a.np++;
      a.pw += Math.abs(v.p) * v.c;
      if (d * v.p > 0) a.pf += Math.abs(v.p) * v.c;
    }
    acc.set(v.membro, a);
  }
  const out = new Map<string, { estado: number | null; privilegio: number | null }>();
  for (const [m, a] of acc) {
    out.set(m, {
      estado: a.ne >= minEco && a.lw + a.rw > 0 ? (100 * a.lw) / (a.lw + a.rw) : null,
      privilegio: a.np >= minPriv && a.pw > 0 ? (100 * a.pf) / a.pw : null,
    });
  }
  return out;
}

/** Correlação de Spearman entre as notas de dois conjuntos, nos parlamentares que têm nota nos dois. */
export function correlacaoDeNotas(
  a: Map<string, { estado: number | null; privilegio: number | null }>,
  b: Map<string, { estado: number | null; privilegio: number | null }>,
  eixo: "estado" | "privilegio",
): { rho: number | null; n: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [m, va] of a) {
    const vb = b.get(m);
    if (vb && va[eixo] !== null && vb[eixo] !== null) {
      xs.push(va[eixo]!);
      ys.push(vb[eixo]!);
    }
  }
  return { rho: spearman(xs, ys), n: xs.length };
}
