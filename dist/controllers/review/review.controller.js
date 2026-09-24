"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addReview = void 0;
const prismaClient_1 = require("../../db/prismaClient");
require("../../config/loadEnv");
const luxon_1 = require("luxon");
const catalog_invalidate_pubsub_1 = require("../../infra/redis/catalog-invalidate.pubsub");
const fechaLocal = luxon_1.DateTime.now().setZone("America/Mexico_City");
const addReview = async (req, res) => {
    try {
        const { review, productId, reviewerName, rating, title } = req.body;
        if (!review || !productId || !reviewerName || !rating || !title) {
            return res.status(400).json({
                ok: false,
                message: "Faltan campos por enviar en el body json",
            });
        }
        await prismaClient_1.prisma.reviews.create({
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
        void (0, catalog_invalidate_pubsub_1.publishCatalogInvalidation)({
            source: "pcinbox-server",
            reason: "review-create",
            productId: Number(productId),
        });
        return res.status(200).json({
            ok: true,
            message: "ok!",
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
exports.addReview = addReview;
//# sourceMappingURL=review.controller.js.map