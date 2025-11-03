"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatter = exports.writeErrorLogs = exports.signPayload = exports.verifyPassword = exports.hasPassword = void 0;
exports.generateResetToken = generateResetToken;
exports.parseBigInts = parseBigInts;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const nanoid_1 = require("nanoid");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: ".env.prod" });
const hasPassword = async (password) => {
    const saltRounds = 10;
    const hashedPassword = await bcrypt_1.default.hash(password, saltRounds);
    return hashedPassword;
};
exports.hasPassword = hasPassword;
const verifyPassword = async (password, hashed) => {
    return bcrypt_1.default.compare(password, hashed);
};
exports.verifyPassword = verifyPassword;
const signPayload = (obj, expiresIn) => {
    return jsonwebtoken_1.default.sign(obj, process.env.KEY_JWT || "", { expiresIn: expiresIn });
};
exports.signPayload = signPayload;
function generateResetToken() {
    return (0, nanoid_1.nanoid)(100);
}
const writeErrorLogs = (error) => {
    const currentDate = new Date().toLocaleString();
    const fileLogs = path_1.default.join(__dirname, "logs.txt");
    const logEntry = `[${currentDate}] ${error}\n`;
    fs_1.default.appendFile(fileLogs, logEntry, (err) => {
        if (err) {
            console.error("Error al escribir en el archivo de log:", err);
        }
    });
};
exports.writeErrorLogs = writeErrorLogs;
function parseBigInts(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => typeof value === "bigint" ? Number(value) : value));
}
exports.formatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
});
//# sourceMappingURL=index.service.js.map