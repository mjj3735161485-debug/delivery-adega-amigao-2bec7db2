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

const REQUEST_TIMEOUT_MS = 12_500;
const PHONE_PATTERN = /^\d{12,13}$/;
// Aceita tanto "150,00" quanto "1.234,50" (separador de milhar do pt-BR).
const MONEY_PATTERN = /^\d{1,3}(\.\d{3})*,\d{2}$|^\d{1,10},\d{2}$/;

function requiredText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} obrigatório`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${field} muito longo`);
  }
  return normalized;
}

function trimmedText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} obrigatório`);
  }
  return value.trim().slice(0, maxLength);
}

export const notifyOrder = createServerFn({ method: "POST" })
  .inputValidator((input: NotifyOrderInput) => {
    if (!input || typeof input !== "object") throw new Error("Payload inválido");
    const nome = requiredText(input.nome, "Nome", 80);
    const telefone = requiredText(input.telefone, "Telefone", 13).replace(/\D/g, "");
    const endereco = trimmedText(input.endereco, "Endereço", 350);
    const valor = requiredText(input.valor, "Valor", 16);
    const tempo = requiredText(input.tempo, "Tempo", 40);
    if (!PHONE_PATTERN.test(telefone)) throw new Error("Telefone inválido");
    if (!MONEY_PATTERN.test(valor)) throw new Error("Valor inválido");
    if (!Array.isArray(input.itens) || input.itens.length === 0) throw new Error("Carrinho vazio");
    if (input.itens.length > 100) throw new Error("Carrinho muito grande");
    const itens = input.itens.map((item) => ({
      nome: requiredText(item?.nome, "Nome do produto", 200),
      quantidade: item?.quantidade,
    }));
    if (itens.some((item) => !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 99)) {
      throw new Error("Quantidade de produto inválida");
    }
    return { nome, telefone, endereco, valor, tempo, itens };
  })
  .handler(async ({ data }) => {
    const url = `${getOrdersApiBaseUrl()}${ORDERS_ENDPOINT}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        signal: controller.signal,
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
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        // Uma resposta não JSON é tratada abaixo como falha de confirmação.
      }
      if (!res.ok) {
        return { ok: false as const, error: `HTTP ${res.status}` };
      }
      if (!json || typeof json !== "object" || !("sucesso" in json) || json.sucesso !== true) {
        return {
          ok: false as const,
          error:
            json && typeof json === "object" && "mensagem" in json && typeof json.mensagem === "string"
              ? json.mensagem.slice(0, 200)
              : "A API não confirmou o pedido",
        };
      }
      return { ok: true as const, response: text.slice(0, 500) };
    } catch (err) {
      return {
        ok: false as const,
        error:
          err instanceof Error && err.name === "AbortError"
            ? "A API demorou demais para responder"
            : err instanceof Error
              ? err.message
              : "Falha de rede",
      };
    } finally {
      clearTimeout(timeout);
    }
  });
