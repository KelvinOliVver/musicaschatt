# Volume reseta ao trocar de música

## Problema

Quando a música avança, o componente `YouTubeStage` é remontado (a `key={current.id}` muda), criando um player do YouTube novo. Esse player começa com o volume padrão (100). O `useEffect` que aplica o volume só dispara quando o valor do slider muda — como o usuário não mexeu, o volume escolhido nunca é reaplicado ao player novo.

## Correção

**`src/components/YouTubeStage.tsx`** — aplicar o volume assim que o player fica pronto:

1. Guardar o volume atual em um `ref` (`volumeRef`), atualizado sempre que a prop `volume` mudar.
2. No `onReady` do player, chamar `playerRef.current.setVolume(volumeRef.current)` antes de carregar o vídeo.
3. Manter o efeito existente que atualiza o volume ao mexer no slider.

Com isso, toda música nova começa no volume que você escolheu, sem precisar mexer no slider de novo.

## Arquivos

- `src/components/YouTubeStage.tsx` (único arquivo alterado)

## Verificação

- Recarregar, tocar uma música, baixar o volume, avançar para a próxima e conferir que o volume se mantém.
