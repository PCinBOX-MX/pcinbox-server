"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cwd = process.cwd();
function loadEnvFile(fileName) {
    const filePath = path_1.default.resolve(cwd, fileName);
    if (!fs_1.default.existsSync(filePath))
        return;
    dotenv_1.default.config({
        path: filePath,
        override: false,
    });
}
// Local primero; prod completa variables faltantes (sin pisar las ya definidas).
loadEnvFile(".env.local");
loadEnvFile(".env.prod");
//# sourceMappingURL=loadEnv.js.map