/*
 * Linhagens partidárias: o mesmo partido muda de nome (PFL→DEM→UNIÃO, PMDB→MDB, PR→PL …). Para acompanhar um partido
 * ao longo das legislaturas agrupamos as siglas de uma mesma linhagem sob um nome canônico (o mais recente).
 *
 * É um julgamento curado, não um dado oficial. Regras:
 *   - só entram juntas siglas do MESMO partido com outro nome (renomeação), como PMDB→MDB;
 *   - fusões entre partidos distintos não apagam a história de cada um: o PSL fica numa linhagem própria até 2022,
 *     quando se fundiu ao DEM para formar o UNIÃO; quem votou como UNIÃO entra na linhagem UNIÃO (DEM/PFL);
 *   - a lista foi montada a partir das 54 siglas que aparecem nos votos de 2003 a hoje (veja tests/partidos.test.ts).
 */

export type Linhagem = {
  /** Nome exibido (o mais recente da linhagem). */
  canonica: string;
  /** Todas as siglas desta linhagem, como aparecem nos dados (Câmara e Senado). */
  siglas: string[];
  /** Observação mostrada na metodologia. */
  nota?: string;
};

export const LINHAGENS: Linhagem[] = [
  { canonica: "PT", siglas: ["PT"] },
  { canonica: "PSDB", siglas: ["PSDB"] },
  { canonica: "MDB", siglas: ["MDB", "PMDB"], nota: "PMDB passou a MDB em 2017." },
  { canonica: "PP", siglas: ["PP", "PPB", "PPR"], nota: "PPB passou a PP em 2003; hoje se apresenta como Progressistas." },
  {
    canonica: "PL",
    siglas: ["PL", "PR", "PRONA"],
    nota: "O PL (antigo) e o PRONA formaram o PR em 2006; o PR voltou a se chamar PL em 2019. Tudo é uma só linhagem.",
  },
  { canonica: "PSD", siglas: ["PSD"], nota: "O PSD atual foi criado em 2011." },
  { canonica: "PSB", siglas: ["PSB"] },
  { canonica: "PDT", siglas: ["PDT"] },
  { canonica: "REPUBLICANOS", siglas: ["REPUBLICANOS", "PRB", "PMR"], nota: "PMR virou PRB em 2005; o PRB passou a Republicanos em 2019." },
  {
    canonica: "UNIÃO",
    siglas: ["UNIÃO", "DEM", "PFL"],
    nota: "PFL passou a DEM em 2007; o DEM se fundiu ao PSL em 2022 e formou o UNIÃO. O PSL tem linhagem própria até a fusão.",
  },
  { canonica: "PSL", siglas: ["PSL"], nota: "Fundiu-se ao DEM em 2022 (UNIÃO)." },
  { canonica: "PTB", siglas: ["PTB"], nota: "Fundiu-se ao Patriota em 2023, formando o PRD." },
  { canonica: "PRD", siglas: ["PRD"], nota: "Criado em 2023 pela fusão de PTB e Patriota." },
  { canonica: "PODE", siglas: ["PODE", "PTN"], nota: "PTN passou a Podemos em 2016." },
  { canonica: "PCdoB", siglas: ["PCdoB"] },
  { canonica: "PSC", siglas: ["PSC"], nota: "Incorporado ao Podemos em 2023." },
  { canonica: "PSOL", siglas: ["PSOL"] },
  { canonica: "PROS", siglas: ["PROS"] },
  { canonica: "SOLIDARIEDADE", siglas: ["SOLIDARIEDADE", "SD", "SDD"], nota: "SD e SDD são abreviações antigas do Solidariedade." },
  { canonica: "PV", siglas: ["PV"] },
  { canonica: "NOVO", siglas: ["NOVO"] },
  { canonica: "AVANTE", siglas: ["AVANTE", "PTdoB"], nota: "PTdoB passou a Avante em 2017." },
  { canonica: "CIDADANIA", siglas: ["CIDADANIA", "PPS"], nota: "PPS passou a Cidadania em 2019." },
  { canonica: "PATRIOTA", siglas: ["PATRIOTA", "PATRI", "PEN"], nota: "PEN passou a Patriota em 2018; fundiu-se ao PTB em 2023." },
  { canonica: "REDE", siglas: ["REDE"] },
  { canonica: "PHS", siglas: ["PHS"], nota: "Incorporado ao Podemos em 2019." },
  { canonica: "PMN", siglas: ["PMN"] },
  { canonica: "PRP", siglas: ["PRP"], nota: "Incorporado ao Patriota em 2019." },
  { canonica: "PTC", siglas: ["PTC"] },
  { canonica: "PMB", siglas: ["PMB"] },
  { canonica: "PRTB", siglas: ["PRTB"] },
  { canonica: "DC", siglas: ["DC", "PSDC"], nota: "PSDC passou a DC em 2018." },
  { canonica: "PAN", siglas: ["PAN"] },
  { canonica: "PPL", siglas: ["PPL"] },
  { canonica: "MISSÃO", siglas: ["MISSÃO"] },
];

/** Siglas que não são partido (sem filiação ou sem registro): ficam fora de qualquer série partidária. */
export const SEM_PARTIDO = ["S.PART.", "S/Partido", "Sem Partido", "Sem registro"];

const PORSIGLA = new Map<string, Linhagem>();
for (const l of LINHAGENS) for (const s of l.siglas) PORSIGLA.set(s.toUpperCase(), l);

/** Linhagem de uma sigla, ou null se for "sem partido" ou desconhecida. */
export function linhagemDe(sigla: string | null | undefined): Linhagem | null {
  if (!sigla) return null;
  return PORSIGLA.get(sigla.trim().toUpperCase()) ?? null;
}

/** Nome canônico da sigla (ou null). */
export function partidoCanonico(sigla: string | null | undefined): string | null {
  return linhagemDe(sigla)?.canonica ?? null;
}

export function semPartido(sigla: string | null | undefined): boolean {
  if (!sigla) return true;
  return SEM_PARTIDO.some((s) => s.toUpperCase() === sigla.trim().toUpperCase());
}

/** Siglas das quais não sabemos nada: devem ser tratadas como alerta (nunca ignoradas em silêncio). */
export function siglasDesconhecidas(siglas: Iterable<string | null>): string[] {
  const out = new Set<string>();
  for (const s of siglas) if (s && !semPartido(s) && !linhagemDe(s)) out.add(s);
  return [...out].sort();
}
