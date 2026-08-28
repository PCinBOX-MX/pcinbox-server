import { Response } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { prisma } from "../../db/prismaClient";

export const getBillingByUser = async (req: CustomRequestI, res: Response) => {
  try {
    const recordBillingUser = await prisma.billing.findFirst({
      where: {
        userId: Number(req.idUser),
      },
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
        data: {
          createdAt: recordBillingUser.createdAt,
          companyName: recordBillingUser.companyName,
          idBilling: Number(recordBillingUser.idBilling),
          userId: Number(recordBillingUser.userId),
          rfc: recordBillingUser.rfc,
          cfdi: recordBillingUser.cfdi,
          taxRegimen: recordBillingUser.taxRegimen,
          methodPay: recordBillingUser.methodPay,
          codePostal: recordBillingUser.codePostal,
          cologne: recordBillingUser.cologne,
          state: recordBillingUser.state,
          city: recordBillingUser.city,
          street: recordBillingUser.street,
          noExt: recordBillingUser.noExt,
          noInt: recordBillingUser.noInt,
          observations: recordBillingUser.observations,
          country: recordBillingUser.country,
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
      // cologne,
      state,
      city,
      // street,
      // noExt,
      // noInt,
      // observations,
    } = req.body;

    await prisma.billing.create({
      data: {
        companyName,
        rfc,
        cfdi,
        taxRegimen,
        methodPay,
        codePostal:
          codePostal != null && String(codePostal).trim() !== ""
            ? String(codePostal).replace(/\D/g, "").slice(0, 10)
            : null,
        cologne: "",
        state,
        city,
        street: "",
        noExt: "",
        noInt: "",
        observations: "",
        userId: req?.idUser,
      },
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
