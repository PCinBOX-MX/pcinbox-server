import { prisma } from "../../db/prismaClient";
import { Response } from "express";
import dotenv from "dotenv";
import CustomRequestI from "./../../interfaces/customrequest.interface";

dotenv.config({ path: ".env.prod" });
export const getFavoritosUser = async (req: CustomRequestI, res: Response) => {
  try {
    const findFavoritesUser = await prisma.favorites.findMany({
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
    const { idFavorite } = req.body;

    let findFavorite = await prisma.favorites.findFirst({
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

    await prisma.favorites.update({
      where: {
        idFavorite: Number(idFavorite),
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
  } catch (error: any) {
    return rest.status(400).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};
