import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, ListMusic, Radio, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kick Music Player · Músicas pedidas no chat" },
      {
        name: "description",
        content:
          "Conecte o chat da Kick, capture os links de YouTube e toque tudo em uma fila automática com prioridade VIP.",
      },
      { property: "og:title", content: "Kick Music Player · Músicas pedidas no chat" },
      {
        property: "og:description",
        content:
          "Conecte o chat da Kick, capture os links de YouTube e toque tudo em uma fila automática com prioridade VIP.",
      },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Radio,
    title: "Chat ao vivo",
    text: "Conecta direto no chat público da Kick e escuta cada mensagem em tempo real.",
  },
  {
    icon: Youtube,
    title: "Links do YouTube",
    text: "Todo link enviado vira uma faixa na fila, com capa e título automáticos.",
  },
  {
    icon: ListMusic,
    title: "Fila automática",
    text: "Terminou uma música, começa a próxima. Sem clique, sem pausa no meio da live.",
  },
  {
    icon: Crown,
    title: "Prioridade VIP",
    text: "Pedidos dos VIPs sobem direto para o topo da fila, na frente de todo mundo.",
  },
];

function LandingPage() {
  const [signedIn, setSignedIn] = useState(false
