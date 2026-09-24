# Produto e domínio

## Objetivo

Gamer Profile centraliza a identidade gamer de uma pessoa entre PC/Steam,
PlayStation, Xbox, Nintendo Switch e futuras plataformas.

O produto deverá reunir biblioteca, plataforma de posse, tempo jogado,
conquistas ou troféus quando disponíveis, conclusão, status, avaliação pessoal,
wishlist, favoritos, estatísticas e perfil público. Recursos sociais ficam fora
do MVP inicial.

## Regra central

`Game` representa uma obra. `LibraryEntry` representa a posse ou experiência de
um usuário com essa obra em uma plataforma.

Consequentemente, um usuário pode ter várias entradas para o mesmo jogo, como
Elden Ring no Steam e no PlayStation 5, cada uma com tempo e progresso próprios.

## Biblioteca manual

O produto não pode depender de sincronizações. Mesmo sem integrações, o usuário
deve conseguir registrar manualmente jogo, plataforma, horas, status, avaliação
e porcentagem de conclusão.

## Fonte do catálogo

IGDB será a fonte inicial de metadata, mas não faz parte da identidade interna
do domínio. Jogos usam UUID interno e mantêm `igdb_id` apenas como referência ao
provedor.

## Status iniciais

- `backlog`
- `playing`
- `paused`
- `completed`
- `abandoned`
- `perfected`

Wishlist é uma entidade separada da biblioteca.
