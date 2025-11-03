"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProducts = void 0;
const prismaClient_1 = require("../../db/prismaClient");
// import { verify } from "jsonwebtoken";
// import dotenv from 'dotenv';
// dotenv.config({path: ".env.local"});
const getProducts = async (req, res) => {
  try {
    // let token = null;
    // if (req.cookies?.token) {
    //   token = req.cookies.token;
    // }
    // if (!token) {
    //   return res.status(401).json({
    //     ok: false,
    //     message: "Token no proporcionado o expirado",
    //   });
    // }
    // const decoded: any = verify(token, process.env.KEY_JWT || "");
    // if (!decoded.idUser && !decoded.email) {
    //   return res.status(401).json({
    //     ok: false,
    //     message: "Token no proporcionado o expirado desde cart",
    //   });
    // }
    // let findUser = await prisma.users.findFirst({
    //   where: {
    //     email: decoded.email,
    //   },
    //   select: {
    //     idUser: true,
    //   },
    // });
    const products = await prismaClient_1.prisma.products.findMany();
    // console.log("find user");
    // console.log(findUser);
    return res.status(200).json({
      ok: true,
      data:
        products.length > 0
          ? products.map((product) => {
              return {
                ...product,
                idProduct: product.idProduct.toString(),
                categoryId: product.categoryId.toString(),
                providerId: product.providerId.toString(),
              };
            })
          : [],
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      data: error.message,
    });
  }
};
exports.getProducts = getProducts;
//# sourceMappingURL=product.controller.js.map
