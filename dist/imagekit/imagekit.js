"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPhotoUserAWS = exports.uploadPhotoUser = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const imagekit_1 = __importDefault(require("imagekit"));
const index_service_1 = require("../services/index.service");
dotenv_1.default.config({ path: ".env.prod" });
const imagekit = new imagekit_1.default({
    publicKey: process.env.IMAGEKIT_PUBLICKEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATEKEY || "",
    urlEndpoint: process.env.IMAGEKIT_URLENDPOINT || "",
});
const uploadPhotoUser = async (file, idUser) => {
    try {
        const response = await imagekit.upload({
            file: file.buffer,
            fileName: `${idUser}.jpg`,
            folder: `/users/${idUser}`,
        });
        return response.url;
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(`Error en guardar${error}`);
        return false;
    }
};
exports.uploadPhotoUser = uploadPhotoUser;
const getPhotoUserAWS = async (idUser) => {
    try {
        const files = await imagekit.listFiles({
            path: `/users/${idUser}`,
            sort: "DESC_CREATED",
            limit: 1,
        });
        if (files.length === 0)
            return null;
        // Construir la URL manualmente
        const imageUrl = `https://ik.imagekit.io/pcinboxkit/users/${idUser}/${files[0]?.name}`;
        return imageUrl;
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(`❌ Error al obtener última foto: ${error}`);
        return null;
    }
};
exports.getPhotoUserAWS = getPhotoUserAWS;
//# sourceMappingURL=imagekit.js.map