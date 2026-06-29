import { prisma } from "../../db/prismaClient";

export const ESTAFETA_FIXED_COST = 178.0;

export const PAQUETE_EXPRESS_TARIFAS = [
  { max: 5, price: 303 },
  { max: 10, price: 329 },
  { max: 15, price: 396 },
] as const;

const VOLUMETRIC_FACTOR = 5000;

export type ShippingProductInput = {
  idProduct?: string | number;
  price?: string | number;
  quantity?: string | number;
  providerId?: string | number;
  width?: number | string | null;
  height?: number | string | null;
  largo?: number | string | null;
  storeId?: number | string | null;
  name?: string;
  stock?: number | string | null;
};

export type DeliverySelectionInput = {
  shipping_method: string;
  idAddress?: number | null;
  wantsInsurance?: "si" | "no" | string | null;
};

export type CalculatedGroupCosts = {
  shippingCost: number;
  insuranceCost: number;
  totalExtra: number;
  error?: string;
};

export function calcInsuranceCost(subtotal: number): number {
  if (subtotal < 1) return 0;
  const bloque = Math.ceil(subtotal / 1000);
  return Math.round(bloque * 17.4 * 100) / 100;
}

export function calcVolumetricShipping(volumenCm3: number) {
  const pesoVolumetrico = Math.ceil(Number(volumenCm3) / VOLUMETRIC_FACTOR);
  const tarifa = PAQUETE_EXPRESS_TARIFAS.find((t) => pesoVolumetrico <= t.max);

  return {
    tarifa: tarifa ?? null,
    pesoVolumetrico,
    excede: !tarifa,
    price: tarifa?.price ?? 0,
  };
}

export function sumProductVolume(products: ShippingProductInput[]): number {
  return products.reduce((total, item) => {
    const w = Number(item.width) || 0;
    const h = Number(item.height) || 0;
    const l = Number(item.largo) || 0;
    const qty = Number(item.quantity) || 1;
    return total + w * h * l * qty;
  }, 0);
}

export function sumProviderSubtotal(
  products: ShippingProductInput[],
  providerId: number,
): number {
  const total = products
    .filter((item) => Number(item.providerId) === providerId)
    .reduce(
      (sum, item) =>
        sum + Number(item.price || 0) * (Number(item.quantity) || 1),
      0,
    );

  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export async function getZoneShippingCost(
  idAddress: number | null | undefined,
  userId?: number,
): Promise<number> {
  if (!idAddress) return 0;

  const slcAddress = await prisma.addresses.findFirst({
    where: {
      idAddress: Number(idAddress),
      active: 1,
      ...(userId ? { userId: BigInt(userId) } : {}),
    },
  });

  if (!slcAddress?.city) return 0;

  const findZone = await prisma.shippingbyzone.findFirst({
    where: { name: slcAddress.city },
  });

  return findZone?.price ? Number(findZone.price) : 0;
}

export async function calculateGroupCosts(
  products: ShippingProductInput[],
  selection: DeliverySelectionInput,
): Promise<CalculatedGroupCosts> {
  const method = selection.shipping_method;
  let shippingCost = 0;
  let insuranceCost = 0;

  if (method === "sucursal") {
    return { shippingCost: 0, insuranceCost: 0, totalExtra: 0 };
  }

  if (method === "estafeta") {
    shippingCost = ESTAFETA_FIXED_COST;
  } else if (method === "envioLeon") {
    shippingCost = await getZoneShippingCost(selection.idAddress);
  } else if (method === "paqueteexpress") {
    const volume = sumProductVolume(products);
    const volumetric = calcVolumetricShipping(volume);
    if (volumetric.excede) {
      return {
        shippingCost: 0,
        insuranceCost: 0,
        totalExtra: 0,
        error: "Peso volumétrico excede el límite de Paquete Express",
      };
    }
    shippingCost = volumetric.price;
  }

  if (
    (method === "paqueteexpress" || method === "estafeta") &&
    selection.wantsInsurance === "si"
  ) {
    const subtotalProvider3 = sumProviderSubtotal(products, 3);
    insuranceCost = calcInsuranceCost(subtotalProvider3);
  }

  shippingCost = Math.round(shippingCost * 100) / 100;
  insuranceCost = Math.round(insuranceCost * 100) / 100;

  return {
    shippingCost,
    insuranceCost,
    totalExtra: Math.round((shippingCost + insuranceCost) * 100) / 100,
  };
}

export async function buildDataPurchaseFromSelections(
  groupedProducts: Record<
    string,
    { products: ShippingProductInput[]; selection: DeliverySelectionInput }
  >,
) {
  const dataPurchase: Record<string, any> = {};

  for (const [groupKey, group] of Object.entries(groupedProducts)) {
    const costs = await calculateGroupCosts(group.products, group.selection);
    if (costs.error) {
      throw new Error(costs.error);
    }

    dataPurchase[groupKey] = {
      shipping_method: group.selection.shipping_method,
      idAddress: group.selection.idAddress ?? null,
      wantsInsurance: group.selection.wantsInsurance ?? null,
      costoEnvioProductByZone: costs.shippingCost,
      costoSeguroEnvio: costs.insuranceCost,
    };
  }

  return dataPurchase;
}

export function calculateProductsSubtotal(products: ShippingProductInput[]) {
  const total = products
    .filter((item) => Number(item.quantity) > 0)
    .reduce(
      (sum, item) =>
        sum + Number(item.price || 0) * (Number(item.quantity) || 1),
      0,
    );

  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function calculateExtrasTotal(
  dataPurchase: Record<string, { costoEnvioProductByZone?: number; costoSeguroEnvio?: number }>,
) {
  return Object.values(dataPurchase).reduce((acc, item) => {
    return (
      acc +
      Number(item.costoEnvioProductByZone || 0) +
      Number(item.costoSeguroEnvio || 0)
    );
  }, 0);
}

export async function validateProductPrices(
  products: ShippingProductInput[],
): Promise<{ ok: boolean; message?: string }> {
  for (const product of products) {
    const qty = Number(product.quantity) || 0;
    if (qty <= 0) {
      return { ok: false, message: `Cantidad inválida para producto ${product.idProduct}` };
    }

    const dbProduct = await prisma.products.findFirst({
      where: { idProduct: BigInt(product.idProduct!), active: 1 },
      select: { price: true, stock: true },
    });

    if (!dbProduct) {
      return { ok: false, message: `Producto ${product.idProduct} no encontrado` };
    }

    const clientPrice = Math.round(Number(product.price) * 100) / 100;
    const dbPrice = Math.round(Number(dbProduct.price) * 100) / 100;

    if (clientPrice !== dbPrice) {
      return {
        ok: false,
        message: `Precio inválido para producto ${product.idProduct}`,
      };
    }

    if (Number(dbProduct.stock) < qty) {
      return {
        ok: false,
        message: `Stock insuficiente para producto ${product.idProduct}`,
      };
    }
  }

  return { ok: true };
}
