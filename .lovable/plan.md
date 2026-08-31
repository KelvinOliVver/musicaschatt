# Kick Music Player — Site de músicas a partir do chat da Kick

## Visão geral

Um site que conecta em tempo real ao chat da Kick (canal `roceiraplay`), detecta links de YouTube e Spotify nas mensagens, e toca as músicas em uma fila de reprodução automática.

## Como funciona

```
Chat da Kick (Pusher WebSocket)
        │
        ▼
  Detecta links YouTube/Spotify nas mensagens
        │
        ▼
  Adiciona à fila de reprodução
        │
        ▼
  Player toca: YouTube (IFrame API) ou Spotify (embed)
        │
        ▼
  Quando termina → próxima da fila
```

## Detalhes técnicos

### 1. Conexão com o chat da Kick (client-side, browser)

Kick usa o protocolo Pusher via WebSocket. Não precisa de autenticação para chat público.

- **Resolver chatroom ID**: Server function `getKickChannelInfo(slug)` faz `GET https://kick.com/api/v2/channels/{slug}` → retorna `chatroom.id`, nome do canal, etc. (via server function para evitar CORS / Cloudflare)
- **WebSocket**: Browser conecta a `wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false`
- **Subscribe**: Envia `{"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.{chatroom_id}.v2"}}`
- **Mensagens**: Escuta evento `App\Events\ChatMessageEvent` → payload tem `content`, `sender.username`, `created_at`

Hook React `useKickChat(channelSlug)` gerencia: conexão, reconexão automática, e emissão de mensagens.

### 2. Detecção de links

Parser de mensagens que extrai:
- **YouTube**: URLs `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/` → extrai video ID
- **Spotify**: URLs `open.spotify.com/track/` → extrai track ID

Cada link detectado vira um item na fila com: tipo (youtube/spotify), id, título (buscado via oEmbed), remetente (username do chat), e timestamp.

### 3. Player

- **YouTube**: YouTube IFrame Player API — player invisível ou miniatura, auto-avança quando o vídeo termina (`onStateChange` → `ENDED`)
- **Spotify**: iframe embed `https://open.spotify.com/embed/track/{id}` — botão "próxima" manual (Spotify embed não expõe evento de fim de faça)

### 4. Fila de reprodução

- Estado em memória (React state) — sem banco de dados
- Itens pendentes + item atual + histórico recente
- Controles: próxima, anterior, remover da fila
- Quando a fila acaba, mostra "aguardando próximas músicas do chat..."

**Usuário VIP com prioridade:** músicas enviadas pelo usuário `Pitee4` entram sempre no topo da fila, na frente de todas as músicas normais. Se ele mandar várias, elas ficam em ordem de chegada entre si, mas todas acima das demais. A música que já está tocando não é interrompida — a prioridade vale para a próxima a tocar. Na interface, esses itens aparecem com destaque visual (badge "VIP") para deixar claro por que estão na frente.

A lista de usuários prioritários fica em uma constante única no código (`PRIORITY_USERS = ["pitee4"]`, comparação sem diferenciar maiúsculas/minúsculas), fácil de expandir depois.

### 5. Interface

Design dark moderno (estilo player de música), com:
- **Painel do player** (esquerda): arte/capa da música atual, controles, info de quem pediu
- **Fila** (centro/direita): lista de próximas músicas, com origem (YouTube/Spotify), quem mandou no chat
- **Feed do chat** (lateral ou rodapé): últimas mensagens do chat com destaque para as que contêm links
- **Barra superior**: nome do canal da Kick conectado, status da conexão (conectado/reconectando)
- Campo para trocar o canal da Kick (default: `roceiraplay`)

### Estrutura de arquivos

```
src/
├── routes/
│   ├── __root.tsx          (layout + head metadata)
│   └── index.tsx           (página principal do player)
├── lib/
│   ├── kick.functions.ts   (getKickChannelInfo — server function)
│   ├── kick-chat.ts        (hook useKickChat — WebSocket Pusher)
│   ├── link-parser.ts      (extração de YouTube/Spotify IDs)
│   ├── use-player-queue.ts (gerenciamento da fila)
│   └── types.ts            (tipos compartilhados)
├── components/
│   ├── PlayerPanel.tsx     (player atual + controles)
│   ├── QueueList.tsx       (fila de reprodução)
│   ├── ChatFeed.tsx        (feed de mensagens do chat)
│   └── ChannelBar.tsx      (barra de canal + status)
└── styles.css             (design system dark theme)
```

## Notas e riscos

- **API não-oficial**: A conexão Pusher do Kick é uma API interna não-documentada. Se Kick mudar a app key ou formato, a conexão quebra. Mitigação: reconexão automática + mensagem de erro clara.
- **Sem banco de dados**: A fila é efêmera (some ao recarregar a página). Adequado para um "listening party" ao vivo.
- **CORS/Cloudflare**: A resolução do chatroom ID passa por server function para evitar bloqueio do browser. O WebSocket Pusher funciona direto do browser sem restrição.

## O que NÃO está incluído (fora do escopo atual)

- Login de usuários / autenticação
- Persistência da fila em banco de dados
- Votos/likes nas músicas
- Histórico persistente
- Spotify Web Playback SDK (requer Premium + OAuth — usando embed simples)
