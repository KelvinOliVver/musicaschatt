import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { exchangeCodeForTokens } from "@/lib/spotify-auth";

export const Route = createFileRoute("/_authenticated/spotify-callback")({
  component: SpotifyCallbackPage,
});

function SpotifyCallbackPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { code?: string; error?: string };
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("Conectando com a Spotify...");

  useEffect(() => {
    if (search.error) {
      setStatus("error");
      setMessage("Você cancelou o login com a Spotify ou algo deu errado na autorização.");
      return;
    }

    if (!search.code) {
      setStatus("error");
      setMessage("Não recebi o código de autorização da Spotify.");
      return;
    }

    exchangeCodeForTokens(search.code)
      .then(() => {
        navigate({ to: "/player" });
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Falha ao conectar com a Spotify.");
      });
  }, [search.code, search.error, navigate]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : (
        <>
          <p className="text-sm text-destructive">{message}</p>
          <button
            type="button"
            onClick={() => navigate({ to: "/player" })}
            className="text-sm text-primary underline"
          >
            Voltar para o player
          </button>
        </>
      )}
    </main>
  );
}
