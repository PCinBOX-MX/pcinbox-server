import { Response } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
import {
  normalizeStoredQuoteLine,
  QUOTE_CART_MAX_LINES,
  mergeQuoteCartLines,
  readAdminQuoteCart,
  removeQuoteCartLine,
  setQuoteCartQuantity,
  sliceQuoteCart,
  stageAdminQuoteImport,
  listAdminImportedQuoteNumbers,
  StoredQuoteLine,
  upsertQuoteCartLine,
  writeAdminQuoteCart,
} from "../../services/adminQuoteCart.service";

function userIdOf(req: CustomRequestI): number | null {
  const userId = Number(req.idUser);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  return userId;
}

function requestedPage(value: unknown): number {
  const page = Math.trunc(Number(value));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function sendCart(
  res: Response,
  userId: number,
  lines: StoredQuoteLine[],
  page: number,
  viewAll = false,
) {
  const payload = sliceQuoteCart(lines, page, viewAll);
  return res.status(200).json({
    ok: true,
    ...payload,
    importedQuotes: listAdminImportedQuoteNumbers(userId),
  });
}

export const getAdminQuoteCart = async (req: CustomRequestI, res: Response) => {
  const userId = userIdOf(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
  }
  const lines = await readAdminQuoteCart(userId);
  const viewAll = String(req.query.view || "") === "all";
  return sendCart(res, userId, lines, requestedPage(req.query.page), viewAll);
};

export const replaceAdminQuoteCart = async (
  req: CustomRequestI,
  res: Response,
) => {
  const userId = userIdOf(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
  }
  const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : null;
  if (!rawLines) {
    return res.status(400).json({ ok: false, message: "El carrito no es válido." });
  }
  if (rawLines.length > QUOTE_CART_MAX_LINES) {
    return res.status(400).json({
      ok: false,
      message: "El carrito admite como máximo 100 productos.",
    });
  }
  const lines = rawLines
    .map(normalizeStoredQuoteLine)
    .filter((line: StoredQuoteLine | null): line is StoredQuoteLine => Boolean(line));
  await writeAdminQuoteCart(userId, lines);
  return sendCart(res, userId, lines, requestedPage(req.body?.page));
};

export const mergeAdminQuoteCart = async (
  req: CustomRequestI,
  res: Response,
) => {
  const userId = userIdOf(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
  }
  const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : null;
  if (!rawLines) {
    return res.status(400).json({ ok: false, message: "El carrito no es válido." });
  }
  const incoming = rawLines
    .map(normalizeStoredQuoteLine)
    .filter((line: StoredQuoteLine | null): line is StoredQuoteLine => Boolean(line));
  const current = await readAdminQuoteCart(userId);
  const merged = mergeQuoteCartLines(current, incoming);
  if ("error" in merged) {
    return res.status(400).json({
      ok: false,
      message: "El carrito admite como máximo 100 productos.",
    });
  }
  stageAdminQuoteImport(
    userId,
    req.body?.quoteNumber,
    incoming.map((line: StoredQuoteLine) => line.idProduct),
  );
  await writeAdminQuoteCart(userId, merged.lines);
  return sendCart(res, userId, merged.lines, merged.page);
};

export const addAdminQuoteCartLine = async (
  req: CustomRequestI,
  res: Response,
) => {
  const userId = userIdOf(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
  }
  const incoming = normalizeStoredQuoteLine({ ...req.body, quantity: 1 });
  if (!incoming) {
    return res.status(400).json({ ok: false, message: "El producto no es válido." });
  }
  const current = await readAdminQuoteCart(userId);
  const result = upsertQuoteCartLine(current, incoming);
  if ("error" in result) {
    return res.status(400).json({
      ok: false,
      message: "El carrito admite como máximo 100 productos.",
    });
  }
  await writeAdminQuoteCart(userId, result.lines);
  return sendCart(res, userId, result.lines, result.page);
};

export const updateAdminQuoteCartQuantity = async (
  req: CustomRequestI,
  res: Response,
) => {
  const userId = userIdOf(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
  }
  const idProduct = Number(req.body?.idProduct);
  const rawQuantity = req.body?.quantity;
  const quantity =
    rawQuantity === null || rawQuantity === ""
      ? null
      : Math.round(Number(rawQuantity));
  if (!Number.isSafeInteger(idProduct) || idProduct <= 0) {
    return res.status(400).json({ ok: false, message: "El producto no es válido." });
  }
  if (
    quantity !== null &&
    (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
  ) {
    return res.status(400).json({ ok: false, message: "La cantidad no es válida." });
  }
  const current = await readAdminQuoteCart(userId);
  const next = setQuoteCartQuantity(current, idProduct, quantity);
  if (!next) {
    return res.status(404).json({ ok: false, message: "El producto ya no está en el carrito." });
  }
  await writeAdminQuoteCart(userId, next);
  return sendCart(res, userId, next, requestedPage(req.body?.page));
};

export const removeAdminQuoteCartLine = async (
  req: CustomRequestI,
  res: Response,
) => {
  const userId = userIdOf(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
  }
  const idProduct = Number(req.params.idProduct);
  if (!Number.isSafeInteger(idProduct) || idProduct <= 0) {
    return res.status(400).json({ ok: false, message: "El producto no es válido." });
  }
  const next = removeQuoteCartLine(await readAdminQuoteCart(userId), idProduct);
  await writeAdminQuoteCart(userId, next);
  return sendCart(res, userId, next, requestedPage(req.query.page));
};

export const clearAdminQuoteCart = async (
  req: CustomRequestI,
  res: Response,
) => {
  const userId = userIdOf(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
  }
  await writeAdminQuoteCart(userId, []);
  return sendCart(res, userId, [], 1);
};
