import { createServerFn } from "@tanstack/react-start";

export type NotifyOrderInput = {
  nome: string;
  itens: Array<{ nome: string; quantidade: number; preco: number }>;
  valor: number;
  endereco: string;
  telefone: string;
  tempo?: string;
};

export const notifyOrder = createServerFn({ method: "POST" })
  .inputValidator((input: NotifyOrderInput) => {
    if (!input || typeof input !== "object") throw new Error("Payload inválido");
    if (!input.nome || !input.telefone) throw new Error("Dados obrigatórios ausentes");
    if (!Array.isArray(input.itens)) throw new Error("Itens inválidos");
    return input;
  })
  .handler(async ({ data }) => {
    const base = process.env.API_URL;
    if (!base) {
      return { ok: false, error: "API_URL não configurada" as const };
    }
    const url = `${base.replace(/\/+$/, "")}/pedido`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: data.nome,
          telefone: data.telefone,
          endereco: data.endereco,
          valor: data.valor,
          itens: data.itens,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true, response: text.slice(0, 500) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Falha de rede" };
    }
  });