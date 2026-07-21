"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeQuantity = exports.changeSucursal = exports.generateCotizacion = exports.removeAllCart = exports.removeProduct = exports.addProductFromStorage = exports.addProduct = exports.getCart = void 0;
require("../../config/loadEnv");
const prismaClient_1 = require("../../db/prismaClient");
const luxon_1 = require("luxon");
const index_service_1 = require("../../services/index.service");
const cart_service_1 = require("../../services/cart.service");
const techsmart_branches_1 = require("../../constants/techsmart-branches");
const ejs_1 = __importDefault(require("ejs"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
const fechaLocal = luxon_1.DateTime.now().setZone("America/Mexico_City");
function serializeCartItems(cartItems) {
    return cartItems
        .map((item) => ({
        ...item.products,
        storeId: item.storeId,
        idProduct: String(item.products.idProduct),
        providerId: item.products.providerId
            ? String(item.products.providerId)
            : null,
        categoryId: item.products.categoryId
            ? String(item.products.categoryId)
            : null,
        marcaId: item.products.marcaId ? String(item.products.marcaId) : null,
        quantity: item.quantity != null ? String(item.quantity) : null,
    }))
        .filter((product) => product.quantity != "0");
}
const getCart = async (req, res) => {
    try {
        const userId = Number(req?.idUser.toString());
        const cart = await (0, cart_service_1.getOrCreateActiveCart)(userId);
        await (0, cart_service_1.consolidateActiveCartItems)(userId, cart.idCart);
        const cartItems = await prismaClient_1.prisma.cartItems.findMany({
            where: {
                carId: cart.idCart,
                active: 1,
            },
            include: {
                products: {
                    include: {
                        product_stock: {
                            include: {
                                branches: true,
                            },
                        },
                    },
                },
            },
        });
        return res.status(200).json({
            ok: true,
            data: (0, index_service_1.parseBigInts)(serializeCartItems(cartItems)),
        });
    }
    catch (error) {
        console.log(error.message);
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.getCart = getCart;
const addProduct = async (req, res) => {
    try {
        const { idProduct, quantity, storeId, quantityMode = "increment" } = req.body;
        const userId = Number(req?.idUser.toString());
        const normalizedStoreId = (0, cart_service_1.normalizeStoreId)(storeId);
        const cart = await (0, cart_service_1.getOrCreateActiveCart)(userId);
        await (0, cart_service_1.consolidateActiveCartItems)(userId, cart.idCart);
        await (0, cart_service_1.mergeDuplicateCartLines)(cart.idCart, Number(idProduct), normalizedStoreId);
        const existingItem = await (0, cart_service_1.findActiveCartItem)(cart.idCart, Number(idProduct), normalizedStoreId);
        const qtyToAdd = Number(quantity) || 0;
        if (qtyToAdd <= 0) {
            return res.status(400).json({
                ok: false,
                message: "Cantidad inválida",
            });
        }
        const stockInfo = await (0, cart_service_1.resolveAvailableStock)(Number(idProduct), normalizedStoreId);
        if (!stockInfo.found) {
            return res.status(404).json({
                ok: false,
                message: "Producto no encontrado",
            });
        }
        if (stockInfo.stock <= 0) {
            return res.status(400).json({
                ok: false,
                message: "Este producto no tiene stock disponible",
            });
        }
        const productRecord = await prismaClient_1.prisma.products.findFirst({
            where: { idProduct: BigInt(idProduct), active: 1 },
            select: { providerId: true },
        });
        const techSmartBranchError = await (0, techsmart_branches_1.getTechSmartBranchValidationError)(productRecord?.providerId != null
            ? Number(productRecord.providerId)
            : null, normalizedStoreId);
        if (techSmartBranchError) {
            return res.status(400).json({
                ok: false,
                message: techSmartBranchError,
            });
        }
        const previousQuantity = existingItem
            ? Number(existingItem.quantity ?? 0)
            : 0;
        let nextQuantity;
        let quantityAdded;
        if (quantityMode === "set") {
            nextQuantity = qtyToAdd;
            if (nextQuantity < 1) {
                return res.status(400).json({
                    ok: false,
                    message: "La cantidad mínima es 1",
                });
            }
            if (nextQuantity > stockInfo.stock) {
                return res.status(400).json({
                    ok: false,
                    message: `Solo hay ${stockInfo.stock} unidad${stockInfo.stock === 1 ? "" : "es"} disponible${stockInfo.stock === 1 ? "" : "s"}`,
                    data: { maxStock: stockInfo.stock, quantity: previousQuantity },
                });
            }
            quantityAdded = nextQuantity - previousQuantity;
            if (quantityAdded === 0) {
                return res.status(200).json({
                    ok: true,
                    message: "Sin cambios en el carrito",
                    data: {
                        quantity: previousQuantity,
                        previousQuantity,
                        quantityAdded: 0,
                        maxStock: stockInfo.stock,
                        stockLimitReached: previousQuantity >= stockInfo.stock,
                    },
                });
            }
        }
        else {
            nextQuantity = previousQuantity + qtyToAdd;
            if (nextQuantity > stockInfo.stock) {
                nextQuantity = stockInfo.stock;
            }
            quantityAdded = nextQuantity - previousQuantity;
            if (quantityAdded <= 0) {
                return res.status(200).json({
                    ok: true,
                    message: `Ya tienes ${previousQuantity} de ${stockInfo.stock} unidades disponibles`,
                    data: {
                        quantity: previousQuantity,
                        previousQuantity,
                        quantityAdded: 0,
                        maxStock: stockInfo.stock,
                        stockLimitReached: true,
                        alreadyAtMax: true,
                    },
                });
            }
        }
        if (existingItem) {
            await prismaClient_1.prisma.cartItems.update({
                where: {
                    idCartItem: Number(existingItem.idCartItem),
                },
                data: {
                    storeId: normalizedStoreId,
                    quantity: nextQuantity,
                },
            });
        }
        else {
            await prismaClient_1.prisma.cartItems.create({
                data: {
                    carId: Number(cart.idCart),
                    productId: Number(idProduct),
                    quantity: nextQuantity,
                    storeId: normalizedStoreId,
                    active: 1,
                },
            });
        }
        return res.status(200).json({
            ok: true,
            message: "Producto agregado correctamente",
            data: {
                quantity: nextQuantity,
                previousQuantity,
                quantityAdded,
                maxStock: stockInfo.stock,
                stockLimitReached: nextQuantity >= stockInfo.stock,
            },
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            ok: false,
            message: error.message,
        });
    }
};
exports.addProduct = addProduct;
const addProductFromStorage = async (req, res) => {
    try {
        const { dataCart } = req.body;
        const userId = Number(req?.idUser.toString());
        const cart = await (0, cart_service_1.getOrCreateActiveCart)(userId);
        for (const item of dataCart ?? []) {
            const normalizedStoreId = (0, cart_service_1.normalizeStoreId)(item.storeId);
            const productRecord = await prismaClient_1.prisma.products.findFirst({
                where: { idProduct: BigInt(item.idProduct), active: 1 },
                select: { providerId: true },
            });
            const techSmartBranchError = await (0, techsmart_branches_1.getTechSmartBranchValidationError)(productRecord?.providerId != null
                ? Number(productRecord.providerId)
                : null, normalizedStoreId);
            if (techSmartBranchError) {
                return res.status(400).json({
                    ok: false,
                    message: techSmartBranchError,
                });
            }
        }
        await Promise.all(dataCart.map(async (item) => {
            const normalizedStoreId = (0, cart_service_1.normalizeStoreId)(item.storeId);
            const existingItem = await (0, cart_service_1.findActiveCartItem)(cart.idCart, Number(item.idProduct), normalizedStoreId);
            if (existingItem) {
                await prismaClient_1.prisma.cartItems.update({
                    where: {
                        idCartItem: existingItem.idCartItem,
                    },
                    data: {
                        quantity: Math.max(Number(existingItem.quantity ?? 0), Number(item.quantity)),
                        storeId: normalizedStoreId,
                    },
                });
            }
            else {
                await prismaClient_1.prisma.cartItems.create({
                    data: {
                        carId: Number(cart.idCart),
                        productId: Number(item.idProduct),
                        quantity: Number(item.quantity),
                        storeId: normalizedStoreId,
                        active: 1,
                    },
                });
            }
        }));
        return res.status(200).json({
            ok: true,
            message: "insertados",
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.addProductFromStorage = addProductFromStorage;
const removeProduct = async (req, res) => {
    try {
        const { idProduct, storeId } = req.body;
        const userId = Number(req.idUser.toString());
        const normalizedStoreId = (0, cart_service_1.normalizeStoreId)(storeId);
        const cart = await (0, cart_service_1.getOrCreateActiveCart)(userId);
        const whereClause = {
            carId: cart.idCart,
            productId: Number(idProduct),
            active: 1,
        };
        if (normalizedStoreId === null) {
            whereClause.storeId = null;
        }
        else {
            whereClause.storeId = normalizedStoreId;
        }
        await prismaClient_1.prisma.cartItems.updateMany({
            where: whereClause,
            data: {
                active: 0,
                quantity: 0,
            },
        });
        return res.status(200).json({
            ok: true,
            message: "Producto removido correctamente",
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.removeProduct = removeProduct;
const removeAllCart = async (req, res) => {
    try {
        const userId = Number(req.idUser.toString());
        const cart = await (0, cart_service_1.getOrCreateActiveCart)(userId);
        await (0, cart_service_1.deactivateAllActiveCartItems)(cart.idCart);
        return res.status(200).json({
            ok: true,
            message: "Carrito borrado correctamente",
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.removeAllCart = removeAllCart;
const generateCotizacion = async (req, res) => {
    try {
        const { dataCart, name, lastname, email } = req.body;
        const now = new Date();
        const cotizacionNumero = `COT-${now.getFullYear()}${(now.getMonth() + 1)
            .toString()
            .padStart(2, "0")}${now
            .getDate()
            .toString()
            .padStart(2, "0")}-${now.getTime()}`;
        const pathHtml = path_1.default.resolve(__dirname, "../../views/cotizacionHtml.ejs");
        if (!fs_1.default.existsSync(pathHtml)) {
            return res.status(400).json({
                ok: false,
                message: "No existe la plantilla cotizacionHtml.ejs " + pathHtml,
            });
        }
        const subtotal = dataCart.reduce((acc, item) => acc + item.price * item.quantity, 0);
        const plantillaHtml = await ejs_1.default.renderFile(pathHtml, {
            idOrder: cotizacionNumero,
            dateCreate: now.toLocaleDateString(),
            name,
            lastname: lastname || "",
            email,
            total: subtotal.toLocaleString("es-MX", {
                style: "currency",
                currency: "MXN",
            }),
            dataCart,
        });
        const pdfShiftApiKey = process.env.PDFSHIFT_API_KEY;
        if (!pdfShiftApiKey) {
            return res.status(500).json({
                ok: false,
                message: "PDFShift API Key no configurada.",
            });
        }
        const pdfResponse = await axios_1.default.post("https://api.pdfshift.io/v3/convert/pdf", {
            source: plantillaHtml,
        }, {
            headers: {
                Authorization: `Basic ${Buffer.from(`:${pdfShiftApiKey}`).toString("base64")}`,
                "Content-Type": "application/json",
            },
            responseType: "arraybuffer",
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="cotizacion.pdf"; charset=utf-8');
        res.send(Buffer.from(pdfResponse.data));
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.generateCotizacion = generateCotizacion;
const changeSucursal = async (req, res) => {
    try {
        const { idProduct, storeId } = req.body;
        if (!idProduct || !storeId) {
            return res
                .status(400)
                .json({ ok: false, message: "Faltan campos por enviar" });
        }
        const userId = Number(req.idUser);
        const cart = await (0, cart_service_1.getOrCreateActiveCart)(userId);
        const findCartItems = await prismaClient_1.prisma.cartItems.findFirst({
            where: {
                carId: Number(cart.idCart),
                active: 1,
                productId: Number(idProduct),
            },
        });
        if (!findCartItems) {
            return res.status(400).json({
                ok: false,
                message: "Productos no encontrados en el carrito de compras",
            });
        }
        await prismaClient_1.prisma.cartItems.update({
            where: {
                idCartItem: Number(findCartItems.idCartItem),
            },
            data: {
                storeId: Number(storeId),
            },
        });
        return res.status(200).json({
            ok: true,
            message: "Sucursal actualizada correctamente",
            data: {
                data: {
                    idCartItem: Number(findCartItems.idCartItem),
                    storeId: Number(storeId),
                },
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.changeSucursal = changeSucursal;
const changeQuantity = async (req, res) => {
    req.body.quantityMode = "set";
    return (0, exports.addProduct)(req, res);
};
exports.changeQuantity = changeQuantity;
//# sourceMappingURL=cart.controller.js.map