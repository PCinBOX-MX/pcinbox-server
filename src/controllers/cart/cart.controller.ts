import { Response } from "express";

import dotenv from "dotenv";

import { prisma } from "../../db/prismaClient";

import { DateTime } from "luxon";

import CustomRequestI from "./../../interfaces/customrequest.interface";

import { parseBigInts } from "../../services/index.service";

import {

  consolidateActiveCartItems,

  deactivateAllActiveCartItems,

  findActiveCartItem,

  getOrCreateActiveCart,

  normalizeStoreId,

} from "../../services/cart.service";



import ejs from "ejs";

import path from "path";

import fs from "fs";

import axios from "axios";



const fechaLocal = DateTime.now().setZone("America/Mexico_City");

dotenv.config({ path: ".env.prod" });



function serializeCartItems(cartItems: any[]) {

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

    .filter((product: any) => product.quantity != "0");

}



export const getCart = async (req: CustomRequestI, res: Response) => {

  try {

    const userId = Number(req?.idUser.toString());

    const cart = await getOrCreateActiveCart(userId);



    await consolidateActiveCartItems(userId, cart.idCart);



    const cartItems = await prisma.cartItems.findMany({

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

      data: parseBigInts(serializeCartItems(cartItems)),

    });

  } catch (error: any) {

    console.log(error.message);

    return res.status(500).json({

      ok: false,

      message: "Error interno del servidor",

      error: error.message,

    });

  }

};



export const addProduct = async (req: CustomRequestI, res: Response) => {

  try {

    const { idProduct, quantity, storeId } = req.body;

    const userId = Number(req?.idUser.toString());

    const normalizedStoreId = normalizeStoreId(storeId);



    const cart = await getOrCreateActiveCart(userId);



    const existingItem = await findActiveCartItem(

      cart.idCart,

      Number(idProduct),

      normalizedStoreId,

    );



    if (existingItem) {

      await prisma.cartItems.update({

        where: {

          idCartItem: Number(existingItem.idCartItem),

        },

        data: {

          storeId: normalizedStoreId,

          quantity: Number(quantity),

        },

      });

    } else {

      await prisma.cartItems.create({

        data: {

          carId: Number(cart.idCart),

          productId: Number(idProduct),

          quantity: Number(quantity),

          storeId: normalizedStoreId,

          active: 1,

        },

      });

    }



    return res.status(200).json({

      ok: true,

      message: "Producto agregado correctamente",

    });

  } catch (error: any) {

    console.error(error);

    return res.status(500).json({

      ok: false,

      message: error.message,

    });

  }

};



export const addProductFromStorage = async (

  req: CustomRequestI,

  res: Response,

) => {

  try {

    const { dataCart } = req.body;

    const userId = Number(req?.idUser.toString());

    const cart = await getOrCreateActiveCart(userId);



    await Promise.all(

      dataCart.map(async (item: any) => {

        const normalizedStoreId = normalizeStoreId(item.storeId);



        const existingItem = await findActiveCartItem(

          cart.idCart,

          Number(item.idProduct),

          normalizedStoreId,

        );



        if (existingItem) {

          await prisma.cartItems.update({

            where: {

              idCartItem: existingItem.idCartItem,

            },

            data: {

              quantity: Math.max(

                Number(existingItem.quantity ?? 0),

                Number(item.quantity),

              ),

              storeId: normalizedStoreId,

            },

          });

        } else {

          await prisma.cartItems.create({

            data: {

              carId: Number(cart.idCart),

              productId: Number(item.idProduct),

              quantity: Number(item.quantity),

              storeId: normalizedStoreId,

              active: 1,

            },

          });

        }

      }),

    );



    return res.status(200).json({

      ok: true,

      message: "insertados",

    });

  } catch (error: any) {

    return res.status(500).json({

      ok: false,

      message: "Error interno del servidor",

      error: error.message,

    });

  }

};



export const removeProduct = async (req: CustomRequestI, res: Response) => {

  try {

    const { idProduct, storeId } = req.body;

    const userId = Number(req.idUser.toString());

    const normalizedStoreId = normalizeStoreId(storeId);



    const cart = await getOrCreateActiveCart(userId);



    const whereClause: {

      carId: bigint;

      productId: number;

      active: number;

      storeId?: number | null;

    } = {

      carId: cart.idCart,

      productId: Number(idProduct),

      active: 1,

    };



    if (normalizedStoreId === null) {

      whereClause.storeId = null;

    } else {

      whereClause.storeId = normalizedStoreId;

    }



    await prisma.cartItems.updateMany({

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

  } catch (error: any) {

    return res.status(500).json({

      ok: false,

      message: "Error interno del servidor",

      error: error.message,

    });

  }

};



export const removeAllCart = async (req: CustomRequestI, res: Response) => {

  try {

    const userId = Number(req.idUser.toString());

    const cart = await getOrCreateActiveCart(userId);



    await deactivateAllActiveCartItems(cart.idCart);



    return res.status(200).json({

      ok: true,

      message: "Carrito borrado correctamente",

    });

  } catch (error: any) {

    return res.status(500).json({

      ok: false,

      message: "Error interno del servidor",

      error: error.message,

    });

  }

};



export const generateCotizacion = async (

  req: CustomRequestI,

  res: Response,

) => {

  try {

    const { dataCart, name, lastname, email } = req.body;



    const now = new Date();

    const cotizacionNumero = `COT-${now.getFullYear()}${(now.getMonth() + 1)

      .toString()

      .padStart(2, "0")}${now

      .getDate()

      .toString()

      .padStart(2, "0")}-${now.getTime()}`;



    const pathHtml = path.resolve(__dirname, "../../views/cotizacionHtml.ejs");



    if (!fs.existsSync(pathHtml)) {

      return res.status(400).json({

        ok: false,

        message: "No existe la plantilla cotizacionHtml.ejs " + pathHtml,

      });

    }



    const subtotal = dataCart.reduce(

      (acc: any, item: any) => acc + item.price * item.quantity,

      0,

    );



    const plantillaHtml = await ejs.renderFile(pathHtml, {

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



    const pdfResponse = await axios.post(

      "https://api.pdfshift.io/v3/convert/pdf",

      {

        source: plantillaHtml,

      },

      {

        headers: {

          Authorization: `Basic ${Buffer.from(`:${pdfShiftApiKey}`).toString(

            "base64",

          )}`,

          "Content-Type": "application/json",

        },

        responseType: "arraybuffer",

      },

    );



    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(

      "Content-Disposition",

      'attachment; filename="cotizacion.pdf"; charset=utf-8',

    );

    res.send(Buffer.from(pdfResponse.data));

  } catch (error: any) {

    return res.status(500).json({

      ok: false,

      message: "Error interno del servidor",

      error: error.message,

    });

  }

};



export const changeSucursal = async (req: CustomRequestI, res: Response) => {

  try {

    const { idProduct, storeId } = req.body;



    if (!idProduct || !storeId) {

      return res

        .status(400)

        .json({ ok: false, message: "Faltan campos por enviar" });

    }



    const userId = Number(req.idUser);

    const cart = await getOrCreateActiveCart(userId);



    const findCartItems = await prisma.cartItems.findFirst({

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



    await prisma.cartItems.update({

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

  } catch (error: any) {

    return res.status(500).json({

      ok: false,

      message: "Error interno del servidor",

      error: error.message,

    });

  }

};


