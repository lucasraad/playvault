# Roadmap técnico

## Fundação concluída

- estrutura inicial do monorepo;
- frontend Next.js;
- backend FastAPI e health check;
- infraestrutura inicial SQLAlchemy/PostgreSQL;
- sessão de banco e Alembic;
- endpoint de conectividade do banco.
- Task 003 — modelos de domínio e migration inicial das seis tabelas (pendente aplicação no banco configurado).
- Task 004 — Supabase Auth no FastAPI, BFF com cookies `HttpOnly`, telas de
  cadastro/login/dashboard e testes automatizados das rotas de sessão.

## Próximas tarefas

1. Aplicar e validar a migration `003_initial_domain` no banco configurado.
2. Antigravity: consumir os códigos distintos do BFF para apresentar ausência de
   sessão, sessão expirada, rate limit, indisponibilidade e falha de logout.
3. Task 005 — integração IGDB.
4. Task 006 — busca de jogos.
5. Task 007 — biblioteca.
6. Task 008 — wishlist.
7. Task 009 — perfil.
8. Task 010 — Steam.

Xbox, PlayStation e Nintendo permanecem condicionados a provas de conceito.
Recursos sociais e Gamer DNA serão planejados depois do MVP.
