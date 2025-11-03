"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiddleAuthRoute = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const prismaClient_1 = require("./../db/prismaClient");
// const envFile = `.env.${process.env.NODE_ENV || "local"}`;
dotenv_1.default.config({ path: ".env.prod" });
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
                req.idUser = slcUser?.idUser;
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
//# sourceMappingURL=index.middleware.js.map