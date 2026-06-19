import { Response } from "express";
import dotenv from "dotenv";
import { prisma } from "../../db/prismaClient";
import { DateTime } from "luxon";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { parseBigInts } from "../../services/index.service";

import ejs from "ejs";
import path from "path";
import fs from "fs";
import axios from "axios";

const fechaLocal = DateTime.now().setZone("America/Mexico_City");
// const envFile = `.env.${process.env.NODE_ENV || "local"}`;
dotenv.config({ path: ".env.prod" });

async function resolveAvailableStock(
  productId: number,
  storeId?: number | null,
) {
  const product = await prisma.products.findFirst({
    where: { idProduct: productId, active: 1 },
    select: { idProduct: true, active: true, stock: true },
  });

  if (!product) {
    return { available: 0, product: null };
  }

  if (storeId) {
    const branchStock = await prisma.product_stock.findFirst({
      where: {
        productId,
        branchId: Number(storeId),
      },
      select: { stock: true },
    });

    if (branchStock?.stock != null) {
      return { available: branchStock.stock, product };
    }
  }

  return { available: product.stock, product };
}

export const getCart = async (req: CustomRequestI, res: Response) => {
  try {
    const cart = await prisma.carts.findFirst({
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

    const serializedCartItems = cartItems
      .map((item) => {
        const quantity = Number(item.quantity ?? 0);
        const unitPrice = Number(item.products.price ?? 0);
        const lineTotal =
          Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100;

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
          lineTotal,
        };
      })
      .filter((product: any) => product.quantity != "0");

    const availableItems = serializedCartItems.filter(
      (product: any) => Number(product.stock) !== 0,
    );

    const subtotal = availableItems.reduce(
      (acc: number, item: any) => acc + Number(item.lineTotal ?? 0),
      0,
    );

    const itemCount = availableItems.reduce(
      (acc: number, item: any) => acc + Number(item.quantity ?? 0),
      0,
    );

    return res.status(200).json({
      ok: true,
      data: parseBigInts(serializedCartItems),
      summary: {
        subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100,
        itemCount,
      },
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
    const { idProduct, quantity, isDetails, storeId } = req.body;
    const requestedQty = Number(quantity);

    if (!Number.isFinite(requestedQty) || requestedQty < 1) {
      return res.status(400).json({
        ok: false,
        message: "Cantidad inválida",
      });
    }

    const { available, product } = await resolveAvailableStock(
      Number(idProduct),
      storeId ? Number(storeId) : null,
    );

    if (!product) {
      return res.status(404).json({
        ok: false,
        message: "Producto no encontrado o inactivo",
      });
    }

    if (requestedQty > available) {
      return res.status(400).json({
        ok: false,
        message: `Stock insuficiente. Disponible: ${available}`,
      });
    }

    // 1️⃣ Buscar carrito activo del usuario
    let cart = await prisma.carts.findFirst({
      where: {
        userId: Number(req?.idUser.toString()),
        status: "active",
      },
    });

    // 2️⃣ Crear carrito si no existe
    if (!cart) {
      cart = await prisma.carts.create({
        data: {
          userId: Number(req?.idUser.toString()),
          status: "active",
          createdAt: new Date().toISOString(),
        },
      });
    }

    // 3️⃣ Buscar item en carrito
    const existingItem = await prisma.cartItems.findFirst({
      where: {
        carId: Number(cart.idCart),
        productId: Number(idProduct),
        storeId: Number(storeId),
        active: 1,
      },
    });

    if (existingItem) {
      if (requestedQty > available) {
        return res.status(400).json({
          ok: false,
          message: `Stock insuficiente. Disponible: ${available}`,
        });
      }

      await prisma.cartItems.update({
        where: {
          idCartItem: Number(existingItem.idCartItem),
        },
        data: {
          storeId: storeId ? Number(storeId) : null,
          quantity: requestedQty,
        },
      });
    } else {
      // 🔹 Si no existe, creamos un nuevo item
      await prisma.cartItems.create({
        data: {
          carId: Number(cart.idCart),
          productId: Number(idProduct),
          quantity: requestedQty,
          storeId: storeId ? Number(storeId) : null,
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

    let cart = await prisma.carts.findFirst({
      where: {
        userId: Number(req?.idUser.toString()),
      },
    });

    if (!cart) {
      cart = await prisma.carts.create({
        data: {
          userId: Number(req?.idUser.toString()),
          status: "active",
          createdAt: fechaLocal.toISO(),
        },
      });
    }

    await Promise.all(
      dataCart.map(async (item: any) => {
        const requestedQty = Number(item.quantity);
        if (!Number.isFinite(requestedQty) || requestedQty < 1) {
          throw new Error(`Cantidad inválida para producto ${item.idProduct}`);
        }

        const { available, product } = await resolveAvailableStock(
          Number(item.idProduct),
          item.storeId ? Number(item.storeId) : null,
        );

        if (!product) {
          throw new Error(`Producto ${item.idProduct} no encontrado o inactivo`);
        }

        const existingItem = await prisma.cartItems.findFirst({
          where: {
            carId: Number(cart.idCart),
            productId: Number(item.idProduct),
            active: 1,
          },
        });

        const totalQty = existingItem
          ? Number(existingItem.quantity) + requestedQty
          : requestedQty;

        if (totalQty > available) {
          throw new Error(
            `Stock insuficiente para producto ${item.idProduct}. Disponible: ${available}`,
          );
        }

        if (existingItem) {
          await prisma.cartItems.update({
            where: {
              idCartItem: existingItem.idCartItem,
            },
            data: {
              quantity: totalQty,
            },
          });
        } else {
          await prisma.cartItems.create({
            data: {
              carId: Number(cart.idCart),
              productId: Number(item.idProduct),
              quantity: requestedQty,
              storeId: item.storeId ? Number(item.storeId) : null,
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
    const { idProduct } = req.body;

    const slcCart = await prisma.carts.findFirst({
      where: {
        userId: Number(req.idUser.toString()),
      },
    });

    if (!slcCart) {
      return res
        .status(400)
        .json({ ok: false, message: "Carrito no encontrado" });
    }

    await prisma.cartItems.updateMany({
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
    const { dataCart } = req.body;

    const slcUser = await prisma.users.findFirst({
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

    const slcCart = await prisma.carts.findFirst({
      where: {
        userId: slcUser.idUser,
      },
    });

    if (!slcCart) {
      return res
        .status(400)
        .json({ ok: false, message: "Carrito no encontrado" });
    }

    await prisma.cartItems.updateMany({
      where: {
        carId: slcCart.idCart,
        productId: { in: dataCart.map((item: any) => Number(item.idProduct)) },
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

    const pdfShiftApiKey = process.env.PDFSHIFT_API_KEY; // Guarda tu API key en las variables de entorno de Vercel
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
        // Otras opciones según la API, como margin, landscape, etc.
        // Puedes pasar el HTML directamente o una URL si el HTML ya está accesible públicamente
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`:${pdfShiftApiKey}`).toString(
            "base64",
          )}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer", // Para recibir el PDF como un buffer de bytes
      },
    );

    // 3. Envía el PDF recibido al cliente
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="cotizacion.pdf"; charset=utf-8',
    );
    res.send(Buffer.from(pdfResponse.data)); // pdfResponse.data contiene el buffer del PDF
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

    const findCart = await prisma.carts.findFirst({
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

    const findCartItems = await prisma.cartItems.findFirst({
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
