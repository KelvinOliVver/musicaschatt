# Ativação segura — permissões do Music Chat

> **NÃO faça merge/publicação desta mudança sem executar o procedimento abaixo.**
> Este repositório usa **Lovable Cloud** (Supabase project `ejmimuvwcsjntzddxkwj`).
> O conector Supabase disponível durante a auditoria apontou para um projeto
> **diferente e inativo**, portanto nenhuma alteração foi aplicada ao banco da live.

## Objetivo

- Só a conta autenticada do streamer pode controlar a fila, alterar configurações
  e gravar o histórico do chat da Kick.
- Apenas uma sessão desse streamer por vez mantém o **host lease** de 25 segundos
  (renovação a cada 8 s). Outros espectadores somente visualizam.
- A fila muda através de funções atômicas que verificam o papel administrativo.
- A sincronização de play/seek vem da tabela protegida por RLS, nunca de
  broadcasts públicos de navegadores desconhecidos.

## Antes de ativar (sem espectadores / sem live)

1. Faça backup da estrutura e dos dados no Lovable Cloud. Confira que está no
   **projeto correto** e tem acesso ao SQL Editor de confiança.
2. Execute `01_prepare_music_room_admin.sql` no SQL Editor do **Lovable Cloud**.
   Esse script só cria a tabela de autorizações; **não bloqueia a live atual**.
3. Confirme a conta do streamer por uma sessão legítima do Music Chat e consulte:
   `SELECT id, email FROM auth.users ORDER BY created_at;`
   **Não use uma conta aleatória nem assuma que o primeiro usuário é o dono.**
4. Autorize **somente** o usuário confirmado, no SQL Editor:
   `INSERT INTO public.music_room_admins(user_id) VALUES ('UUID_CONFIRMADO') ON CONFLICT DO NOTHING;`
   Confirme com `SELECT * FROM public.music_room_admins;`.
5. Abra uma janela de manutenção sem live. Execute
   `02_activate_music_room_permissions.sql` **uma única vez** no mesmo projeto.
   Ele aborta sem alterar permissões se não houver administrador registrado.
6. Valide políticas e permissões de acordo com o arquivo SQL. Com contas de
   **teste separadas**: um espectador não deve conseguir UPDATE/DELETE,
   executar RPCs administrativas, nem salvar configurações; o streamer deve
   conseguir usar todas essas ações.
7. **Só depois publique a branch/PR no Lovable.** Abra a sala com a conta do
   streamer e outra de espectador; teste `!skip`, `!pausar`, pedido normal,
   próximo automático, chat, duas abas e player em background.
8. Confira as mensagens de erros, reconexão e logs. Não force push ou squash;
   sempre use merge commit para preservar o histórico do Lovable.

## Separação entre código e banco

- Os scripts estão em `supabase/security/`, **não** em `supabase/migrations/`,
  para não executar travamento de permissões automaticamente durante deploy.
- O código da branch **depende da tabela e das funções** desses scripts.
  Publicá-lo sem ativar o banco bloqueia a ingestão de pedidos por segurança.
- Se o banco não estiver disponível / não houver identidade confirmada,
  **mantenha este PR em draft**, sem publicá-lo.
- Em caso de erro, não "resolva" atribuindo acesso a todos: interrompa a
  publicação e restaure do backup de esquema, priorizando impedir mudanças
  por usuários desconhecidos.

## Segurança e limites

- A API do Instagram não expõe dimensões confiáveis de todo Reel; o player
  usa prévia pública quando disponível e recorre ao embed nativo caso contrário.
- Mensagens de chat recebidas de Kick ainda dependem da confiabilidade da
  conexão ao serviço. O comando de chat `pitee4` continua sendo reconhecido
  por username no transporte Kick; verificar IDs de emissor pode ser feito
  quando um token/identidade estável da conta Kick for disponibilizado.
- Nenhum token secreto, senha ou credencial deve ser registrado no repositório.
