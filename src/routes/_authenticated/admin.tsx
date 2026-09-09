import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSettings } from "@/hooks/use-app-settings";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração · Kick Music Player" },
      { name: "description", content: "Configurações do site." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { settings, loading, updateCooldown } = useAppSettings();
  const [cooldown, setCooldown] = useState(settings.chatCooldownSeconds);
  const [saving, setSaving] = useState(false);

  // Sincroniza o campo com o valor real assim que ele carrega (ou muda,
  // caso outra pessoa logada tenha alterado nesse meio tempo).
  useEffect(() => {
    setCooldown(settings.chatCooldownSeconds);
  }, [settings.chatCooldownSeconds]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ok = await updateCooldown(cooldown);
    setSaving(false);

    if (ok) {
      toast.success("Configurações salvas — já valem pra todo mundo");
    } else {
      toast.error("Não deu para salvar");
    }
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
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Settings className="size-6" aria-hidden />
          Administração
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Essas configurações valem pra todo mundo que usa o site — qualquer pessoa
          logada pode ajustar aqui.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="panel flex flex-col gap-6 p-6">
        <div className="grid gap-2">
          <Label htmlFor="cooldown">Cooldown de pedidos por pessoa (segundos)</Label>
          <Input
            id="cooldown"
            type="number"
            min={0}
            max={600}
            value={cooldown}
            onChange={(event) => setCooldown(Number(event.target.value))}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Cada pessoa no chat só consegue pedir uma música nova depois de esperar esse
            tempo desde o pedido anterior dela. Coloque 0 pra desativar o cooldown.
          </p>
        </div>

        <Button type="submit" disabled={saving || loading} className="w-fit">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Salvar alterações
        </Button>
      </form>
    </main>
  );
}
