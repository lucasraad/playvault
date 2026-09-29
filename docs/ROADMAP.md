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
  cadastro/login/dashboard, tratamento visual distinto de ausência de sessão,
  sessão expirada, rate limit, indisponibilidade e falha de upstream, além de
  retry, logout local e testes automatizados das rotas de sessão e da interface.

## Próximas tarefas

1. Disponibilizar e confirmar um projeto Supabase de desenvolvimento/testes,
   aplicar nele `003_initial_domain` e validar o fluxo real de autenticação.
2. Task 005 — integração IGDB.
3. Task 006 — busca de jogos.
4. Task 007 — biblioteca.
5. Task 008 — wishlist.
6. Task 009 — perfil.
7. Task 010 — Steam.

Xbox, PlayStation e Nintendo permanecem condicionados a provas de conceito.
Recursos sociais e Gamer DNA serão planejados depois do MVP.
