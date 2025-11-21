"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCotizacion = exports.removeAllCart = exports.removeProduct = exports.addProductFromStorage = exports.addProduct = exports.getCart = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const prismaClient_1 = require("../../db/prismaClient");
const luxon_1 = require("luxon");
const ejs_1 = __importDefault(require("ejs"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
const fechaLocal = luxon_1.DateTime.now().setZone("America/Mexico_City");
// const envFile = `.env.${process.env.NODE_ENV || "local"}`;
dotenv_1.default.config({ path: ".env.prod" });
const getCart = async (req, res) => {
    try {
        const cart = await prismaClient_1.prisma.carts.findFirst({
            where: {
                userId: Number(req?.idUser.toString()),
                status: "active",
            },
        });
        if (!cart) {
            return res.status(200).json({
                ok: true,
                data: [],
                message: "aun no ha creado su carrito de compras",
            });
        }
        const cartItems = await prismaClient_1.prisma.cartItems.findMany({
            where: {
                carId: cart.idCart,
                active: 1,
            },
            include: {
                products: true,
            },
        });
        const serializedCartItems = cartItems
            .map((item) => ({
            ...item.products,
            idProduct: item.products.idProduct.toString(),
            providerId: item.products.providerId.toString(),
            categoryId: item.products.categoryId.toString(),
            marcaId: item.products.marcaId.toString(),
            quantity: item.quantity?.toString(),
        }))
            .filter((product) => product.quantity != "0");
        return res.status(200).json({
            ok: true,
            data: serializedCartItems,
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
exports.getCart = getCart;
const addProduct = async (req, res) => {
    try {
        const { product, quantity, price, isDetails } = req.body;
        let cart = await prismaClient_1.prisma.carts.findFirst({
            where: {
                userId: Number(req?.idUser.toString()),
            },
        });
        if (!cart) {
            cart = await prismaClient_1.prisma.carts.create({
                data: {
                    userId: Number(req?.idUser.toString()),
                    status: "active",
                    createdAt: fechaLocal.toISO(),
                },
            });
        }
        const existingItem = await prismaClient_1.prisma.cartItems.findFirst({
            where: {
                carId: Number(cart.idCart),
                productId: Number(product.idProduct),
                active: 1,
            },
        });
        if (existingItem) {
            // 2. Si ya existe, actualizar la cantidad sumando
            await prismaClient_1.prisma.cartItems.update({
                where: {
                    idCartItem: Number(existingItem.idCartItem),
                },
                data: {
                    quantity: existingItem.quantity == null
                        ? 1
                        : isDetails
                            ? Number(quantity)
                            : Number(existingItem.quantity) + Number(quantity),
                },
            });
        }
        else {
            // 3. Si no existe, crear nuevo item
            await prismaClient_1.prisma.cartItems.create({
                data: {
                    carId: Number(cart.idCart),
                    productId: Number(product.idProduct),
                    quantity: Number(quantity),
                },
            });
        }
        return res.status(200).json({
            ok: true,
            message: "Producto agregado",
        });
    }
    catch (error) {
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
        let cart = await prismaClient_1.prisma.carts.findFirst({
            where: {
                userId: Number(req?.idUser.toString()),
            },
        });
        if (!cart) {
            cart = await prismaClient_1.prisma.carts.create({
                data: {
                    userId: Number(req?.idUser.toString()),
                    status: "active",
                    createdAt: fechaLocal.toISO(),
                },
            });
        }
        await Promise.all(dataCart.map(async (item) => {
            const existingItem = await prismaClient_1.prisma.cartItems.findFirst({
                where: {
                    carId: Number(cart.idCart),
                    productId: Number(item.idProduct),
                    active: 1,
                },
            });
            if (existingItem) {
                await prismaClient_1.prisma.cartItems.update({
                    where: {
                        idCartItem: existingItem.idCartItem,
                    },
                    data: {
                        quantity: existingItem.quantity + Number(item.quantity),
                    },
                });
            }
            else {
                await prismaClient_1.prisma.cartItems.create({
                    data: {
                        carId: Number(cart.idCart),
                        productId: Number(item.idProduct),
                        quantity: Number(item.quantity),
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
        const { idProduct } = req.body;
        const slcCart = await prismaClient_1.prisma.carts.findFirst({
            where: {
                userId: Number(req.idUser.toString()),
            },
        });
        if (!slcCart) {
            return res
                .status(400)
                .json({ ok: false, message: "Carrito no encontrado" });
        }
        await prismaClient_1.prisma.cartItems.updateMany({
            where: {
                carId: slcCart.idCart,
                productId: Number(idProduct),
            },
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
        const { dataCart } = req.body;
        const slcUser = await prismaClient_1.prisma.users.findFirst({
            where: {
                idUser: Number(req.idUser.toString()),
            },
            select: {
                email: true,
                idUser: true,
            },
        });
        if (!slcUser) {
            return res
                .status(400)
                .json({ ok: false, message: "Usuario no encontrado" });
        }
        const slcCart = await prismaClient_1.prisma.carts.findFirst({
            where: {
                userId: slcUser.idUser,
            },
        });
        if (!slcCart) {
            return res
                .status(400)
                .json({ ok: false, message: "Carrito no encontrado" });
        }
        await prismaClient_1.prisma.cartItems.updateMany({
            where: {
                carId: slcCart.idCart,
                productId: { in: dataCart.map((item) => Number(item.idProduct)) },
            },
            data: {
                active: 0,
                quantity: 0,
            },
        });
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
        const pdfShiftApiKey = process.env.PDFSHIFT_API_KEY; // Guarda tu API key en las variables de entorno de Vercel
        if (!pdfShiftApiKey) {
            return res.status(500).json({
                ok: false,
                message: "PDFShift API Key no configurada.",
            });
        }
        const pdfResponse = await axios_1.default.post("https://api.pdfshift.io/v3/convert/pdf", {
            source: plantillaHtml,
            // Otras opciones según la API, como margin, landscape, etc.
            // Puedes pasar el HTML directamente o una URL si el HTML ya está accesible públicamente
        }, {
            headers: {
                Authorization: `Basic ${Buffer.from(`:${pdfShiftApiKey}`).toString("base64")}`,
                "Content-Type": "application/json",
            },
            responseType: "arraybuffer", // Para recibir el PDF como un buffer de bytes
        });
        // 3. Envía el PDF recibido al cliente
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="cotizacion.pdf"; charset=utf-8');
        res.send(Buffer.from(pdfResponse.data)); // pdfResponse.data contiene el buffer del PDF
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
//# sourceMappingURL=cart.controller.js.map