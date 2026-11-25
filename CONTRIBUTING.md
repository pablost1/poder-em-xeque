# Como contribuir

Obrigado por ajudar. O tipo de contribuição mais valioso é **corrigir erros**: números que não batem com a fonte, textos
injustos ou imprecisos sobre uma pessoa, marcações de votação discutíveis.

## Reportar um erro

Abra uma *issue* com: o link da página, o que está errado e a **fonte oficial** (Câmara, Senado) que mostra o certo.
Para marcações de votação (perfil Estado/Mercado/Privilégios), cite a votação e explique o efeito de um "Sim" segundo o
roteiro em [`docs/rubric.md`](docs/rubric.md).

## Propor mudanças no código

1. Faça um *fork* e crie um ramo.
2. `npm install` e baixe o banco (veja `data/README.md`).
3. Antes de abrir o *pull request*, rode:

```bash
npx tsc --noEmit
npx eslint .
npx vitest run
npx tsx scripts/parity.ts     # só se mexeu em consultas ou derivações; deve manter 37 itens idênticos
npm run build
```

Regras do projeto:

- Interface e textos em **português do Brasil**.
- Lógica nova em funções puras, com testes de números calculados à mão (veja `tests/`).
- Rótulos sobre pessoas usam a redação oficial da fonte; nada de adjetivos nossos.
- Medidas como participação e taxa de projetos aprovados trazem sempre o aviso de que **não medem qualidade do trabalho**.
- Não inclua o banco, arquivos de `data/bulk/` nem segredos no *pull request* (o `.gitignore` já cobre isso).

## Licença

Ao contribuir você concorda que seu código é licenciado sob a [MIT](LICENSE).
