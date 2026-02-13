"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatedAddress = exports.removeAddress = exports.registerAddress = exports.hasAddressUser = void 0;
const prismaClient_1 = require("../../db/prismaClient");
const index_service_1 = require("./../../services/index.service");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: ".env.prod" });
const hasAddressUser = async (req, res) => {
    try {
        let findAdrress = await prismaClient_1.prisma.addresses.findMany({
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Ocurrio un error interno del servidor",
            error: error.message,
        });
    }
};
exports.hasAddressUser = hasAddressUser;
const registerAddress = async (req, res) => {
    try {
        const { street, noExt, noInt, codePostal, cologne, country, state, city, phone1, phone2, } = req.body;
        if (!street ||
            !noExt ||
            !codePostal ||
            !cologne ||
            !state ||
            !city ||
            !phone1 ||
            !country) {
            return res.status(400).json({ ok: false, message: "Faltan campos" });
        }
        const dataRespExcelCP = await (0, index_service_1.readExcelImageKit)(process.env.URL_EXCEL_CP_PE || "");
        if (dataRespExcelCP.length == 0) {
            return res.status(500).json({
                ok: false,
                message: "Error al intentar leer el archivo de cobertura",
            });
        }
        let findCP = dataRespExcelCP.find((cp) => cp["CODIGO POSTAL"] === codePostal.toString().trim());
        if (findCP && findCP["COBERTURA"] === "ZONA PLUS") {
            return res.status(400).json({
                ok: false,
                message: `No hay servicio de envío para este código postal ${codePostal}`,
            });
        }
        const userId = Number(req.idUser);
        const existingAddresses = await prismaClient_1.prisma.addresses.findMany({
            where: { userId },
        });
        const isSameAddress = (a, b) => {
            return (a.street === b.street &&
                a.city === b.city &&
                a.state === b.state &&
                a.country === b.country &&
                a.postalCode === b.postalCode &&
                a.noExt === b.noExt &&
                a.noInt === b.noInt);
        };
        const duplicate = existingAddresses.find((addr) => isSameAddress(addr, req.body));
        if (duplicate) {
            return res.status(200).json({
                ok: true,
                message: "Ya tienes una dirección registrada con los mismos datos.",
                data: duplicate,
            });
        }
        await prismaClient_1.prisma.addresses.create({
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
        let findAdrress = await prismaClient_1.prisma.addresses.findMany({
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.registerAddress = registerAddress;
const removeAddress = async (req, res) => {
    try {
        const { idAddress } = req.body;
        if (!idAddress) {
            return res
                .status(400)
                .json({ ok: false, message: "Falta mandar campo de idAdress" });
        }
        let slcAddress = await prismaClient_1.prisma.addresses.findFirst({
            where: {
                idAddress: idAddress,
            },
        });
        if (!slcAddress) {
            return res.status(400).json({
                ok: false,
                message: "Domicilio no encontrado",
            });
        }
        await prismaClient_1.prisma.addresses.update({
            data: {
                active: 0,
            },
            where: {
                idAddress: idAddress,
            },
        });
        let findAdrress = await prismaClient_1.prisma.addresses.findMany({
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.removeAddress = removeAddress;
const updatedAddress = async (req, res) => {
    try {
        const { city, codePostal, cologne, country, idAddress, noExt, noInt, phone1, phone2, state, street, } = req.body;
        const dataRespExcelCP = await (0, index_service_1.readExcelImageKit)(process.env.URL_EXCEL_CP_PE || "");
        if (dataRespExcelCP.length == 0) {
            return res.status(500).json({
                ok: false,
                message: "Error al intentar leer el archivo de cobertura",
            });
        }
        let findCP = dataRespExcelCP.find((cp) => cp["CODIGO POSTAL"] === codePostal.toString().trim());
        if (findCP && findCP["COBERTURA"] === "ZONA PLUS") {
            return res.status(400).json({
                ok: false,
                message: `No hay servicio de envío para este código postal ${codePostal}`,
            });
        }
        await prismaClient_1.prisma.addresses.update({
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
        let findAdrress = await prismaClient_1.prisma.addresses.findMany({
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.updatedAddress = updatedAddress;
//# sourceMappingURL=address.controller.js.map