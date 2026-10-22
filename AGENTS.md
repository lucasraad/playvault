# AGENTS.md

## Projeto

Gamer Profile é um monorepo com frontend Next.js e backend FastAPI. Antes de
alterações importantes, leia a documentação relevante em `docs/`.

## Estrutura

- `apps/web`: frontend Next.js, TypeScript, Tailwind CSS e shadcn/ui.
- `apps/api`: API FastAPI, Pydantic, SQLAlchemy, migrations e testes Python.
- `docs`: produto, arquitetura, banco, Gamer DNA, roadmap e colaboração.
- `experiments`: provas de conceito isoladas.

## Regras permanentes

- O frontend conversa com serviços externos e dados persistentes somente pela API.
- Preserve a distinção entre um jogo canônico e a entrada desse jogo na biblioteca
  de um usuário em uma plataforma.
- A biblioteca manual deve continuar funcionando sem integrações externas.
- Use UUIDs internos; IDs de provedores nunca são chaves primárias do domínio.
- Scores do Gamer DNA são determinísticos. LLMs podem apenas interpretar scores
  já calculados.
- Não implemente itens fora do escopo nem altere contratos silenciosamente.
- Use TypeScript estrito no frontend e type hints no backend.
- Inclua ou atualize testes quando alterar comportamento.

## Coordenação

- Work define o escopo, os critérios de aceite e a ordem das tarefas, além de
  revisar os pull requests antes de qualquer merge.
- Codex implementa e valida backend e frontend, incluindo contratos, interface,
  testes automatizados e validação visual quando aplicável.
- Não amplie silenciosamente o escopo definido pelo Work. Novas decisões e
  mudanças de contrato devem ser registradas no documento proprietário e no PR.
- Antes de mudanças grandes, execute `git status`, confira o branch e preserve
  alterações não commitadas. Não assuma exclusividade do branch atual.
- Prefira branches específicas por responsabilidade, com o prefixo exigido pelo
  ambiente ou pela equipe.

Detalhes: consulte `docs/COLLABORATION.md`.

## Documentação obrigatória

- Produto e domínio: `docs/PRODUCT.md`
- Arquitetura e contratos: `docs/ARCHITECTURE.md`
- Persistência: `docs/DATABASE.md`
- Gamer DNA: `docs/GAMER_DNA.md`
- Sequência de entrega: `docs/ROADMAP.md`
- Responsabilidades entre agentes: `docs/COLLABORATION.md`

Atualize o documento proprietário da decisão permanente, sem repetir a mesma
explicação em vários arquivos.

## Validação

- Frontend: `npm run lint` e `npm run build:web` na raiz.
- Backend: `python -m ruff check .` e `python -m pytest` em `apps/api`.
- Quando houver migrations, valide também a configuração e a aplicação do Alembic.

## Relatório final

Quando aplicável, informe: implementado, arquivos principais, banco, API, testes,
decisões técnicas, pendências e impacto nas próximas tarefas e contratos.
