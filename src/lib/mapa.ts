/**
 * Mapa de votos: posição de cada parlamentar calculada SÓ a partir de quem votou com quem, sem nenhuma marcação
 * humana. Serve de teste independente do perfil de votação.
 *
 * Método: matriz parlamentares × votações (Sim = +1, Não = −1, quem não votou = 0 depois de centrar cada votação),
 * e as duas primeiras direções de maior variação (decomposição em valores singulares por iteração de potência
 * com deflação). Sem dependências externas e determinístico.
 */

export type Entrada = { membro: string; votacao: string; valor: 1 | -1 };

export type OpcoesMapa = {
  /** Votação precisa de pelo menos tantos votantes… */
  minVotantes: number;
  /** …e a minoria (Sim ou Não) precisa ter pelo menos esta parcela, senão não separa ninguém. */
  minMinoria: number;
  /** Parlamentares com menos votos que isto ficam de fora (posição pouco confiável). */
  minVotosMembro: number;
};

export type PontoMapa = { id: string; d1: number; d2: number; n: number };
export type ResultadoMapa = {
  pontos: PontoMapa[];
  /** Parcela da variação total explicada por cada dimensão (0…1). */
  var1: number;
  var2: number;
  votacoesUsadas: number;
};

type Par = { u: Float64Array; v: Float64Array; sigma: number };

/** Maior valor singular de X (m × n, linhas contíguas) por iteração de potência. */
function topSingular(X: Float64Array, m: number, n: number, iteracoes = 400): Par {
  const v = new Float64Array(n);
  for (let j = 0; j < n; j++) v[j] = 1 + 0.5 * Math.sin(j * 1.7 + 0.3); // início fixo → resultado determinístico
  const u = new Float64Array(m);
  let sigma = 0;
  for (let it = 0; it < iteracoes; it++) {
    // u = X v
    let nu = 0;
    for (let i = 0; i < m; i++) {
      let s = 0;
      const o = i * n;
      for (let j = 0; j < n; j++) s += X[o + j] * v[j];
      u[i] = s;
      nu += s * s;
    }
    nu = Math.sqrt(nu) || 1;
    for (let i = 0; i < m; i++) u[i] /= nu;
    // v = Xᵀ u
    const nv = new Float64Array(n);
    for (let i = 0; i < m; i++) {
      const o = i * n;
      const ui = u[i];
      if (ui === 0) continue;
      for (let j = 0; j < n; j++) nv[j] += X[o + j] * ui;
    }
    let s2 = 0;
    for (let j = 0; j < n; j++) s2 += nv[j] * nv[j];
    const novo = Math.sqrt(s2);
    for (let j = 0; j < n; j++) v[j] = nv[j] / (novo || 1);
    if (Math.abs(novo - sigma) <= 1e-10 * novo) {
      sigma = novo;
      break;
    }
    sigma = novo;
  }
  return { u, v, sigma };
}

export function calcularMapa(entradas: Entrada[], opts: OpcoesMapa): ResultadoMapa {
  // 1) escolhe as votações com votantes suficientes e uma minoria que separe alguém
  const sim = new Map<string, number>();
  const nao = new Map<string, number>();
  for (const e of entradas) (e.valor === 1 ? sim : nao).set(e.votacao, ((e.valor === 1 ? sim : nao).get(e.votacao) ?? 0) + 1);
  const votacoes: string[] = [];
  for (const v of new Set(entradas.map((e) => e.votacao))) {
    const s = sim.get(v) ?? 0;
    const n = nao.get(v) ?? 0;
    if (s + n >= opts.minVotantes && Math.min(s, n) / (s + n) >= opts.minMinoria) votacoes.push(v);
  }
  votacoes.sort();
  const colunaDe = new Map(votacoes.map((v, j) => [v, j] as const));

  // 2) escolhe os parlamentares com votos suficientes nessas votações
  const contagem = new Map<string, number>();
  for (const e of entradas) if (colunaDe.has(e.votacao)) contagem.set(e.membro, (contagem.get(e.membro) ?? 0) + 1);
  const membros = [...contagem.entries()].filter(([, c]) => c >= opts.minVotosMembro).map(([id]) => id).sort();
  const linhaDe = new Map(membros.map((id, i) => [id, i] as const));
  const m = membros.length;
  const n = votacoes.length;
  if (m < 3 || n < 3) return { pontos: [], var1: 0, var2: 0, votacoesUsadas: n };

  // 3) matriz centrada por votação; ausência = 0 (a média, depois de centrar)
  const X = new Float64Array(m * n);
  const soma = new Float64Array(n);
  const qtd = new Float64Array(n);
  for (const e of entradas) {
    const i = linhaDe.get(e.membro);
    const j = colunaDe.get(e.votacao);
    if (i === undefined || j === undefined) continue;
    X[i * n + j] = e.valor;
    soma[j] += e.valor;
    qtd[j] += 1;
  }
  const marcado = new Uint8Array(m * n);
  for (const e of entradas) {
    const i = linhaDe.get(e.membro);
    const j = colunaDe.get(e.votacao);
    if (i !== undefined && j !== undefined) marcado[i * n + j] = 1;
  }
  for (let j = 0; j < n; j++) {
    const media = qtd[j] ? soma[j] / qtd[j] : 0;
    for (let i = 0; i < m; i++) X[i * n + j] = marcado[i * n + j] ? X[i * n + j] - media : 0;
  }
  let total = 0;
  for (let k = 0; k < X.length; k++) total += X[k] * X[k];

  // 4) duas dimensões, com deflação
  const p1 = topSingular(X, m, n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) X[i * n + j] -= p1.sigma * p1.u[i] * p1.v[j];
  const p2 = topSingular(X, m, n);

  const c1 = Array.from(p1.u, (x) => x * p1.sigma);
  const c2 = Array.from(p2.u, (x) => x * p2.sigma);
  const escala = Math.max(...c1.map(Math.abs), ...c2.map(Math.abs)) || 1; // mesma escala nos dois eixos
  const nVotos = new Map(contagem);
  return {
    pontos: membros.map((id, i) => ({ id, d1: c1[i] / escala, d2: c2[i] / escala, n: nVotos.get(id) ?? 0 })),
    var1: total ? (p1.sigma * p1.sigma) / total : 0,
    var2: total ? (p2.sigma * p2.sigma) / total : 0,
    votacoesUsadas: n,
  };
}

/** Vira o sinal de cada dimensão para que o grupo `positivo` fique, em média, do lado positivo de d1 (e d2). */
export function orientar(r: ResultadoMapa, positivo: Set<string>, negativo: Set<string>): ResultadoMapa {
  const media = (ids: Set<string>, k: "d1" | "d2") => {
    const xs = r.pontos.filter((p) => ids.has(p.id)).map((p) => p[k]);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  const s1 = media(positivo, "d1") - media(negativo, "d1") < 0 ? -1 : 1;
  const s2 = media(positivo, "d2") - media(negativo, "d2") < 0 ? -1 : 1;
  return { ...r, pontos: r.pontos.map((p) => ({ ...p, d1: p.d1 * s1, d2: p.d2 * s2 })) };
}

/** Correlação de Spearman (postos com média nos empates). Devolve null com menos de 3 pares ou variância zero. */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const postos = (a: number[]) => {
    const idx = a.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(n);
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const media = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = media;
      i = j + 1;
    }
    return r;
  };
  const rx = postos(xs);
  const ry = postos(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
