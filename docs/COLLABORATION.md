# Colaboração entre agentes

Codex e Google Antigravity trabalham no mesmo repositório, com responsabilidades
complementares e sem presumir exclusividade sobre o branch atual.

## Codex

Prioriza arquitetura, FastAPI, Python, modelagem, SQLAlchemy, migrations,
Supabase, autenticação, APIs, integrações, sincronização, jobs, processamento,
Gamer DNA, testes, refactors, segurança, performance e regras de negócio.

## Antigravity

Prioriza UI, UX, Next.js, React, componentes, responsividade, dashboard,
biblioteca visual, páginas de jogo e perfil, estados da interface, navegação e
validação no navegador.

## Divisão de features

Sempre que possível, Codex implementa e documenta models, migrations, schemas,
services, endpoints e testes. Antigravity consome esse contrato e implementa a
experiência visual, incluindo loading, vazio, erro e responsividade.

Os agentes não devem implementar a mesma funcionalidade simultaneamente sem uma
necessidade explícita.

## Git e escopo

Antes de alterações grandes:

1. confira o branch atual;
2. execute `git status`;
3. identifique alterações não commitadas;
4. preserve o trabalho existente.

Use branches específicas por responsabilidade. Não faça refactors ou alterações
visuais não relacionadas durante tarefas de backend. Problemas fora do escopo
devem ser registrados como pendência, não corrigidos automaticamente.

## Handoff

Ao terminar, registre mudanças de contrato, endpoints, campos, migrations e
variáveis de ambiente que afetem o outro agente. Alterações incompatíveis nunca
devem ser silenciosas.
