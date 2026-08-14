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

/**
 * Cancelación + reembolso del cliente vía política unificada de la pasarela.
 * Usa /orders/cancelOrder (evaluateOrderCancellation + shipments bloqueados).
 */
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
    `${baseURL}/orders/cancelOrder`,
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

/** Sincroniza status de envío en la pasarela (misma u otra BD). Best-effort. */
export async function syncShipmentStatusOnPasarela(params: {
  idShipment: number;
  status: string;
  idUser?: number;
  authorization?: string;
}) {
  const baseURL = resolvePasarelaBaseUrl();
  if (!baseURL) return { ok: false as const, skipped: true };

  try {
    const response = await axios.post(
      `${baseURL}/openpay/updateStatusShipByOrden`,
      {
        idShipment: params.idShipment,
        status: params.status,
        idUser: params.idUser,
      },
      {
        ...(params.authorization
          ? { headers: { Authorization: params.authorization } }
          : {}),
        timeout: 15000,
      },
    );
    return { ok: true as const, data: response.data };
  } catch (error) {
    console.error(
      "[syncShipmentStatusOnPasarela] No se pudo sincronizar status de envío",
      error,
    );
    return { ok: false as const, skipped: false };
  }
}
