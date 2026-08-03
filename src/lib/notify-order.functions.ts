import { createServerFn } from "@tanstack/react-start";
import { getOrdersApiBaseUrl, ORDERS_ENDPOINT } from "@/lib/api-config";

export type NotifyOrderInput = {
  nome: string;
  telefone: string;
  endereco: string;
  /** Valor total formatado sem o prefixo R$ (ex.: "150,00") */
  valor: string;
  tempo: string;
  itens: Array<{ nome: string; quantidade: number }>;
};

export const notifyOrder = createServerFn({ method: "POST" })
  .inputValidator((input: NotifyOrderInput) => {
    if (!input || typeof input !== "object") throw new Error("Payload inválido");
    if (!input.nome?.trim()) throw new Error("Nome obrigatório");
    if (!input.telefone?.trim()) throw new Error("Telefone obrigatório");
    if (!input.endereco?.trim()) throw new Error("Endereço obrigatório");
    if (!Array.isArray(input.itens) || input.itens.length === 0)
      throw new Error("Carrinho vazio");
    return input;
  })
  .handler(async ({ data }) => {
    const url = `${getOrdersApiBaseUrl()}${ORDERS_ENDPOINT}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          nome: data.nome,
          telefone: data.telefone,
          endereco: data.endereco,
          valor: data.valor,
          tempo: data.tempo,
          itens: data.itens.map((i) => ({
            nome: i.nome,
            quantidade: i.quantidade,
          })),
        }),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {}
      if (!res.ok) {
        return { ok: false as const, error: `HTTP ${res.status}` };
      }
      if (!json || json.sucesso !== true) {
        return {
          ok: false as const,
          error: json?.mensagem || "A API não confirmou o pedido",
        };
      }
      return { ok: true as const, response: text.slice(0, 500) };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Falha de rede",
      };
    }
  });
