"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBilling = exports.getBillingByUser = void 0;
const prismaClient_1 = require("../../db/prismaClient");
const getBillingByUser = async (req, res) => {
    try {
        const recordBillingUser = await prismaClient_1.prisma.billing.findFirst({
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.getBillingByUser = getBillingByUser;
const createBilling = async (req, res) => {
    try {
        const { companyName, rfc, cfdi, taxRegimen, methodPay, codePostal, 
        // cologne,
        state, city,
        // street,
        // noExt,
        // noInt,
        // observations,
         } = req.body;
        await prismaClient_1.prisma.billing.create({
            data: {
                companyName,
                rfc,
                cfdi,
                taxRegimen,
                methodPay,
                codePostal,
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error en el servidor",
            error: error.message,
        });
    }
};
exports.createBilling = createBilling;
//# sourceMappingURL=billing.controller.js.map