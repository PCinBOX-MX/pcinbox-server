"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
require("../config/loadEnv");
const connectionDb = async () => {
    try {
        const pool = promise_1.default.createPool(process.env.DATABASE_URL || "");
        const connection = await pool.getConnection();
        connection.release();
    }
    catch (err) {
        throw err;
    }
};
connectionDb();
//# sourceMappingURL=index.js.map