import axios from "axios";

function resolvePasarelaBaseUrl(): string {
  const configured = process.env.API_URL_PAGOS?.trim().replace(/\/$/, "");
  if (configured) return configured;

  if (
    process.env.NODE_ENV === "local" ||
    !process.env.NODE_ENV ||
    process.env.NODE_ENV === "development"
  ) {
    return "http://localhost:8009/api/v1";
  }

  return "";
}

export async function cancelOrderWithGatewayRefund(
  idOrder: number,
  userId: number,
  authorization?: string,
) {
  const baseURL = resolvePasarelaBaseUrl();
  if (!baseURL) {
    throw new Error("API_URL_PAGOS no está configurada en el servidor");
  }

  const response = await axios.post(
    `${baseURL}/openpay/cancelledPaymantOpenPay`,
    { idOrder, userId },
    {
      ...(authorization
        ? { headers: { Authorization: authorization } }
        : {}),
      timeout: 30000,
    },
  );

  return response.data;
}
