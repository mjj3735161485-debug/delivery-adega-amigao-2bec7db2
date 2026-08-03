/**
 * URL base da API de pedidos (WhatsApp).
 * Troque aqui (ou defina o secret API_URL no backend) para apontar para outro servidor.
 */
export const DEFAULT_ORDERS_API_BASE_URL =
  "https://outsider-turbine-lure.ngrok-free.dev";

export function getOrdersApiBaseUrl() {
  const fromEnv =
    typeof process !== "undefined" ? process.env?.API_URL : undefined;
  return (fromEnv || DEFAULT_ORDERS_API_BASE_URL).replace(/\/+$/, "");
}

export const ORDERS_ENDPOINT = "/pedido";
