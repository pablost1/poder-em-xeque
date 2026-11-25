export const TOPIC_LABEL: Record<string, string> = {
  economy: "Economia",
  taxes: "Tributos",
  labor: "Trabalho",
  "social-security": "Previdência e benefícios",
  health: "Saúde",
  education: "Educação",
  security: "Segurança e justiça",
  environment: "Meio ambiente",
  "rights-customs": "Direitos e costumes",
  "politics-elections": "Política e eleições",
  "public-administration": "Administração pública",
  "agriculture-land": "Agro e terra",
  "infrastructure-energy": "Infraestrutura e energia",
  international: "Internacional",
  other: "Outros",
};

/**
 * Explicação de cada tema para o balão que aparece ao passar o mouse. `objeto` é um sintagma nominal com artigo
 * ("a mudança tributária em votação") que completa "…a favor, ou seja, apoiou ___" / "…contra, ou seja, rejeitou ___".
 */
export type TopicInfo = { descricao: string; objeto: string };

export const TOPIC_INFO: Record<string, TopicInfo> = {
  economy: {
    descricao: "Política econômica e regulação de mercados: arcabouço fiscal, crédito, concorrência, indústria e comércio exterior.",
    objeto: "a medida econômica em votação (por exemplo, uma regra fiscal, um incentivo ou uma regulação de mercado)",
  },
  taxes: {
    descricao: "Impostos e contribuições: reforma tributária, isenções, alíquotas e benefícios fiscais.",
    objeto: "a mudança tributária em votação (criar, reduzir ou isentar um tributo, conforme o texto)",
  },
  labor: {
    descricao: "Trabalho e emprego: jornada, salário mínimo, tipos de contrato e direitos trabalhistas.",
    objeto: "a mudança trabalhista em votação (ampliar um direito ou flexibilizar uma regra, conforme o texto)",
  },
  "social-security": {
    descricao: "Previdência, assistência social e benefícios: aposentadorias, BPC, Bolsa Família e auxílios.",
    objeto: "a regra ou o benefício em votação (criar, ampliar ou restringir, conforme o texto)",
  },
  health: {
    descricao: "Saúde: SUS, medicamentos, profissionais de saúde e financiamento do setor.",
    objeto: "a medida de saúde em votação",
  },
  education: {
    descricao: "Educação: ensino básico e superior, currículo, financiamento e programas para estudantes.",
    objeto: "a medida de educação em votação",
  },
  security: {
    descricao: "Segurança pública e justiça: leis penais, polícia, execução penal, Judiciário e Ministério Público.",
    objeto: "a medida de segurança ou de justiça em votação (por exemplo, aumentar uma pena ou mudar um procedimento)",
  },
  environment: {
    descricao: "Meio ambiente e clima: licenciamento, florestas, emissões de carbono, fauna e áreas protegidas.",
    objeto: "a medida ambiental em votação (proteger ou flexibilizar uma regra, conforme o texto)",
  },
  "rights-customs": {
    descricao: "Direitos e costumes: direitos individuais e sociais, igualdade, datas comemorativas e temas de comportamento.",
    objeto: "a medida sobre direitos ou costumes em votação",
  },
  "politics-elections": {
    descricao: "Política e eleições: regras eleitorais e de partidos, prerrogativas e imunidade de parlamentares, emendas parlamentares.",
    objeto: "a medida sobre o sistema político em votação (por exemplo, mudar regra eleitoral ou ampliar uma prerrogativa)",
  },
  "public-administration": {
    descricao: "Administração pública: servidores, cargos e carreiras, órgãos, compras públicas e contas do governo.",
    objeto: "a medida de administração pública em votação (por exemplo, criar cargos ou mudar uma carreira)",
  },
  "agriculture-land": {
    descricao: "Agro e terra: crédito rural, reforma agrária, propriedade da terra e demarcação.",
    objeto: "a medida sobre agro ou terra em votação",
  },
  "infrastructure-energy": {
    descricao: "Infraestrutura e energia: transportes, energia, saneamento, telecomunicações e concessões.",
    objeto: "a medida de infraestrutura ou energia em votação",
  },
  international: {
    descricao: "Relações internacionais: tratados, acordos e convenções com outros países.",
    objeto: "o acordo ou tratado internacional em votação",
  },
  other: {
    descricao: "Projetos que não se encaixam nos outros temas.",
    objeto: "a medida em votação",
  },
};
