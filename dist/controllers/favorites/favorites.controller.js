"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeFavorites = exports.addFavorites = exports.getFavoritosUser = void 0;
const prismaClient_1 = require("../../db/prismaClient");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: ".env.prod" });
const getFavoritosUser = async (req, res) => {
    try {
        const findFavoritesUser = await prismaClient_1.prisma.favorites.findMany({
            where: {
                userId: req.idUser,
                active: 1,
            },
            include: {
                products: true,
            },
        });
        const serializedFavorites = findFavoritesUser.map((item) => ({
            productId: Number(item.productId),
            idFavorite: Number(item.idFavorite),
            userId: Number(item.userId),
            image_url: item.products.image_url,
            createdAt: item.favoritedAt,
            products: {
                ...item.products,
                idProduct: Number(item.products.idProduct),
                categoryId: Number(item.products.categoryId),
                providerId: Number(item.products.providerId),
                marcaId: Number(item.products.marcaId),
            },
        }));
        return res.status(200).json({
            ok: true,
            message: "Data de favoritos por usuario en especifico",
            data: {
                data: serializedFavorites,
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
exports.getFavoritosUser = getFavoritosUser;
const addFavorites = async (req, res) => {
    try {
        const { idProduct } = req.body;
        let convertIdProduct = Number(idProduct);
        let findProductFavorite = null;
        findProductFavorite = await prismaClient_1.prisma.favorites.findFirst({
            where: {
                userId: req.idUser,
                productId: convertIdProduct,
                active: 1,
            },
        });
        if (!findProductFavorite) {
            findProductFavorite = await prismaClient_1.prisma.favorites.create({
                data: {
                    productId: convertIdProduct,
                    userId: req.idUser,
                },
            });
        }
        else {
            await prismaClient_1.prisma.favorites.update({
                where: {
                    idFavorite: findProductFavorite.idFavorite,
                },
                data: {
                    active: 1,
                    favoritedAt: new Date(),
                },
            });
        }
        let dataFinal = await prismaClient_1.prisma.favorites.findMany({
            where: {
                active: 1,
                userId: req.idUser,
            },
            include: {
                products: true,
            },
        });
        const serializedFavorites = dataFinal.map((item) => ({
            productId: Number(item.productId),
            idFavorite: Number(item.idFavorite),
            userId: Number(item.userId),
            image_url: item.products.image_url,
            createdAt: item.favoritedAt,
            products: {
                ...item.products,
                idProduct: Number(item.products.idProduct),
                categoryId: Number(item.products.categoryId),
                providerId: Number(item.products.providerId),
                marcaId: Number(item.products.marcaId),
            },
        }));
        return res.status(200).json({
            ok: true,
            message: "Producto agregado a favoritos correctamente",
            data: {
                data: serializedFavorites,
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
exports.addFavorites = addFavorites;
const removeFavorites = async (req, rest) => {
    try {
        const { idFavorite } = req.body;
        let findFavorite = await prismaClient_1.prisma.favorites.findFirst({
            where: {
                idFavorite: Number(idFavorite),
                userId: Number(req.idUser),
                active: 1,
            },
            include: {
                products: true,
            },
        });
        if (!findFavorite) {
            return rest.status(400).json({
                ok: false,
                message: "Articulo en favoritos no encontrado",
            });
        }
        await prismaClient_1.prisma.favorites.update({
            where: {
                idFavorite: Number(idFavorite),
                userId: Number(req.idUser),
            },
            data: {
                active: 0,
            },
        });
        let listFavoritesByUser = await prismaClient_1.prisma.favorites.findMany({
            where: {
                active: 1,
                userId: Number(req.idUser),
            },
            include: {
                products: true,
            },
        });
        let dataFinal = listFavoritesByUser.map((item) => ({
            productId: Number(item.productId),
            idFavorite: Number(item.idFavorite),
            userId: Number(item.userId),
            image_url: item.products.image_url,
            createdAt: item.favoritedAt,
            products: {
                ...item.products,
                idProduct: Number(item.products.idProduct),
                categoryId: Number(item.products.categoryId),
                providerId: Number(item.products.providerId),
                marcaId: Number(item.products.marcaId),
            },
        }));
        return rest.status(200).json({
            ok: true,
            message: `${findFavorite.products.name} eliminado de favoritos correctamente`,
            data: {
                data: dataFinal,
            },
        });
    }
    catch (error) {
        return rest.status(400).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.removeFavorites = removeFavorites;
//# sourceMappingURL=favorites.controller.js.map