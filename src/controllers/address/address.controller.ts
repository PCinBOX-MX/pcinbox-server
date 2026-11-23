import { prisma } from "../../db/prismaClient";
import { Response } from "express";
import { readExcelImageKit } from "./../../services/index.service";
import "../../config/loadEnv";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { cacheDelByPrefix } from "../../infra/redis/cache.util";
import {
  isMaskedOrIncompletePhone,
  maskUserPhone,
  normalizeStoredPhone,
} from "../../utils/phoneMask.util";

function invalidateZoneShippingCache(idAddress: number | string) {
  void cacheDelByPrefix(`shipping:zone:${Number(idAddress)}:`);
}

function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(20, Math.max(1, Number(query.limit) || 5));
  return { page, limit, skip: (page - 1) * limit };
}

function serializeAddress(item: {
  idAddress: bigint;
  userId: bigint;
  street: string | null;
  noExt: string;
  noInt: string | null;
  cologne: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  phone1: string | null;
  phone2: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  active: number | null;
}) {
  return {
    ...item,
    idAddress: Number(item.idAddress),
    userId: Number(item.userId),
    // Lecturas: nunca exponer teléfonos en claro.
    phone1: maskUserPhone(item.phone1) || "",
    phone2: maskUserPhone(item.phone2) || "",
  };
}

/** En update: máscara/vacío conserva el actual; vacío en phone2 limpia. */
function resolveAddressPhoneUpdate(
  incoming: unknown,
  current: string | null | undefined,
  opts?: { allowClear?: boolean },
): string {
  const raw = typeof incoming === "string" ? incoming.trim() : "";
  if (!raw) {
    return opts?.allowClear ? "" : String(current || "");
  }
  if (isMaskedOrIncompletePhone(raw)) {
    return String(current || "");
  }
  return normalizeStoredPhone(raw);
}

export const hasAddressUser = async (req: CustomRequestI, res: Response) => {
  try {
    let findAdrress = await prisma.addresses.findMany({
      where: {
        userId: Number(req.idUser.toString()),
        active: 1,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: findAdrress.map(serializeAddress),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Ocurrio un error interno del servidor",
      error: error.message,
    });
  }
};

export const listAddresses = async (req: CustomRequestI, res: Response) => {
  try {
    const userId = Number(req.idUser);
    const { page, limit, skip } = parsePagination(
      req.query as Record<string, unknown>,
    );
    const where = { userId, active: 1 };

    const [total, rows] = await Promise.all([
      prisma.addresses.count({ where }),
      prisma.addresses.findMany({
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
      data = await prisma.addresses.findMany({
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
        data: data.map(serializeAddress),
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
      message: "Ocurrio un error interno del servidor",
      error: error.message,
    });
  }
};

export const registerAddress = async (req: CustomRequestI, res: Response) => {
  try {
    const {
      street,
      noExt,
      noInt,
      codePostal,
      cologne,
      country,
      state,
      city,
      phone1,
      phone2,
    } = req.body;

    if (
      !street ||
      !noExt ||
      !codePostal ||
      !cologne ||
      !state ||
      !city ||
      !phone1 ||
      !country
    ) {
      return res.status(400).json({ ok: false, message: "Completa los datos de la dirección para guardar." });
    }

    const dataRespExcelCP = await readExcelImageKit(
      process.env.URL_EXCEL_CP_PE || "",
    );

    if (dataRespExcelCP.length == 0) {
      return res.status(500).json({
        ok: false,
        message: "Error al intentar leer el archivo de cobertura",
      });
    }

    let findCP: any = dataRespExcelCP.find(
      (cp: any) => cp["CODIGO POSTAL"] === codePostal.toString().trim(),
    );

    if (findCP && findCP["COBERTURA"] === "ZONA PLUS") {
      return res.status(400).json({
        ok: false,
        message: `No hay servicio de envío para este código postal ${codePostal}`,
      });
    }

    const userId = Number(req.idUser);

    const existingAddresses = await prisma.addresses.findMany({
      where: { userId, active: 1 },
    });

    const isSameAddress = (a: any, b: any) => {
      return (
        a.street === b.street &&
        a.city === b.city &&
        a.state === b.state &&
        a.country === b.country &&
        String(a.postalCode) === String(b.codePostal ?? b.postalCode) &&
        a.noExt === b.noExt &&
        a.noInt === b.noInt
      );
    };

    const duplicate = existingAddresses.find((addr) =>
      isSameAddress(addr, req.body),
    );

    if (duplicate) {
      return res.status(200).json({
        ok: true,
        message: "Ya tienes una dirección registrada con los mismos datos.",
        data: serializeAddress(duplicate as any),
      });
    }

    if (isMaskedOrIncompletePhone(phone1)) {
      return res.status(400).json({
        ok: false,
        message:
          "El teléfono debe incluir una LADA válida y 10 dígitos, por ejemplo: +52 4771234567",
      });
    }

    const phone1Saved = normalizeStoredPhone(phone1);
    const phone2Saved =
      phone2 && !isMaskedOrIncompletePhone(phone2)
        ? normalizeStoredPhone(phone2)
        : "";

    await prisma.addresses.create({
      data: {
        city,
        state,
        country,
        street,
        postalCode: String(codePostal).trim(),
        userId,
        noExt,
        noInt,
        cologne,
        phone1: phone1Saved,
        phone2: phone2Saved,
      },
    });

    let findAdrress = await prisma.addresses.findMany({
      where: {
        userId: Number(req.idUser.toString()),
        active: 1,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      ok: true,
      message: "Dirección registrada correctamente.",
      data: {
        data: findAdrress.map(serializeAddress),
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

export const removeAddress = async (req: CustomRequestI, res: Response) => {
  try {
    const { idAddress } = req.body;

    if (!idAddress) {
      return res
        .status(400)
        .json({ ok: false, message: "Falta mandar campo de idAdress" });
    }

    let slcAddress = await prisma.addresses.findFirst({
      where: {
        idAddress: idAddress,
        userId: Number(req.idUser),
        active: 1,
      },
    });

    if (!slcAddress) {
      return res.status(400).json({
        ok: false,
        message: "Domicilio no encontrado o no pertenece a su usuario",
      });
    }

    await prisma.addresses.update({
      data: {
        active: 0,
      },
      where: {
        idAddress: idAddress,
      },
    });

    invalidateZoneShippingCache(idAddress);

    let findAdrress = await prisma.addresses.findMany({
      where: {
        userId: Number(req.idUser.toString()),
        active: 1,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      ok: true,
      message: "Domicilio eliminado",
      data: {
        data: findAdrress.map(serializeAddress),
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

export const updatedAddress = async (req: CustomRequestI, res: Response) => {
  try {
    const {
      city,
      codePostal,
      cologne,
      country,
      idAddress,
      noExt,
      noInt,
      phone1,
      phone2,
      state,
      street,
    } = req.body;

    if (!idAddress) {
      return res.status(400).json({
        ok: false,
        message: "Falta el identificador de la dirección",
      });
    }

    const dataRespExcelCP = await readExcelImageKit(
      process.env.URL_EXCEL_CP_PE || "",
    );

    if (dataRespExcelCP.length == 0) {
      return res.status(500).json({
        ok: false,
        message: "Error al intentar leer el archivo de cobertura",
      });
    }

    let findCP: any = dataRespExcelCP.find(
      (cp: any) => cp["CODIGO POSTAL"] === codePostal.toString().trim(),
    );

    if (findCP && findCP["COBERTURA"] === "ZONA PLUS") {
      return res.status(400).json({
        ok: false,
        message: `No hay servicio de envío para este código postal ${codePostal}`,
      });
    }

    let slcAddress = await prisma.addresses.findFirst({
      where: {
        idAddress: idAddress,
        userId: Number(req.idUser),
        active: 1,
      },
    });

    if (!slcAddress) {
      return res.status(400).json({
        ok: false,
        message: "Domicilio no encontrado o no pertenece a su usuario",
      });
    }

    const nextPhone1 = resolveAddressPhoneUpdate(phone1, slcAddress.phone1);
    const nextPhone2 = resolveAddressPhoneUpdate(phone2, slcAddress.phone2, {
      allowClear: true,
    });

    if (!nextPhone1 || isMaskedOrIncompletePhone(nextPhone1)) {
      return res.status(400).json({
        ok: false,
        message:
          "El teléfono debe incluir una LADA válida y 10 dígitos, o déjalo vacío para conservar el actual.",
      });
    }

    await prisma.addresses.update({
      data: {
        city,
        postalCode: String(codePostal).trim(),
        cologne,
        country,
        noExt,
        noInt,
        phone1: nextPhone1,
        phone2: nextPhone2,
        state,
        street,
      },
      where: {
        idAddress: idAddress,
      },
    });

    invalidateZoneShippingCache(idAddress);

    let findAdrress = await prisma.addresses.findMany({
      where: {
        userId: Number(req.idUser.toString()),
        active: 1,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      ok: true,
      message: "Domicilio actualizado",
      data: {
        data: findAdrress.map(serializeAddress),
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
