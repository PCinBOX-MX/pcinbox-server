"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiddleAdminRoute = exports.MiddleAuthRoute = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
require("../config/loadEnv");
const prismaClient_1 = require("./../db/prismaClient");
const MiddleAuthRoute = async (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        if (decoded) {
            if (!decoded.idUser) {
                const slcUser = await prismaClient_1.prisma.users.findFirst({
                    where: {
                        email: decoded.email,
                    },
                    select: {
                        idUser: true,
                    },
                });
                if (!slcUser?.idUser) {
                    return res.status(401).json({ message: "Usuario no encontrado" });
                }
                req.idUser = slcUser.idUser;
                next();
                return;
            }
            req.idUser = decoded.idUser;
            next();
            return;
        }
        else {
            return res.status(401).json({ message: "Token expirado o invalido" });
        }
    }
    catch (err) {
        return res.status(401).json({ message: "Token inválido o expirado" });
    }
};
exports.MiddleAuthRoute = MiddleAuthRoute;
const MiddleAdminRoute = async (req, res, next) => {
    const userId = Number(req.idUser);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({ message: "Sesión inválida" });
    }
    try {
        const user = await prismaClient_1.prisma.users.findFirst({
            where: { idUser: userId, active: 1 },
            select: { role: true },
        });
        if (user?.role !== "admin") {
            return res.status(403).json({
                ok: false,
                message: "No tienes permisos para administrar cotizaciones",
            });
        }
        next();
    }
    catch {
        return res.status(500).json({
            ok: false,
            message: "No fue posible validar los permisos administrativos",
        });
    }
};
exports.MiddleAdminRoute = MiddleAdminRoute;
//# sourceMappingURL=index.middleware.js.map