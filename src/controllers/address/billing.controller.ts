import { Response } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { prisma } from "../../db/prismaClient";

function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(20, Math.max(1, Number(query.limit) || 5));
  return { page, limit, skip: (page - 1) * limit };
}

function normalizeCodePostal(codePostal: unknown) {
  if (codePostal == null || String(codePostal).trim() === "") return null;
  return String(codePostal).replace(/\D/g, "").slice(0, 10);
}

function serializeBilling(record: {
  createdAt: Date | null;
  companyName: string | null;
  idBilling: bigint;
  userId: bigint;
  rfc: string | null;
  cfdi: string | null;
  taxRegimen: string | null;
  methodPay: string | null;
  codePostal: string | null;
  cologne: string | null;
  state: string | null;
  city: string | null;
  street: string | null;
  noExt: string | null;
  noInt: string | null;
  observations: string | null;
  country: string | null;
  active?: number | null;
}) {
  return {
    createdAt: record.createdAt,
    companyName: record.companyName,
    idBilling: Number(record.idBilling),
    userId: Number(record.userId),
    rfc: record.rfc,
    cfdi: record.cfdi,
    taxRegimen: record.taxRegimen,
    methodPay: record.methodPay,
    codePostal: record.codePostal,
    cologne: record.cologne,
    state: record.state,
    city: record.city,
    street: record.street,
    noExt: record.noExt,
    noInt: record.noInt,
    observations: record.observations,
    country: record.country,
    active: record.active ?? 1,
  };
}

export const getBillingByUser = async (req: CustomRequestI, res: Response) => {
  try {
    const recordBillingUser = await prisma.billing.findFirst({
      where: {
        userId: Number(req.idUser),
        active: 1,
      } as any,
      orderBy: { createdAt: "desc" },
    });

    if (!recordBillingUser) {
      return res.status(200).json({
        ok: true,
        message: "Vacio!",
        data: {
          data: null,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: serializeBilling(recordBillingUser),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const listBilling = async (req: CustomRequestI, res: Response) => {
  try {
    const userId = Number(req.idUser);
    const { page, limit, skip } = parsePagination(
      req.query as Record<string, unknown>,
    );
    const where = { userId, active: 1 } as any;

    const [total, rows] = await Promise.all([
      prisma.billing.count({ where }),
      prisma.billing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);

    let data = rows;
    if (safePage !== page && totalPages > 0) {
      data = await prisma.billing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * limit,
        take: limit,
      });
    }

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: data.map(serializeBilling),
        pagination: {
          page: safePage,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const createBilling = async (req: CustomRequestI, res: Response) => {
  try {
    const {
      companyName,
      rfc,
      cfdi,
      taxRegimen,
      methodPay,
      codePostal,
      state,
      city,
    } = req.body;

    if (
      !companyName ||
      !rfc ||
      !cfdi ||
      !taxRegimen ||
      !methodPay ||
      !state ||
      !city
    ) {
      return res.status(400).json({
        ok: false,
        message: "Completa los datos de facturación para guardar.",
      });
    }

    const userId = Number(req.idUser);
    const existingActive = await prisma.billing.findFirst({
      where: {
        userId,
        active: 1,
      } as any,
      select: { idBilling: true },
    });

    if (existingActive) {
      return res.status(400).json({
        ok: false,
        message:
          "Ya tienes información fiscal registrada. Solo puedes editarla o eliminarla.",
      });
    }

    await prisma.billing.create({
      data: {
        companyName,
        rfc,
        cfdi,
        taxRegimen,
        methodPay,
        codePostal: normalizeCodePostal(codePostal),
        cologne: "",
        state,
        city,
        street: "",
        noExt: "",
        noInt: "",
        observations: "",
        userId: req?.idUser,
        active: 1,
      } as any,
    });

    return res.status(200).json({
      ok: true,
      message: "Datos de facturacion registrada correctamente",
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

export const updateBilling = async (req: CustomRequestI, res: Response) => {
  try {
    const {
      idBilling,
      companyName,
      rfc,
      cfdi,
      taxRegimen,
      methodPay,
      codePostal,
      state,
      city,
    } = req.body;

    if (!idBilling) {
      return res.status(400).json({
        ok: false,
        message: "Falta el identificador de facturación",
      });
    }

    if (
      !companyName ||
      !rfc ||
      !cfdi ||
      !taxRegimen ||
      !methodPay ||
      !state ||
      !city
    ) {
      return res.status(400).json({
        ok: false,
        message: "Completa los datos de facturación para actualizar.",
      });
    }

    const existing = await prisma.billing.findFirst({
      where: {
        idBilling: Number(idBilling),
        userId: Number(req.idUser),
        active: 1,
      } as any,
    });

    if (!existing) {
      return res.status(400).json({
        ok: false,
        message: "Registro de facturación no encontrado o no pertenece a su usuario",
      });
    }

    await prisma.billing.update({
      where: { idBilling: Number(idBilling) },
      data: {
        companyName,
        rfc,
        cfdi,
        taxRegimen,
        methodPay,
        codePostal: normalizeCodePostal(codePostal),
        state,
        city,
      },
    });

    return res.status(200).json({
      ok: true,
      message: "Datos de facturación actualizados correctamente",
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

export const removeBilling = async (req: CustomRequestI, res: Response) => {
  try {
    const { idBilling } = req.body;

    if (!idBilling) {
      return res.status(400).json({
        ok: false,
        message: "Falta el identificador de facturación",
      });
    }

    const existing = await prisma.billing.findFirst({
      where: {
        idBilling: Number(idBilling),
        userId: Number(req.idUser),
        active: 1,
      } as any,
    });

    if (!existing) {
      return res.status(400).json({
        ok: false,
        message: "Registro de facturación no encontrado o no pertenece a su usuario",
      });
    }

    await prisma.billing.update({
      where: { idBilling: Number(idBilling) },
      data: { active: 0 } as any,
    });

    return res.status(200).json({
      ok: true,
      message: "Datos de facturación eliminados",
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};
