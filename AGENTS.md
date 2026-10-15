<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## UI architecture
- Keep visual tokens in src/styles.css and structural music-service styles in src/music-interface.css; do not load the retired polish override stylesheets because their positional selectors conflict with the redesigned layout.
- Use MusicSidebar for shared navigation across the home, player, account and administration screens, keeping playback and queue state in their existing hooks.
