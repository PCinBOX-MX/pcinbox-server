import axios from "axios";
import { Request, Response } from "express";
import { prisma } from "../../db/prismaClient";
import "../../config/loadEnv";
import { getSharedJson } from "../../services/shared-response.service";

const apiGeoNames = axios.create({
  baseURL: `http://api.geonames.org`,
  params: {
    username: process.env.KEY_GEONAMES,
  },
});

export const getAddressWithPostalCode = async (req: Request, res: Response) => {
  try {
    const { postalCode } = req.body;

    if (!postalCode) {
      return res.status(400).json({ ok: false, message: "Faltan campos" });
    }

    const code = String(postalCode).trim();
    const data = await getSharedJson(
      `geonames:cp:${code}`,
      async () => {
        const response = await apiGeoNames.get(
          `/postalCodeLookupJSON?postalcode=${encodeURIComponent(code)}&country=MX`,
        );
        if (response.status !== 200) {
          throw new Error("No se pudo consultar el código postal");
        }
        return response.data;
      },
      60 * 60 * 24,
    );

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: true,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const ShippingByZone = async (req: Request, res: Response) => {
  try {
    const { destino } = req.body;

    if (!destino) {
      return res
        .status(400)
        .json({ ok: false, message: "Falta agregar el destino" });
    }

    let slcAddress = await prisma.addresses.findFirst({
      where: {
        idAddress: Number(destino),
        active: 1,
      },
    });

    if (!slcAddress) {
      return res
        .status(400)
        .json({ ok: false, message: "Dirección no encontrada" });
    }

    let findZone = await prisma.shippingbyzone.findFirst({
      where: {
        name: slcAddress?.city!,
      },
    });

    return res.status(200).json({
      ok: true,
      data: findZone
        ? {
            costo: findZone?.price,
            destino: destino,
          }
        : null,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};
