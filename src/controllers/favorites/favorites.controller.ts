import { prisma } from "../../db/prismaClient";
import { Response } from "express";
import "../../config/loadEnv";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { parseBigInts } from "./../../services/index.service";

export const getFavoritosUser = async (req: CustomRequestI, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const sort = req.query.sort as string;

    const skip = (page - 1) * limit;

    const whereClause: any = {
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

    let orderByClause: any = { favoritedAt: "desc" };
    if (sort === "z_a") {
      orderByClause = { products: { name: "desc" } };
    } else if (sort === "a_z") {
      orderByClause = { products: { name: "asc" } };
    } else if (sort === "mayor_precio") {
      orderByClause = { products: { price: "desc" } };
    } else if (sort === "menor_precio") {
      orderByClause = { products: { price: "asc" } };
    }

    const totalCount = await prisma.favorites.count({ where: whereClause });

    const findFavoritesUser = await prisma.favorites.findMany({
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
        reviews: parseBigInts(item.products.reviews),
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
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const addFavorites = async (req: CustomRequestI, res: Response) => {
  try {
    const { idProduct } = req.body;

    let convertIdProduct = Number(idProduct);
    let findProductFavorite = null;

    findProductFavorite = await prisma.favorites.findFirst({
      where: {
        userId: req.idUser,
        productId: convertIdProduct,
        active: 1,
      },
    });

    if (!findProductFavorite) {
      findProductFavorite = await prisma.favorites.create({
        data: {
          productId: convertIdProduct,
          userId: req.idUser,
        },
      });
    } else {
      await prisma.favorites.update({
        where: {
          idFavorite: findProductFavorite.idFavorite,
        },
        data: {
          active: 1,
          favoritedAt: new Date(),
        },
      });
    }

    let dataFinal = await prisma.favorites.findMany({
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
        reviews: parseBigInts(item.products.reviews),
      },
    }));

    return res.status(200).json({
      ok: true,
      message: "Producto agregado a favoritos correctamente",
      data: {
        data: serializedFavorites,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const removeFavorites = async (req: CustomRequestI, rest: Response) => {
  try {
    const { idProduct } = req.body;

    let findFavorite = await prisma.favorites.findFirst({
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

    await prisma.favorites.update({
      where: {
        idFavorite: Number(findFavorite?.idFavorite),
        userId: Number(req.idUser),
      },
      data: {
        active: 0,
      },
    });

    let listFavoritesByUser = await prisma.favorites.findMany({
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
        reviews: parseBigInts(item.products.reviews),
      },
    }));

    return rest.status(200).json({
      ok: true,
      message: `${findFavorite.products.name} eliminado de favoritos correctamente`,
      data: {
        data: dataFinal,
      },
    });
  } catch (error: any) {
    return rest.status(400).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const getTotalFavorites = async (req: CustomRequestI, res: Response) => {
  try {
    if (!req.idUser) {
      return res.status(400).json({
        ok: false,
        message: "Id User no encontrado",
      });
    }

    let totalFavorites = await prisma.favorites.count({
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
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.mesage,
    });
  }
};
