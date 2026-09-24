# Gamer DNA

Gamer DNA interpretará hábitos de jogo e produzirá afinidades e medidas de
domínio, como Soulslike, RPG, Horror, Exploration e Completionist.

## Princípio de cálculo

Os scores devem ser calculados deterministicamente a partir de dados como:

- gêneros, temas e keywords;
- tempo jogado e atividade recente;
- jogos concluídos e porcentagem de conclusão;
- achievements;
- avaliações e recorrência.

Fluxo obrigatório:

```text
biblioteca → processamento estatístico → scores → interpretação opcional por LLM
```

Nunca envie a biblioteca a um LLM para que ele invente os scores. Um LLM poderá
apenas explicar, resumir ou contextualizar resultados previamente calculados.

O Gamer DNA não faz parte do MVP atual, mas modelos e integrações futuras não
devem bloquear sua implementação determinística.
