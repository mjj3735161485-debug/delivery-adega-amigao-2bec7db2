import { createServerFn } from "@tanstack/react-start";
import { getOrdersApiBaseUrl } from "@/lib/api-config";

export type NotifyStatusInput = {
  telefone: string;
  statusPedido: "Recebido" | "Preparando" | "Saiu para entrega" | "Entregue";
};

export const notifyStatus = createServerFn({ method: "POST" })
  .inputValidator((input: NotifyStatusInput) => {
    if (!input?.telefone || !input?.statusPedido) throw new Error("Dados inválidos");
    return input;
  })
  .handler(async ({ data }) => {
    const url = `${getOrdersApiBaseUrl()}/status-pedido`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          telefone: data.telefone,
          statusPedido: data.statusPedido,
        }),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      return { ok: true, response: text.slice(0, 500) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Falha de rede" };
    }
  });