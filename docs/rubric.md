# Roteiro de marcação (versão `r1`)

Toda votação nominal é marcada pelo **efeito de votar Sim**. Isso importa porque um Sim nem sempre significa "a favor do
projeto": num destaque para suprimir um artigo, Sim significa "suprimir". O cálculo inverte o sinal para um Não.
Os textos de resumo e de justificativa são escritos **em português**.

Cada votação recebe:

| campo | faixa | significado |
|---|---|---|
| `economic` | −1 … +1 | Efeito de um **Sim** no eixo Estado ↔ Mercado. **−1** = amplia o papel do Estado: gasto público, empresas estatais, redistribuição, regulação, proteção ao trabalho, mais impostos sobre riqueza/capital. **+1** = reduz: privatização, desregulamentação, corte de impostos para empresas/capital, flexibilização trabalhista, corte de gastos, provisão por mercado. **0** = não é uma questão de modelo econômico (inclui temas sociais e de costumes). |
| `privilege` | −1 … +1 | Efeito de um **Sim** nos privilégios de políticos e ocupantes de cargos como classe. **+1** = amplia/protege: aumentos de salário e benefícios de parlamentares ou altas autoridades, emendas parlamentares maiores, fundos partidário/eleitoral maiores, foro privilegiado ou imunidade ampliados, anistias a políticos, enfraquecimento das regras de improbidade e inelegibilidade. **−1** = reduz. **0** = não se relaciona. |
| `procedural` | verdadeiro/falso | Moções sobre o próprio processo (urgência, adiamento, retirada de pauta, ordem de votação, quórum, recursos de tramitação). Ficam fora do perfil de votação. |
| `confidence` | 0 … 1 | Quanta certeza há sobre a **direção** de um Sim. Use ≤ 0,4 quando o sentido de um destaque não for claro pela descrição. |
| `rationale` | texto | Uma frase curta justificando os números. |

Guia de magnitude para `economic` e `privilege`: ±0,2–0,3 marginal ou técnico, ±0,5–0,6 uma medida clara, ±0,8–1,0 uma medida
central e de destaque naquela direção.

Regras práticas

- Marque o **conteúdo**, não quem propôs. Não use o nome do partido para decidir a direção.
- Tema puramente social, cultural, de segurança ou de direitos tem `economic = 0`. O perfil mede apenas direção econômica e privilégios.
- Quando a votação é sobre o projeto inteiro (substitutivo, "nos termos do parecer", PEC em um turno), um Sim = aprovar o texto; avalie o efeito líquido do texto.
- Em dúvida se a votação é econômica, use magnitude pequena e confiança menor em vez de chutar um valor grande.
- Informações por projeto (uma vez por projeto): `topic` (um de: economy, taxes, labor, social-security, health, education, security, environment, rights-customs, politics-elections, public-administration, agriculture-land, infrastructure-energy, international, other) e um `summary` de uma frase simples sobre o que o projeto faz.

Como as notas são usadas (veja `src/lib/derive.ts`)

- O Sim de um parlamentar conta `+valor`, o Não conta `−valor`; abstenções, obstrução e ausências são ignoradas.
- Peso de um voto = `|valor| × confiança`. Votos com `|economic| < 0,2` não contam para as barras Estado/Mercado, e com `|privilege| < 0,3` não contam para a barra Privilégios.
- **Estado / Esquerda** = parcela dos votos econômicos ponderados em que o parlamentar empurrou para o Estado; **Mercado / Direita** = para o mercado; somam 100.
- **Privilégios** = parcela dos votos ponderados sobre privilégios em que o parlamentar empurrou para mais privilégios.
- As barras aparecem como "sem nota" com menos de 10 votos econômicos contados (5 na barra de Privilégios).
- Cada eixo tem um ranking de parlamentares e de partidos (`/rankings`).
