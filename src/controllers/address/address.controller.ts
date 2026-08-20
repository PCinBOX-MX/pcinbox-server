import { prisma } from "../../db/prismaClient";
import { Response } from "express";
import { readExcelImageKit } from "./../../services/index.service";
import "../../config/loadEnv";
import CustomRequestI from "./../../interfaces/customrequest.interface";

export const hasAddressUser = async (req: CustomRequestI, res: Response) => {
  try {
    let findAdrress = await prisma.addresses.findMany({
      where: {
        userId: Number(req.idUser.toString()),
        active: 1,
      },
    });

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: findAdrress.map((item) => ({
          ...item,
          idAddress: Number(item.idAddress),
          userId: Number(item.userId),
        })),
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
      where: { userId },
    });

    const isSameAddress = (a: any, b: any) => {
      return (
        a.street === b.street &&
        a.city === b.city &&
        a.state === b.state &&
        a.country === b.country &&
        a.postalCode === b.postalCode &&
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
        data: duplicate,
      });
    }
    await prisma.addresses.create({
      data: {
        city,
        state,
        country,
        street,
        postalCode: codePostal,
        userId,
        noExt,
        noInt,
        cologne,
        phone1,
        phone2,
      },
    });

    let findAdrress = await prisma.addresses.findMany({
      where: {
        userId: Number(req.idUser.toString()),
        active: 1,
      },
    });

    return res.status(200).json({
      ok: true,
      message: "Dirección registrada correctamente.",
      data: {
        data: findAdrress.map((item) => ({
          ...item,
          idAddress: Number(item.idAddress),
          userId: Number(item.userId),
        })),
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

    let findAdrress = await prisma.addresses.findMany({
      where: {
        userId: Number(req.idUser.toString()),
        active: 1,
      },
    });

    return res.status(200).json({
      ok: true,
      message: "Domicilio eliminado",
      data: {
        data: findAdrress.map((item) => ({
          ...item,
          idAddress: Number(item.idAddress),
          userId: Number(item.userId),
        })),
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
        city,
        postalCode: codePostal.toString(),
        cologne,
        country,
        noExt,
        noInt,
        phone1,
        phone2,
        state,
        street,
      },
      where: {
        idAddress: idAddress,
      },
    });

    let findAdrress = await prisma.addresses.findMany({
      where: {
        userId: Number(req.idUser.toString()),
        active: 1,
      },
    });

    return res.status(200).json({
      ok: true,
      message: "Domicilio actualizado",
      data: {
        data: findAdrress.map((item) => ({
          ...item,
          idAddress: Number(item.idAddress),
          userId: Number(item.userId),
        })),
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
