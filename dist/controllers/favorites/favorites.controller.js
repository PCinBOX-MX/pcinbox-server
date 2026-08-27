"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTotalFavorites = exports.removeFavorites = exports.addFavorites = exports.getFavoritosUser = void 0;
const prismaClient_1 = require("../../db/prismaClient");
require("../../config/loadEnv");
const index_service_1 = require("./../../services/index.service");
const getFavoritosUser = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search;
        const sort = req.query.sort;
        const skip = (page - 1) * limit;
        const whereClause = {
            userId: req.idUser,
            active: 1,
        };
        if (search) {
            whereClause.products = {
                OR: [
                    { name: { contains: search } },
                    { sku: { contains: search } },
                    { upc: { contains: search } },
                ],
            };
        }
        let orderByClause = { favoritedAt: "desc" };
        if (sort === "z_a") {
            orderByClause = { products: { name: "desc" } };
        }
        else if (sort === "a_z") {
            orderByClause = { products: { name: "asc" } };
        }
        else if (sort === "mayor_precio") {
            orderByClause = { products: { price: "desc" } };
        }
        else if (sort === "menor_precio") {
            orderByClause = { products: { price: "asc" } };
        }
        const totalCount = await prismaClient_1.prisma.favorites.count({ where: whereClause });
        const findFavoritesUser = await prismaClient_1.prisma.favorites.findMany({
            where: whereClause,
            orderBy: orderByClause,
            skip,
            take: limit,
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
                totalPages: Math.ceil(totalCount / limit),
                totalItems: totalCount,
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
        // Respuesta ligera: solo el favorito tocado + conteo (no toda la lista).
        const [favoriteRow, totalFavorites] = await Promise.all([
            prismaClient_1.prisma.favorites.findFirst({
                where: { idFavorite: findProductFavorite.idFavorite },
                include: {
                    products: true,
                },
            }),
            prismaClient_1.prisma.favorites.count({
                where: {
                    active: 1,
                    userId: req.idUser,
                },
            }),
        ]);
        if (!favoriteRow) {
            return res.status(500).json({
                ok: false,
                message: "No se pudo leer el favorito creado",
            });
        }
        const favorite = {
            productId: Number(favoriteRow.productId),
            idFavorite: Number(favoriteRow.idFavorite),
            userId: Number(favoriteRow.userId),
            image_url: favoriteRow.products.image_url,
            createdAt: favoriteRow.favoritedAt,
            products: {
                ...favoriteRow.products,
                idProduct: Number(favoriteRow.products.idProduct),
                categoryId: Number(favoriteRow.products.categoryId),
                providerId: Number(favoriteRow.products.providerId),
                marcaId: Number(favoriteRow.products.marcaId),
            },
        };
        return res.status(200).json({
            ok: true,
            message: "Producto agregado a favoritos correctamente",
            data: {
                favorite: (0, index_service_1.parseBigInts)(favorite),
                totalFavorites,
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
        const totalFavorites = await prismaClient_1.prisma.favorites.count({
            where: {
                active: 1,
                userId: Number(req.idUser),
            },
        });
        return rest.status(200).json({
            ok: true,
            message: `${findFavorite.products.name} eliminado de favoritos correctamente`,
            data: {
                productId: Number(idProduct),
                totalFavorites,
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