# Colaboração entre Work e Codex

Work e Codex trabalham no mesmo repositório, sem presumir exclusividade sobre o
branch atual. Work governa a fila e a revisão; Codex executa as tarefas aprovadas
de ponta a ponta.

## Work

Responsável por:

- definir tarefa, escopo, restrições e critérios de aceite;
- decidir prioridade e dependências entre entregas;
- revisar o PR, solicitar ajustes e aprovar o merge;
- resolver decisões de produto que não possam ser inferidas da documentação.

Work não substitui os contratos versionados no repositório. Quando uma decisão
nova precisar persistir, ela deve ser registrada no documento proprietário.

## Codex

Responsável por implementar e validar backend e frontend conforme a tarefa,
incluindo:

- arquitetura, FastAPI, Python, modelagem, SQLAlchemy e migrations;
- Supabase, autenticação, APIs, integrações, sincronização e jobs;
- Next.js, React, TypeScript, componentes, acessibilidade e responsividade;
- testes, segurança, performance, regras de negócio e validação visual;
- documentação de contratos, decisões e limitações encontradas.

Uma feature deve ser entregue verticalmente quando o escopo exigir backend e
frontend. O contrato da API continua sendo a fronteira explícita entre as
camadas, mesmo quando ambas são implementadas pelo Codex.

## Git e escopo

Antes de alterações grandes:

1. confira o branch atual;
2. execute `git status`;
3. identifique alterações não commitadas;
4. preserve o trabalho existente.

Use branches específicas por tarefa. Não faça refactors ou alterações visuais
não relacionadas. Problemas fora do escopo devem ser registrados como
pendência, não corrigidos automaticamente.

## Pull requests

Cada PR deve informar mudanças de contrato, endpoints, campos, migrations,
variáveis de ambiente, verificações executadas e limitações. Alterações
incompatíveis nunca devem ser silenciosas. Work revisa o PR antes do merge.

Branches empilhados devem declarar explicitamente o PR-base e não podem depender
de provas de conceito ou branches não relacionadas.

## Histórico

Entregas anteriores podem mencionar o Antigravity como autor de UI ou validação
visual. Essas referências são históricas; não definem responsabilidade para
tarefas futuras.
