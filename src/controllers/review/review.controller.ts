import { prisma } from "../../db/prismaClient";
import { Response } from "express";
import dotenv from "dotenv";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { DateTime } from "luxon";

dotenv.config({ path: ".env.prod" });
const fechaLocal = DateTime.now().setZone("America/Mexico_City");

export const addReview = async (req: CustomRequestI, res: Response) => {
  try {
    const { review, productId, reviewerName, rating, title } = req.body;

    if (!review || !productId || !reviewerName || !rating || !title) {
      return res.status(400).json({
        ok: false,
        message: "Faltan campos por enviar en el body json",
      });
    }

    await prisma.reviews.create({
      data: {
        description: review,
        productId,
        reviewerName,
        date: fechaLocal.toISO(),
        rating,
        userId: Number(req.idUser),
        title: title,
      },
    });

    return res.status(200).json({
      ok: true,
      message: "ok!",
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};
