# Marcação às cegas

Você vai marcar votações nominais da Câmara e do Senado do Brasil seguindo o roteiro em `roteiro.md` (leia inteiro antes).
Marque pelo **efeito de um voto Sim**. Use só as informações dos lotes (`batch-NN.txt`): identificação do projeto, ementa,
palavras-chave, descrição completa da votação, placar, resultado e o voto principal do projeto. Não decida pelo nome do
partido que pediu o destaque.

## Formato de cada lote
`## <id do projeto> | <rótulo> | ementa: …`, uma linha de palavras-chave e do voto principal, e depois uma linha por votação:
`<id da votação> | <data> | <descrição> | Sim N Não N | resultado: … `.

## O que entregar (um arquivo por lote)
Grave `out-NN.json` (mesmo NN do lote) com **uma entrada para CADA votação do lote**, sem pular nenhuma:

```json
{ "votes": [
  { "sv": "C:2196833-326", "e": 0.2, "p": 0, "proc": false, "c": 0.4, "why": "frase curta em português" }
] }
```

- `e`: −1…1 (efeito de um Sim no eixo Estado ↔ Mercado); `p`: −1…1 (efeito de um Sim nos privilégios de políticos);
  `c`: 0…1 (confiança na DIREÇÃO); `proc`: true só para moções do próprio processo; `why`: uma frase curta em português.
- Quando não der para saber a direção (por exemplo, um destaque de dispositivo cujo conteúdo você não vê), use `e: 0, p: 0`
  e confiança baixa (≤ 0,3) em vez de adivinhar. Temas penais, de costumes ou internacionais costumam ter `e: 0`.
- Valores entre −1 e 1 com uma casa decimal.
