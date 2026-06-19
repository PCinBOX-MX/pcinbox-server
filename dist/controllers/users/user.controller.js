"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeAccount = exports.ChangePassword = exports.getPhotoUser = exports.uploadPhoto = exports.LoginGoogle = exports.Register = exports.Login = void 0;
const prismaClient_1 = require("../../db/prismaClient");
const index_service_1 = require("./../../services/index.service");
const luxon_1 = require("luxon");
const imagekit_1 = require("./../../imagekit/imagekit");
const dotenv_1 = __importDefault(require("dotenv"));
const resend_service_1 = require("../../services/resend.service");
const fechaLocal = luxon_1.DateTime.now().setZone("America/Mexico_City");
dotenv_1.default.config({ path: ".env.prod" });
const Login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res
                .status(400)
                .json({ ok: false, message: "Faltan campos en el body json" });
        }
        const slcUser = await prismaClient_1.prisma.users.findFirst({
            select: {
                idUser: true,
                password: true,
                email: true,
                role: true,
                name: true,
                lastname: true,
            },
            where: {
                email: email,
                active: 1,
            },
        });
        if (!slcUser) {
            return res.status(403).json({
                ok: false,
                message: `La cuenta con el correo ${email} no existe en el sistema o se eliminó`,
            });
        }
        if (!slcUser.password) {
            return res.status(400).json({
                ok: false,
                message: `El usuario ${slcUser.email} no tiene contraseña`,
            });
        }
        //Verificamos que si este correcta su password
        const veryPass = await (0, index_service_1.verifyPassword)(password, slcUser.password);
        if (!veryPass) {
            return res.status(400).json({
                ok: false,
                message: "La contraseña o el correo electrónico son incorrectos",
            });
        }
        let sendToken = null;
        //Generamos el token y dura 3 dias
        sendToken = (0, index_service_1.signPayload)({
            email,
            idUser: slcUser.idUser.toString(),
            rol: slcUser.role,
        }, "3d");
        // Obtener total de favoritos
        const totalFavorites = await prismaClient_1.prisma.favorites.count({
            where: {
                userId: Number(slcUser.idUser),
                active: 1,
            },
        });
        return res.status(200).json({
            ok: true,
            message: "Logueado!!",
            data: {
                token: sendToken,
                email: slcUser.email,
                name: slcUser.name,
                lastname: slcUser.lastname,
                idUser: slcUser.idUser.toString(),
                role: slcUser?.role,
                totalFavorites,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message,
            message: "Error interno del servidor",
        });
    }
};
exports.Login = Login;
const Register = async (req, res) => {
    try {
        const { name, lastname, email, password, rol, phone, } = req.body;
        if (!name || !email || !password || !lastname || !phone)
            return res
                .status(400)
                .json({ ok: false, message: "Completa los campos" });
        //Validamos que no este registrado el email entrante en la DB
        const isExistEmail = await prismaClient_1.prisma.users.findFirst({
            where: {
                email: email.toString().trim(),
            },
            select: {
                email: true,
            },
        });
        if (isExistEmail) {
            return res.status(400).json({
                ok: false,
                message: `El correo ${email} ya está registrado o se desvinculó del sistema`,
            });
        }
        //Encriptamos la password
        const hPass = await (0, index_service_1.hasPassword)(password);
        await prismaClient_1.prisma.users.create({
            data: {
                name: name,
                email: email,
                password: hPass,
                lastname: lastname,
                createdAT: fechaLocal.toISO(),
                role: !rol ? "customer" : rol,
                phone: phone,
            },
        });
        try {
            //await SendEmailWelcomeUser(`${name} ${lastname}`, email);
            await (0, resend_service_1.sendEmailResend)(email, "Bienvenido a PCinBOX", "welcome-email-1", {
                NAME: `${name} ${lastname}`,
            });
        }
        catch (error) {
            //Notificar cuando no se haya enviado el correo
            (0, index_service_1.writeErrorLogs)(error);
        }
        return res.status(200).json({
            ok: true,
            mesage: `Usuario ${name} registrado correctamente`,
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message,
            message: "Error interno del servidor",
        });
    }
};
exports.Register = Register;
const LoginGoogle = async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email || !name) {
            return res
                .status(400)
                .json({ ok: false, message: "Faltan campos en el body json" });
        }
        let slcUser = null;
        slcUser = await prismaClient_1.prisma.users.findFirst({
            where: {
                email: email,
            },
            select: {
                idUser: true,
                role: true,
                email: true,
                name: true,
                lastname: true,
                active: true,
            },
        });
        if (!slcUser) {
            slcUser = await prismaClient_1.prisma.users.create({
                data: {
                    email: email,
                    name: name,
                    password: null,
                    lastname: null,
                },
                select: {
                    idUser: true,
                    role: true,
                    email: true,
                    name: true,
                    lastname: true,
                    active: true,
                },
            });
            try {
                await (0, resend_service_1.sendEmailResend)(email, "Bienvenido a PCinBOX", "welcome-email-1", {
                    NAME: name,
                });
                // await SendEmailWelcomeUser(
                //   `${name}`,
                //   email,
                // );
            }
            catch (error) {
                //Notificar cuando no se haya enviado el correo
                (0, index_service_1.writeErrorLogs)(error);
            }
        }
        else if (slcUser.active == 0) {
            return res.status(400).json({
                ok: false,
                message: `La cuenta ${slcUser.email} se desvinculó y ya no se podrá usar`,
            });
        }
        let sendToken = null;
        //Generamos el token y dura 3 dias
        sendToken = (0, index_service_1.signPayload)({
            email,
            idUser: slcUser.idUser.toString(),
            rol: slcUser.role,
        }, "3d");
        // Obtener total de favoritos
        const totalFavorites = await prismaClient_1.prisma.favorites.count({
            where: {
                userId: Number(slcUser.idUser),
                active: 1,
            },
        });
        return res
            .status(200)
            .json({
            ok: true,
            message: "Logueado!!",
            data: {
                token: sendToken,
                email: slcUser.email,
                name: slcUser.name,
                lastname: slcUser.lastname,
                idUser: Number(slcUser.idUser.toString()),
                active: slcUser.active,
                totalFavorites,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message,
            message: "Error interno del servidor",
        });
    }
};
exports.LoginGoogle = LoginGoogle;
const uploadPhoto = async (req, res) => {
    try {
        const file = req.file;
        if (!file)
            return res.status(400).json({ ok: false, message: "Foto no subida" });
        const result = await (0, imagekit_1.uploadPhotoUser)(file, req.idUser);
        if (result) {
            return res.status(200).json({
                ok: true,
                message: "Foto actualizada correctamente",
                data: {
                    rutaImg: result,
                },
            });
        }
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.uploadPhoto = uploadPhoto;
const getPhotoUser = async (req, res) => {
    try {
        const result = await (0, imagekit_1.getPhotoUserAWS)(req.idUser);
        if (!result) {
            return res.status(200).json({
                ok: false,
                message: "Sin imagen",
                data: {
                    rutaImg: "",
                },
            });
        }
        if (result) {
            return res.status(200).json({
                ok: true,
                message: "Imagen obtenida",
                data: {
                    rutaImg: result,
                },
            });
        }
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.getPhotoUser = getPhotoUser;
const ChangePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const findPassHas = await prismaClient_1.prisma.users.findFirst({
            where: {
                idUser: req.idUser,
            },
            select: {
                password: true,
            },
        });
        if (!findPassHas?.password) {
            return res
                .status(400)
                .json({ ok: false, message: "Contrasena no encontrada" });
        }
        let verifyCurrentPass = await (0, index_service_1.verifyPassword)(currentPassword, findPassHas.password);
        if (!verifyCurrentPass) {
            return res
                .status(400)
                .json({ ok: false, message: "La contraseña actual es incorrecta" });
        }
        const createdAt = luxon_1.DateTime.now()
            .setZone("America/Mexico_City", { keepLocalTime: true })
            .toJSDate();
        let newPasswordInsert = await (0, index_service_1.hasPassword)(newPassword);
        const insertNewPass = await prismaClient_1.prisma.users.update({
            where: {
                idUser: req.idUser,
            },
            data: {
                password: newPasswordInsert,
            },
        });
        if (insertNewPass) {
            await prismaClient_1.prisma.changepassword.create({
                data: {
                    userId: req.idUser,
                    createdAt: createdAt,
                },
            });
            return res.status(200).json({
                ok: true,
                message: "Contraseña actualizada correctamente.",
            });
        }
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.ChangePassword = ChangePassword;
const removeAccount = async (req, res) => {
    try {
        const { pass } = req.body;
        const slcUser = await prismaClient_1.prisma.users.findFirst({
            where: {
                idUser: Number(req.idUser),
            },
        });
        if (!slcUser) {
            return res.status(400).json({
                ok: false,
                message: "Usuario no encontrado con el id " + req.idUser,
            });
        }
        if (pass != "") {
            if (!slcUser.password) {
                return res.status(400).json({
                    ok: false,
                    message: "Esta cuenta fue creada con Google y no tiene contraseña. Intente desvincularla sin enviar contraseña.",
                });
            }
            const veryPass = await (0, index_service_1.verifyPassword)(pass, slcUser.password);
            if (!veryPass) {
                return res.status(400).json({
                    ok: false,
                    message: "La contraseña no coincide con la cuenta, intentelo de nuevo",
                });
            }
            await prismaClient_1.prisma.users.update({
                where: {
                    idUser: Number(req.idUser),
                },
                data: {
                    active: 0,
                },
            });
            return res.status(200).json({
                ok: true,
                message: "Cuenta eliminada correctamente",
            });
        }
        else {
            await prismaClient_1.prisma.users.update({
                where: {
                    idUser: Number(req.idUser),
                },
                data: {
                    active: 0,
                },
            });
            return res.status(200).json({
                ok: true,
                message: "Cuenta eliminada correctamente",
            });
        }
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.mesage,
        });
    }
};
exports.removeAccount = removeAccount;
//# sourceMappingURL=user.controller.js.map