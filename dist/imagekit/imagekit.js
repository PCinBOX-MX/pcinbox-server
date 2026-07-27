"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePhotoUserAWS = exports.getPhotoUserAWS = exports.uploadPhotoUser = void 0;
exports.getUserPhotoEnvSegment = getUserPhotoEnvSegment;
exports.getUserPhotoFolder = getUserPhotoFolder;
require("../config/loadEnv");
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const axios_1 = __importDefault(require("axios"));
const imagekit_1 = __importDefault(require("imagekit"));
const index_service_1 = require("../services/index.service");
function getImageKitCredentials() {
    return {
        publicKey: process.env.IMAGEKIT_PUBLICKEY?.trim() || "",
        privateKey: process.env.IMAGEKIT_PRIVATEKEY?.trim() || "",
        urlEndpoint: process.env.IMAGEKIT_URLENDPOINT?.trim() || "",
    };
}
let imagekitClient = null;
function getImageKitClient() {
    if (imagekitClient)
        return imagekitClient;
    const { publicKey, privateKey, urlEndpoint } = getImageKitCredentials();
    if (!publicKey || !privateKey || !urlEndpoint) {
        (0, index_service_1.writeErrorLogs)("ImageKit no configurado: faltan IMAGEKIT_PUBLICKEY, IMAGEKIT_PRIVATEKEY o IMAGEKIT_URLENDPOINT");
        return null;
    }
    imagekitClient = new imagekit_1.default({
        publicKey,
        privateKey,
        urlEndpoint,
    });
    return imagekitClient;
}
function getLocalHttpsAgent() {
    if (process.env.NODE_ENV !== "local")
        return undefined;
    return new https_1.default.Agent({ rejectUnauthorized: false });
}
/** local | prod — prioriza IMAGEKIT_USER_ENV y trata dev como local. */
function getUserPhotoEnvSegment() {
    const explicit = process.env.IMAGEKIT_USER_ENV?.trim().toLowerCase();
    if (explicit === "local" || explicit === "prod") {
        return explicit;
    }
    const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
    if (!nodeEnv || nodeEnv === "local" || nodeEnv === "development") {
        return "local";
    }
    return "prod";
}
/** Ruta de carpeta: /users/{local|prod}/{idUser} */
function getUserPhotoFolder(idUser) {
    return `/users/${getUserPhotoEnvSegment()}/${idUser}`;
}
function buildPublicUrlFromFile(file) {
    if (file.url?.trim())
        return file.url.trim();
    const urlEndpoint = getImageKitCredentials().urlEndpoint.replace(/\/$/, "");
    if (!urlEndpoint)
        return null;
    if (file.filePath?.trim()) {
        const filePath = file.filePath.startsWith("/")
            ? file.filePath
            : `/${file.filePath}`;
        return `${urlEndpoint}${filePath}`;
    }
    return null;
}
function normalizeListedFiles(data) {
    if (!Array.isArray(data))
        return [];
    return data.filter((file) => {
        const item = file;
        return item.type !== "folder" && (item.url || item.filePath || item.name);
    });
}
/** Lista archivos de una carpeta; prueba variantes de path en ImageKit. */
async function listLatestUserPhoto(folderPath) {
    const { privateKey } = getImageKitCredentials();
    if (!privateKey)
        return [];
    const pathVariants = [
        folderPath,
        folderPath.endsWith("/") ? folderPath.slice(0, -1) : `${folderPath}/`,
    ];
    for (const folder of pathVariants) {
        try {
            const response = await axios_1.default.get("https://api.imagekit.io/v1/files/", {
                auth: { username: privateKey, password: "" },
                params: {
                    path: folder,
                    sort: "DESC_CREATED",
                    limit: 10,
                    fileType: "image",
                },
                httpsAgent: getLocalHttpsAgent(),
                timeout: 20000,
            });
            const files = normalizeListedFiles(response.data);
            if (files.length > 0)
                return files;
        }
        catch (error) {
            (0, index_service_1.writeErrorLogs)(`ImageKit listFiles (${folder}): ${error}`);
        }
    }
    return [];
}
function resolveLatestPhotoUrl(files) {
    const sorted = [...files].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    for (const file of sorted) {
        const url = buildPublicUrlFromFile(file);
        if (url)
            return url;
    }
    return null;
}
function buildUploadFileName(file) {
    const extension = path_1.default.extname(file.originalname || "") || ".jpg";
    const baseName = path_1.default
        .basename(file.originalname || "profile", extension)
        .replace(/[^\w.-]/g, "_")
        .slice(0, 80) || "profile";
    return `${baseName}${extension}`;
}
const uploadPhotoUser = async (file, idUser) => {
    try {
        const imagekit = getImageKitClient();
        if (!imagekit)
            return false;
        const folder = getUserPhotoFolder(idUser);
        const response = await imagekit.upload({
            file: file.buffer,
            fileName: buildUploadFileName(file),
            folder,
            useUniqueFileName: true,
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
    const envSegment = getUserPhotoEnvSegment();
    const envFolder = getUserPhotoFolder(idUser);
    try {
        const envFiles = await listLatestUserPhoto(envFolder);
        const envPhoto = resolveLatestPhotoUrl(envFiles);
        if (envPhoto)
            return envPhoto;
        const legacyFiles = await listLatestUserPhoto(`/users/${idUser}`);
        const legacyPhoto = resolveLatestPhotoUrl(legacyFiles);
        if (legacyPhoto)
            return legacyPhoto;
        (0, index_service_1.writeErrorLogs)(`Sin foto en ImageKit para idUser ${idUser} (${envSegment}: ${envFolder})`);
        return null;
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(`❌ Error al obtener última foto (idUser ${idUser}): ${error}`);
        return null;
    }
};
exports.getPhotoUserAWS = getPhotoUserAWS;
const deletePhotoUserAWS = async (idUser) => {
    const imagekit = getImageKitClient();
    if (!imagekit)
        return false;
    try {
        const envFolder = getUserPhotoFolder(idUser);
        const envFiles = await listLatestUserPhoto(envFolder);
        const fileIds = envFiles.filter(f => f.fileId).map(f => f.fileId);
        if (fileIds.length > 0) {
            await imagekit.bulkDeleteFiles(fileIds);
        }
        const legacyFolder = `/users/${idUser}`;
        const legacyFiles = await listLatestUserPhoto(legacyFolder);
        const legacyFileIds = legacyFiles.filter(f => f.fileId).map(f => f.fileId);
        if (legacyFileIds.length > 0) {
            await imagekit.bulkDeleteFiles(legacyFileIds);
        }
        return true;
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(`Error eliminando foto de idUser ${idUser}: ${error}`);
        return false;
    }
};
exports.deletePhotoUserAWS = deletePhotoUserAWS;
//# sourceMappingURL=imagekit.js.map