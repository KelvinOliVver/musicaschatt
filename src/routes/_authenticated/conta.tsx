import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialsOf, useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta · Kick Music Player" },
      { name: "description", content: "Edite seu nome de exibição e avatar do player." },
      { property: "og:title", content: "Minha conta · Kick Music Player" },
      {
        property: "og:description",
        content: "Edite seu nome de exibição e avatar do player.",
      },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
  }, [profile]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: profile.id,
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      toast.error("Não deu para salvar", { description: error.message });
      return;
    }
    toast.success("Perfil atualizado");
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <Link
        to="/player"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar ao player
      </Link>

      <div>
        <h1 className="text-3xl font-bold">Minha conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajuste como seu nome e avatar aparecem no player.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="panel flex flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback>{initialsOf(displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{displayName || "Sem nome"}</p>
            <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="display-name">Nome de exibição</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Seu nome"
            disabled={isLoading}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="avatar-url">URL do avatar</Label>
          <Input
            id="avatar-url"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://..."
            disabled={isLoading}
          />
        </div>

        <Button type="submit" disabled={saving || isLoading} className="w-fit">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Salvar alterações
        </Button>
      </form>
    </main>
  );
}
