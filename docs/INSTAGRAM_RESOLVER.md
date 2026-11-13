# Reprodução de Reels no Music Chat — modo streamer

## Problema real

Os Reels do Instagram não oferecem uma API oficial para qualquer site dar play,
pausar, consultar a duração ou remover toda a interface do embed. O Instagram
pode mostrar `Watch on Instagram` e impedir a reprodução externa, especialmente
em publicações com áudio licenciado/restrito. O `oEmbed` da Meta retorna HTML de
**publicação**, não uma URL de vídeo universal.

O Music Chat usa três alternativas **automáticas**, sem botões de enquadramento:

1. **Vídeo público com URL direta:** metadados OpenGraph/VideoObject retornam
   vídeo acessível → usar `<video>` nativo, fullscreen/Modo Cinema, volume,
   play/pause, proporção nativa e próximo pedido ao terminar.
2. **Instância Cobalt autorizada (opcional):** se a etapa 1 não retornar vídeo,
   consultar o resolvedor privado configurado pelo responsável do site.
   Uma resposta `tunnel`/ `redirect` permite o player nativo. Se o serviço
   falhar, devolver erro ou bloquear aquele vídeo, continuar para etapa 3.
3. **Embed do Instagram:** mantém a experiência oficial como alternativa, sem
   forçar proporção 9:16 que corta vídeos deitados. Vídeos cujo embed foi
   bloqueado pelo Instagram continuarão exigindo abrir o original.

**Não prometa 100% de compatibilidade:** nem o Cobalt nem serviços de terceiros
conseguem recuperar todo vídeo privado, com restrição regional, direitos autorais
ou exigência de login. Respeite direitos dos criadores e termos de cada serviço.

## Ativar um resolvedor Cobalt

O aplicativo não usa APIs Cobalt públicas de terceiros: seus administradores
pedem que as integrações usem uma instância própria ou tenham autorização
explícita do operador da instância.

1. Hospede uma instância Cobalt sua, seguindo a documentação oficial:
   https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md
2. Exponha o serviço via **HTTPS público**, com domínio e certificado
   válidos. A API precisa atender a `POST /` e, em caso de sucesso, devolver
   `{ "status": "tunnel", "url": "https://seu-cobalt.example/tunnel?..." }`
   ou `redirect` com uma URL de mídia permitida. O player usa os links na
   hora; **não salva arquivos de vídeo no banco**.
3. Defina as variáveis **no ambiente do servidor TanStack Start**, nunca em
   `VITE_` nem dentro de componentes React:

   - `COBALT_API_URL=https://seu-cobalt.example`
   - `COBALT_API_KEY=...` — opcional, se a instância usar autenticação
     `Api-Key`. Nunca inclua a chave no repositório ou na interface web.

4. No Lovable Cloud, verifique se as **Secrets** são injetadas de fato no
   processo do servidor TanStack Start. Secrets usadas somente por Supabase
   Edge Functions podem **não** ficar disponíveis ao processo SSR. Se não
   estiverem, hospede o servidor TanStack num ambiente que as disponibilize,
   ou adapte o resolvedor para uma Edge Function segura antes de ativar.
5. Reinicie/publica o serviço e teste um Reel público acessível, um Reel
   horizontal e um com embed bloqueado. Confirme que o iframe é o fallback,
   que o áudio funciona e que o próximo pedido só avança **ao terminar o
   vídeo nativo**, não após temporizador arbitrário.

## Como o código usa a API

`src/lib/instagram-cobalt.ts` envia, **somente pelo servidor**, a URL
canônica `https://www.instagram.com/reel/<code>/` para `POST /`, com:

- `downloadMode: "auto"`
- `videoQuality: "720"`
- `alwaysProxy: true`
- `localProcessing: "disabled"`
- Autenticação `Authorization: Api-Key <chave>` quando configurada

Usa limite de duração da chamada, lista pequena de serviços confiáveis
(HTTPS do próprio Cobalt ou CDN Meta), cache de curta duração e fallback
automático em erro/timeout/rate limit.

Sem `COBALT_API_URL`, **nada muda em relação à etapa 2**: ela simplesmente
não roda, sem interromper outros pedidos e sem expor um campo de configuração
para o streamer.

## Teste local e CI

`bun test src/lib/instagram-cobalt.test.ts` valida segurança de URLs, formato
da requisição, chave e fallback. `bun run build` confirma compilação.

Esses testes são de código e simulações; não comprovam que uma instância
externa funciona com um Reel específico ou que a Meta permita sua reprodução.
