"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAddressWithPostalCode = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config({ path: ".env.prod" });
const apiGeoNames = axios_1.default.create({
    baseURL: `http://api.geonames.org`,
    params: {
        username: process.env.KEY_GEONAMES,
    },
});
const getAddressWithPostalCode = async (req, res) => {
    try {
        const { postalCode } = req.body;
        if (!postalCode) {
            return res.status(400).json({ ok: false, message: "Faltan campos" });
        }
        const response = await apiGeoNames.get(`/postalCodeLookupJSON?postalcode=${postalCode}&country=MX`);
        if (response.status == 200) {
            const data = await response.data;
            return res.status(200).json({
                ok: true,
                message: "OK!",
                data: data,
            });
        }
    }
    catch (error) {
        return res.status(500).json({
            ok: true,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.getAddressWithPostalCode = getAddressWithPostalCode;
//# sourceMappingURL=geonames.controller.js.map