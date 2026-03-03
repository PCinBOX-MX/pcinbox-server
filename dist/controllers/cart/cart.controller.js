"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeSucursal = exports.generateCotizacion = exports.removeAllCart = exports.removeProduct = exports.addProductFromStorage = exports.addProduct = exports.getCart = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const prismaClient_1 = require("../../db/prismaClient");
const luxon_1 = require("luxon");
const index_service_1 = require("../../services/index.service");
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
                message: "Aun no ha creado su carrito de compras",
            });
        }
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
        const serializedCartItems = cartItems
            .map((item) => {
            // const cartItem = item.carts?.cartItems?.find(
            //   (cartProp) => Number(cartProp?.carId) === Number(item.carId),
            // );
            return {
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
            };
        })
            .filter((product) => product.quantity != "0");
        return res.status(200).json({
            ok: true,
            data: (0, index_service_1.parseBigInts)(serializedCartItems),
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
        const { idProduct, quantity, isDetails, storeId } = req.body;
        // 1️⃣ Buscar carrito activo del usuario
        let cart = await prismaClient_1.prisma.carts.findFirst({
            where: {
                userId: Number(req?.idUser.toString()),
                status: "active",
            },
        });
        // 2️⃣ Crear carrito si no existe
        if (!cart) {
            cart = await prismaClient_1.prisma.carts.create({
                data: {
                    userId: Number(req?.idUser.toString()),
                    status: "active",
                    createdAt: new Date().toISOString(),
                },
            });
        }
        // 3️⃣ Buscar item en carrito
        const existingItem = await prismaClient_1.prisma.cartItems.findFirst({
            where: {
                carId: Number(cart.idCart),
                productId: Number(idProduct),
                storeId: Number(storeId),
                active: 1,
            },
        });
        if (existingItem) {
            // 🔹 Si ya existe, actualizamos la cantidad directamente con la enviada
            await prismaClient_1.prisma.cartItems.update({
                where: {
                    idCartItem: Number(existingItem.idCartItem),
                },
                data: {
                    storeId: storeId ? Number(storeId) : null,
                    quantity: Number(quantity), // usamos la cantidad que envía React
                },
            });
        }
        else {
            // 🔹 Si no existe, creamos un nuevo item
            await prismaClient_1.prisma.cartItems.create({
                data: {
                    carId: Number(cart.idCart),
                    productId: Number(idProduct),
                    quantity: Number(quantity),
                    storeId: storeId ? Number(storeId) : null,
                },
            });
        }
        return res.status(200).json({
            ok: true,
            message: "Producto agregado correctamente",
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
const changeSucursal = async (req, res) => {
    try {
        const { idProduct, storeId } = req.body;
        if (!idProduct || !storeId) {
            return res
                .status(400)
                .json({ ok: false, message: "Faltan campos por enviar" });
        }
        const findCart = await prismaClient_1.prisma.carts.findFirst({
            where: {
                userId: Number(req.idUser),
                status: "active",
            },
        });
        if (!findCart) {
            return res
                .status(400)
                .json({ ok: false, message: "No se encontro su carrito de compras" });
        }
        const findCartItems = await prismaClient_1.prisma.cartItems.findFirst({
            where: {
                carId: Number(findCart.idCart),
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
            ok: false,
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
//# sourceMappingURL=cart.controller.js.map