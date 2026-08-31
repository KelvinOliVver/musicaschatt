# Esconder o nome do perfil no player

## Contexto
O botão do menu de perfil (canto do player) mostra o texto `kelvinoliveira6002`, derivado do seu e-mail. Como você pode mostrar/streamar a tela do player para o público, esse nome não deve aparecer.

## Mudança
Arquivo: `src/components/ProfileMenu.tsx`

Remover o `<span>` que exibe `profile?.display_name` no botão de trigger do menu. O botão passa a mostrar **apenas o avatar** (com a inicial como fallback). O nome continua salvo no banco e editável em `/conta` — só some da interface do player.

Antes:
```tsx
<Button variant="ghost" className="h-10 gap-2 px-2">
  <Avatar ...>...</Avatar>
  <span className="hidden max-w-32 truncate text-sm sm:inline">
    {profile?.display_name ?? "Conta"}
  </span>
</Button>
```

Depois:
```tsx
<Button variant="ghost" className="h-10 gap-2 px-2" aria-label="Minha conta">
  <Avatar ...>...</Avatar>
</Button>
```

O conteúdo do menu (abrir ao clicar) continua igual: mostra o e-mail, "Minha conta" e "Sair".

## Não muda
- A página `/conta` continua permitindo editar nome/avatar.
- O nome continua sendo usado internamente onde preciso.
