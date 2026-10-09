import { Response } from "express";

import "../../config/loadEnv";

import { prisma } from "../../db/prismaClient";

import { DateTime } from "luxon";

import CustomRequestI from "./../../interfaces/customrequest.interface";

import { parseBigInts } from "../../services/index.service";

import {

  consolidateActiveCartItems,

  deactivateAllActiveCartItems,

  mergeDuplicateCartLines,

  findActiveCartItem,

  getOrCreateActiveCart,

  normalizeStoreId,

  resolveAvailableStock,

} from "../../services/cart.service";

import { getTechSmartBranchValidationError } from "../../constants/techsmart-branches";
import {
  buildImportedLinesJson,
  normalizeQuoteNumber,
  QUOTE_NUMBER_PATTERN,
  readStoredQuoteLinesPayload,
} from "../../services/quoteLines.service";



import ejs from "ejs";

import path from "path";

import fs from "fs";

import axios from "axios";



const fechaLocal = DateTime.now().setZone("America/Mexico_City");



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

      licenseType: item.products.licenseType ?? null,

      quantity: item.quantity != null ? String(item.quantity) : null,

    }))

    .filter((product: any) => product.quantity != "0");

}



export const getCart = async (req: CustomRequestI, res: Response) => {

  try {

    const userId = Number(req?.idUser.toString());

    const cart = await getOrCreateActiveCart(userId);



    const pageRaw = req.query.page;

    const limitRaw = req.query.limit;

    const wantsPagination =

      pageRaw !== undefined || limitRaw !== undefined;



    // Consolidar solo en lectura full (checkout/sync). En listados paginados
    // evita trabajo extra por cada página que abre el usuario.
    if (!wantsPagination) {

      await consolidateActiveCartItems(userId, cart.idCart);

    }



    const productInclude = {

      products: {

        include: {

          product_stock: {

            include: {

              branches: true,

            },

          },

        },

      },

    } as const;



    const where = {

      carId: cart.idCart,

      active: 1,

      quantity: { gt: 0 },

    };



    if (!wantsPagination) {

      const cartItems = await prisma.cartItems.findMany({

        where,

        orderBy: { idCartItem: "asc" },

        include: productInclude,

      });



      return res.status(200).json({

        ok: true,

        data: parseBigInts(serializeCartItems(cartItems)),

      });

    }



    const page = Math.max(1, parseInt(String(pageRaw), 10) || 1);

    const limit = Math.max(

      1,

      Math.min(50, parseInt(String(limitRaw), 10) || 5),

    );



    const [totalRows, summaryAgg] = await Promise.all([

      prisma.cartItems.count({ where }),

      prisma.$queryRaw<

        { quantityTotal: bigint | number | null; subtotal: any }[]

      >`

        SELECT

          COALESCE(SUM(ci.quantity), 0) AS quantityTotal,

          COALESCE(SUM(ci.quantity * p.price), 0) AS subtotal

        FROM cart_items ci

        INNER JOIN products p ON p.idProduct = ci.productId

        WHERE ci.carId = ${cart.idCart}

          AND ci.active = 1

          AND ci.quantity > 0

      `,

    ]);



    const totalPages =

      totalRows === 0 ? 0 : Math.ceil(totalRows / limit);

    const safePage =

      totalPages === 0 ? 1 : Math.min(page, totalPages);

    const skip = (safePage - 1) * limit;



    const cartItems = await prisma.cartItems.findMany({

      where,

      orderBy: { idCartItem: "asc" },

      skip,

      take: limit,

      include: productInclude,

    });



    const agg = summaryAgg?.[0];

    const quantityTotal = Number(agg?.quantityTotal ?? 0);

    const subtotal = Number(agg?.subtotal ?? 0);



    return res.status(200).json({

      ok: true,

      data: parseBigInts(serializeCartItems(cartItems)),

      pagination: {

        page: safePage,

        limit,

        totalRows,

        totalPages,

      },

      summary: {

        quantityTotal,

        subtotal,

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

    const { idProduct, quantity, storeId, quantityMode = "increment" } = req.body;

    const userId = Number(req?.idUser.toString());

    const normalizedStoreId = normalizeStoreId(storeId);



    const cart = await getOrCreateActiveCart(userId);

    await consolidateActiveCartItems(userId, cart.idCart);

    await mergeDuplicateCartLines(
      cart.idCart,
      Number(idProduct),
      normalizedStoreId,
    );

    const existingItem = await findActiveCartItem(

      cart.idCart,

      Number(idProduct),

      normalizedStoreId,

    );



    const qtyToAdd = Number(quantity) || 0;
    if (qtyToAdd <= 0) {
      return res.status(400).json({
        ok: false,
        message: "Cantidad inválida",
      });
    }

    const stockInfo = await resolveAvailableStock(
      Number(idProduct),
      normalizedStoreId,
    );

    if (!stockInfo.found) {
      return res.status(404).json({
        ok: false,
        message: "Producto no encontrado",
      });
    }

    if (stockInfo.stock <= 0) {
      return res.status(400).json({
        ok: false,
        message: "Este producto no tiene stock disponible",
      });
    }

    const productRecord = await prisma.products.findFirst({
      where: { idProduct: BigInt(idProduct), active: 1 },
      select: { providerId: true },
    });

    const techSmartBranchError = await getTechSmartBranchValidationError(
      productRecord?.providerId != null
        ? Number(productRecord.providerId)
        : null,
      normalizedStoreId,
    );

    if (techSmartBranchError) {
      return res.status(400).json({
        ok: false,
        message: techSmartBranchError,
      });
    }

    const previousQuantity = existingItem
      ? Number(existingItem.quantity ?? 0)
      : 0;

    let nextQuantity: number;
    let quantityAdded: number;

    if (quantityMode === "set") {
      nextQuantity = qtyToAdd;

      if (nextQuantity < 1) {
        return res.status(400).json({
          ok: false,
          message: "La cantidad mínima es 1",
        });
      }

      if (nextQuantity > stockInfo.stock) {
        return res.status(400).json({
          ok: false,
          message: `Solo hay ${stockInfo.stock} unidad${stockInfo.stock === 1 ? "" : "es"} disponible${stockInfo.stock === 1 ? "" : "s"}`,
          data: { maxStock: stockInfo.stock, quantity: previousQuantity },
        });
      }

      quantityAdded = nextQuantity - previousQuantity;

      if (quantityAdded === 0) {
        return res.status(200).json({
          ok: true,
          message: "Sin cambios en el carrito",
          data: {
            quantity: previousQuantity,
            previousQuantity,
            quantityAdded: 0,
            maxStock: stockInfo.stock,
            stockLimitReached: previousQuantity >= stockInfo.stock,
          },
        });
      }
    } else {
      nextQuantity = previousQuantity + qtyToAdd;

      if (nextQuantity > stockInfo.stock) {
        nextQuantity = stockInfo.stock;
      }

      quantityAdded = nextQuantity - previousQuantity;

      if (quantityAdded <= 0) {
        return res.status(200).json({
          ok: true,
          message: `Ya tienes ${previousQuantity} de ${stockInfo.stock} unidades disponibles`,
          data: {
            quantity: previousQuantity,
            previousQuantity,
            quantityAdded: 0,
            maxStock: stockInfo.stock,
            stockLimitReached: true,
            alreadyAtMax: true,
          },
        });
      }
    }

    if (existingItem) {

      await prisma.cartItems.update({

        where: {

          idCartItem: Number(existingItem.idCartItem),

        },

        data: {

          storeId: normalizedStoreId,

          quantity: nextQuantity,

        },

      });

    } else {

      await prisma.cartItems.create({

        data: {

          carId: Number(cart.idCart),

          productId: Number(idProduct),

          quantity: nextQuantity,

          storeId: normalizedStoreId,

          active: 1,

        },

      });

    }



    return res.status(200).json({

      ok: true,

      message: "Producto agregado correctamente",

      data: {
        quantity: nextQuantity,
        previousQuantity,
        quantityAdded,
        maxStock: stockInfo.stock,
        stockLimitReached: nextQuantity >= stockInfo.stock,
      },

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



    for (const item of dataCart ?? []) {
      const normalizedStoreId = normalizeStoreId(item.storeId);
      const productRecord = await prisma.products.findFirst({
        where: { idProduct: BigInt(item.idProduct), active: 1 },
        select: { providerId: true },
      });

      const techSmartBranchError = await getTechSmartBranchValidationError(
        productRecord?.providerId != null
          ? Number(productRecord.providerId)
          : null,
        normalizedStoreId,
      );

      if (techSmartBranchError) {
        return res.status(400).json({
          ok: false,
          message: techSmartBranchError,
        });
      }
    }

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

        .json({ ok: false, message: "Elige un producto y una sucursal para continuar." });

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



export const changeQuantity = async (req: CustomRequestI, res: Response) => {
  req.body.quantityMode = "set";
  return addProduct(req, res);
};

/**
 * Importa líneas de una cotización web al carrito del usuario autenticado (merge).
 * Disponible para cualquier usuario logueado.
 * Tras un import exitoso marca linesJson.importedAt (sin columnas nuevas).
 */
export const importFromQuote = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const userId = Number(req?.idUser.toString());
    const quoteNumber = normalizeQuoteNumber(req.body?.quoteNumber);

    if (!quoteNumber || !QUOTE_NUMBER_PATTERN.test(quoteNumber)) {
      return res.status(400).json({
        ok: false,
        code: "QUOTE_INVALID",
        message: "Número de cotización inválido",
      });
    }

    const quote = await prisma.cotizaciones.findFirst({
      where: { quoteNumber },
      select: {
        idCotizacion: true,
        quoteNumber: true,
        expiresAt: true,
        active: true,
        linesJson: true,
        createdAt: true,
      },
    });

    if (!quote) {
      return res.status(404).json({
        ok: false,
        code: "QUOTE_NOT_FOUND",
        message:
          "No se encontró esa cotización. Verifica el número o genera una nueva (vigencia 5 días).",
      });
    }

    const expired = quote.expiresAt.getTime() < Date.now();
    const archived = quote.active !== 1;
    if (archived || expired) {
      return res.status(410).json({
        ok: false,
        code: "QUOTE_EXPIRED",
        message:
          "Esta cotización ya venció o fue archivada. Genera una cotización nueva desde la tienda.",
        data: {
          quoteNumber: quote.quoteNumber,
          createdAt: quote.createdAt,
          expiresAt: quote.expiresAt,
          archived,
          expired,
        },
      });
    }

    const hasRawLines =
      quote.linesJson != null &&
      !(Array.isArray(quote.linesJson) && quote.linesJson.length === 0);
    const payload = readStoredQuoteLinesPayload(quote.linesJson);
    if (!payload) {
      return res.status(400).json({
        ok: false,
        code: "QUOTE_NO_LINES",
        message: hasRawLines
          ? "Esta cotización tiene líneas en un formato que no se puede importar. Genera una cotización nueva."
          : "Esta cotización no tiene productos guardados para importar. Genera una cotización nueva desde la tienda.",
      });
    }

    if (payload.importedAt) {
      return res.status(409).json({
        ok: false,
        code: "QUOTE_ALREADY_IMPORTED",
        message:
          "Esta cotización ya fue importada al carrito. No se puede volver a importar el mismo número.",
        data: {
          quoteNumber: quote.quoteNumber,
          importedAt: payload.importedAt,
        },
      });
    }

    const lines = payload.lines;
    const cart = await getOrCreateActiveCart(userId);
    await consolidateActiveCartItems(userId, cart.idCart);

    const existingCount = await prisma.cartItems.count({
      where: { carId: cart.idCart, active: 1 },
    });
    const mergedWithExisting = existingCount > 0;

    const skippedInactive: string[] = [];
    const skippedNoStock: string[] = [];
    const skippedMissing: string[] = [];
    const skippedBranch: string[] = [];
    const adjusted: string[] = [];
    const warnings: string[] = [];

    let touchedLines = 0;
    let importedUnits = 0;

    for (const line of lines) {
      const productId = Number(line.productId);
      const qtyWanted = Math.max(1, Math.round(Number(line.quantity) || 1));
      const storeId = normalizeStoreId(line.storeId);

      if (!Number.isSafeInteger(productId) || productId <= 0) {
        skippedMissing.push(`Producto inválido (${line.productId})`);
        continue;
      }

      const product = await prisma.products.findFirst({
        where: { idProduct: BigInt(productId) },
        select: {
          idProduct: true,
          name: true,
          active: true,
          providerId: true,
        },
      });

      const productName =
        product?.name?.trim() || `Producto #${productId}`;

      if (!product) {
        skippedMissing.push(productName);
        continue;
      }

      if (product.active !== 1) {
        skippedInactive.push(productName);
        continue;
      }

      const techSmartBranchError = await getTechSmartBranchValidationError(
        product.providerId != null ? Number(product.providerId) : null,
        storeId,
      );
      if (techSmartBranchError) {
        skippedBranch.push(`${productName}: ${techSmartBranchError}`);
        continue;
      }

      await mergeDuplicateCartLines(cart.idCart, productId, storeId);

      const existingItem = await findActiveCartItem(
        cart.idCart,
        productId,
        storeId,
      );
      const previousQuantity = existingItem
        ? Number(existingItem.quantity ?? 0)
        : 0;

      const stockInfo = await resolveAvailableStock(productId, storeId);
      if (!stockInfo.found) {
        skippedMissing.push(productName);
        continue;
      }

      if (stockInfo.stock <= 0) {
        skippedNoStock.push(
          storeId != null
            ? `${productName} (bodega ${storeId})`
            : productName,
        );
        continue;
      }

      const desired = previousQuantity + qtyWanted;
      let nextQuantity = desired;
      if (nextQuantity > stockInfo.stock) {
        nextQuantity = stockInfo.stock;
        if (previousQuantity >= stockInfo.stock) {
          skippedNoStock.push(
            `${productName}: ya tienes ${previousQuantity} en carrito y no hay stock extra`,
          );
          continue;
        }
        adjusted.push(
          previousQuantity > 0
            ? `${productName}: en carrito ${previousQuantity} + cotizado ${qtyWanted} → se limitó a stock ${stockInfo.stock}`
            : `${productName}: cotizado ${qtyWanted} → disponible ${stockInfo.stock}`,
        );
      }

      const quantityAdded = nextQuantity - previousQuantity;
      if (quantityAdded <= 0) {
        skippedNoStock.push(
          `${productName}: ya tienes ${previousQuantity} en carrito y no hay stock extra`,
        );
        continue;
      }

      if (existingItem) {
        await prisma.cartItems.update({
          where: { idCartItem: Number(existingItem.idCartItem) },
          data: {
            storeId,
            quantity: nextQuantity,
          },
        });
      } else {
        await prisma.cartItems.create({
          data: {
            carId: Number(cart.idCart),
            productId,
            quantity: nextQuantity,
            storeId,
            active: 1,
          },
        });
      }

      importedUnits += quantityAdded;
      touchedLines += 1;
    }

    warnings.push(
      ...skippedInactive.map((n) => `Inactivo: ${n}`),
      ...skippedMissing.map((n) => `No disponible en catálogo: ${n}`),
      ...skippedNoStock.map((n) => `Sin stock: ${n}`),
      ...skippedBranch.map((n) => `Bodega: ${n}`),
      ...adjusted.map((n) => `Cantidad ajustada: ${n}`),
    );

    if (touchedLines === 0 && importedUnits === 0) {
      return res.status(200).json({
        ok: true,
        code: "QUOTE_NOTHING_IMPORTED",
        message: mergedWithExisting
          ? "No se pudo agregar nada de la cotización (inactivos, sin stock o sin cupo extra). Se conservó tu carrito."
          : "Ningún producto de la cotización pudo importarse (inactivos, sin stock o fuera de catálogo).",
        data: {
          quoteNumber: quote.quoteNumber,
          mergedWithExisting,
          touchedLines: 0,
          importedUnits: 0,
          skipped: {
            inactive: skippedInactive,
            noStock: skippedNoStock,
            missing: skippedMissing,
            branch: skippedBranch,
          },
          adjusted,
          warnings,
        },
      });
    }

    // Persiste el flag dentro de linesJson (compatible con POS: lee `.lines`).
    await prisma.cotizaciones.update({
      where: { idCotizacion: quote.idCotizacion },
      data: {
        linesJson: buildImportedLinesJson(lines, userId),
      },
    });

    return res.status(200).json({
      ok: true,
      message:
        warnings.length > 0
          ? mergedWithExisting
            ? "Cotización fusionada con avisos"
            : "Cotización importada con avisos"
          : mergedWithExisting
            ? "Cotización fusionada con el carrito"
            : "Cotización importada al carrito",
      data: {
        quoteNumber: quote.quoteNumber,
        mergedWithExisting,
        touchedLines,
        importedUnits,
        skipped: {
          inactive: skippedInactive,
          noStock: skippedNoStock,
          missing: skippedMissing,
          branch: skippedBranch,
        },
        adjusted,
        warnings,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al importar la cotización",
    });
  }
};

