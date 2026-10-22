# Referência funcional: Your Gamer Profile

Este documento registra aprendizados obtidos na investigação do site Your Gamer
Profile (YGP) e na reconstrução experimental relatada na conversa compartilhada
em 22 de outubro de 2026. O YGP é uma referência de produto e interação, não uma
fonte de verdade para arquitetura, regras internas ou implementação.

## Evidências disponíveis

### Observado ou exercitado na reconstrução

- navegação entre perfil, biblioteca, busca, listas, reviews, galeria e conexões;
- biblioteca manual e fluxo de busca seguido de ação sobre um jogo;
- perfil com avatar, nome, bio, favoritos e métricas;
- onboarding de conexões com plataformas;
- estados desktop e mobile;
- persistência local demonstrada pela reconstrução em SQLite;
- 87 verificações HTTP e dois cenários de navegação foram relatados para o
  experimento.

O experimento era uma reconstrução parcial em HTML, CSS, JavaScript, Node.js e
SQLite. Suas contas, sessões e conexões eram locais ou demonstrativas. Ele não
deve ser incorporado diretamente ao monorepo nem usado como prova do backend do
YGP.

### Inferido, mas não comprovado

- a organização das telas pode orientar a hierarquia visual do PlayVault;
- estatísticas como horas, jogos finalizados e distribuição da biblioteca podem
  ser derivadas dos dados próprios do PlayVault;
- listas, reviews, galeria, guias e feed podem ser evoluções úteis após o MVP.

### Não verificado

- backend, schema e regras internas do YGP;
- algoritmos de sincronização e autenticação das plataformas;
- regras completas de conquistas;
- garantias de persistência e consistência do serviço original;
- fórmulas de estatísticas, privacidade e limites de alteração.

## Adaptação ao domínio do PlayVault

Ao aproveitar uma referência do YGP, o PlayVault deve manter suas decisões
próprias:

- `Game` continua sendo a obra canônica e `LibraryEntry`, a experiência do
  usuário em uma plataforma;
- o mesmo jogo pode ter entradas independentes em plataformas diferentes;
- cadastro manual continua disponível sem IGDB ou sincronizações;
- `completed` significa finalizado e `perfected`, completado integralmente;
- wishlist permanece separada da biblioteca;
- persistência e integrações passam pela API FastAPI; o frontend não acessa o
  banco ou provedores diretamente;
- estatísticas e Gamer DNA usam fórmulas próprias, determinísticas e testadas;
- uma interface observada não autoriza presumir regras de negócio do YGP.

## Fluxos aproveitáveis

### Busca e adição à biblioteca

Fluxo desejado: busca → seleção do jogo → seleção da plataforma → confirmação →
entrada criada → acesso à biblioteca ou continuidade da busca.

A Task 007 já fornece o contrato de busca para adição e valida a combinação de
jogo e plataforma no backend. A interface deve incluir loading, sucesso, erro,
plataforma obrigatória e o caso em que a entrada já existe.

### Biblioteca manual e editável

Fluxo desejado: adicionar ou abrir entrada → informar plataforma, status,
avaliação, período, tempo jogado e conclusão → validar → salvar → refletir a
alteração nos filtros e métricas.

A biblioteca deve oferecer busca, filtros por status e plataforma, ordenação e
estados vazio, carregando e erro. Os controles exatos observados no YGP ainda
não foram documentados e não devem ser inventados como equivalência fiel.

### Perfil e estatísticas

O perfil pode reunir avatar, nome, bio, favoritos, horas jogadas, jogos
finalizados, jogos `perfected` e distribuição da biblioteca. As fórmulas,
visibilidade pública e permissões devem ser especificadas pelo PlayVault antes
da implementação; valores demonstrativos do experimento não são contratos.

### Conexões de plataforma

O onboarding deve explicar requisitos de perfil público, estado da conexão,
última sincronização, sincronização manual e falhas recuperáveis. Uma conexão
demonstrativa nunca deve ser apresentada como importação real.

## Priorização

1. concluir a experiência visual da busca e adição da Task 007;
2. tornar a biblioteca manual consultável e editável, com filtros e estados;
3. implementar wishlist separada;
4. implementar perfil e estatísticas com fórmulas documentadas;
5. integrar Steam com sincronização real;
6. avaliar listas e coleções após o MVP;
7. deixar reviews, galeria, guias e recursos sociais para fases posteriores.

Cada tarefa deve transformar apenas o fluxo relevante em contrato próprio na
documentação de arquitetura e persistência. Este documento continua sendo uma
referência de investigação, não um contrato de API.
