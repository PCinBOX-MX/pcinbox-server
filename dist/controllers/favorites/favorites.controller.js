"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTotalFavorites = exports.removeFavorites = exports.addFavorites = exports.getFavoritosUser = void 0;
const prismaClient_1 = require("../../db/prismaClient");
require("../../config/loadEnv");
const index_service_1 = require("./../../services/index.service");
const getFavoritosUser = async (req, res) => {
    try {
        const findFavoritesUser = await prismaClient_1.prisma.favorites.findMany({
            where: {
                userId: req.idUser,
                active: 1,
            },
            include: {
                products: {
                    include: {
                        reviews: true,
                    },
                },
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
                reviews: (0, index_service_1.parseBigInts)(item.products.reviews),
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
                products: {
                    include: {
                        reviews: true,
                    },
                },
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
                reviews: (0, index_service_1.parseBigInts)(item.products.reviews),
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
        const { idProduct } = req.body;
        let findFavorite = await prismaClient_1.prisma.favorites.findFirst({
            where: {
                productId: Number(idProduct),
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
                idFavorite: Number(findFavorite?.idFavorite),
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
                products: {
                    include: {
                        reviews: true,
                    },
                },
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
                reviews: (0, index_service_1.parseBigInts)(item.products.reviews),
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
const getTotalFavorites = async (req, res) => {
    try {
        if (!req.idUser) {
            return res.status(400).json({
                ok: false,
                message: "Id User no encontrado",
            });
        }
        let totalFavorites = await prismaClient_1.prisma.favorites.count({
            where: {
                active: 1,
                userId: Number(req.idUser),
            },
        });
        return res.status(200).json({
            ok: true,
            message: "OK!",
            data: {
                totalFavorites,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.mesage,
        });
    }
};
exports.getTotalFavorites = getTotalFavorites;
//# sourceMappingURL=favorites.controller.js.map