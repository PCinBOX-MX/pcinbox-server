"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuth = void 0;
const jsonwebtoken_1 = require("jsonwebtoken");
const prismaClient_1 = require("../../db/prismaClient");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: ".env.prod" });
const getAuth = async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Token no proporcionado" });
    }
    const token = authHeader.split(" ")[1];
    try {
        if (!token ||
            token === "null" ||
            token === "undefined" ||
            token === "false") {
            return res.status(401).json({ message: "Token no proporcionado" });
        }
        const secret = process.env.KEY_JWT || "";
        const decoded = (0, jsonwebtoken_1.verify)(token, secret);
        if (decoded) {
            //Datos del usuario de dirección del envío
            let dataAddress = null;
            if (!decoded.idUser) {
                const slcUser = await prismaClient_1.prisma.users.findFirst({
                    where: {
                        email: decoded.email,
                    },
                });
                dataAddress = await prismaClient_1.prisma.addresses.findMany({
                    where: {
                        userId: Number(slcUser?.idUser),
                    },
                    select: {
                        street: true,
                        noExt: true,
                        noInt: true,
                        cologne: true,
                        city: true,
                        state: true,
                        country: true,
                        postalCode: true,
                        phone1: true,
                        phone2: true,
                    },
                });
            }
            else {
                dataAddress = await prismaClient_1.prisma.addresses.findMany({
                    where: {
                        userId: decoded.idUser,
                    },
                    select: {
                        street: true,
                        noExt: true,
                        noInt: true,
                        cologne: true,
                        city: true,
                        state: true,
                        country: true,
                        postalCode: true,
                        phone1: true,
                        phone2: true,
                    },
                });
            }
            return res.status(200).json({
                ok: true,
                message: "Token correcto",
                data: {
                    dataAddress,
                },
            });
        }
        else {
            return res
                .status(401)
                .json({ ok: false, message: "Token expirado o invalido" });
        }
    }
    catch (err) {
        return res
            .status(401)
            .json({ ok: false, message: "Token inválido o expirado" });
    }
};
exports.getAuth = getAuth;
//# sourceMappingURL=auth.controller.js.map