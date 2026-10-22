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
2. Consumir no frontend os códigos distintos do BFF para apresentar ausência de
   sessão, sessão expirada, rate limit, indisponibilidade e falha de logout.
3. Task 005 — integração IGDB.
4. Task 006 — busca de jogos.
5. Task 007 — contrato e backend para adicionar à biblioteca a partir da busca,
   com BFF autenticado e persistência por UUID interno (backend implementado;
   interface real pendente no PR empilhado sobre o #12).
6. Evoluir a biblioteca manual com consulta, edição, busca, filtros por status e
   plataforma, ordenação e estados vazio/carregando/erro.
7. Task 008 — wishlist.
8. Task 009 — perfil e estatísticas próprias do PlayVault.
9. Task 010 — Steam, incluindo onboarding, estado da conexão e sincronização
   manual.

Xbox, PlayStation e Nintendo permanecem condicionados a provas de conceito.
Recursos sociais e Gamer DNA serão planejados depois do MVP.

Os fluxos investigados no YGP servem como referência de experiência, com
limites e adaptações descritos em [YGP_REFERENCE.md](YGP_REFERENCE.md). Listas e
coleções ficam depois do MVP; reviews, galeria, guias e feed permanecem em fases
posteriores.
