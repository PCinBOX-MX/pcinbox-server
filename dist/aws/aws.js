"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPhotoUserAWS = exports.uploadPhotoUser = void 0;
const dotenv_flow_1 = __importDefault(require("dotenv-flow"));
const client_s3_1 = require("@aws-sdk/client-s3");
const index_service_1 = require("../services/index.service");
//const envFile = `.env.${process.env.NODE_ENV || "local"}`;
dotenv_flow_1.default.config();
const s3 = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || "",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
});
const bucketName = process.env.S3_BUCKET;
const uploadPhotoUser = async (routeFileName, mimetype, content) => {
    if (!bucketName) {
        throw new Error("No se ha definido el nombre del bucket en .env");
    }
    try {
        const command = new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: routeFileName,
            Body: content,
            ContentType: mimetype,
        });
        await s3.send(command);
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(`Error en guardar foto en s3${error}`);
    }
};
exports.uploadPhotoUser = uploadPhotoUser;
const getPhotoUserAWS = async (decoded) => {
    try {
        const command = new client_s3_1.ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: `${decoded.idUser}/`,
        });
        const result = await s3.send(command);
        return result;
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(`Error al obtener la foto desde s3 ${error}`);
    }
};
exports.getPhotoUserAWS = getPhotoUserAWS;
//# sourceMappingURL=aws.js.map