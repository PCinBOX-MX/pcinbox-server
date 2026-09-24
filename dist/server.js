"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/loadEnv");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const user_route_1 = __importDefault(require("./routes/users/user.route"));
const resetPassword_route_1 = __importDefault(require("./routes/resetPass/resetPassword.route"));
const cart_route_1 = __importDefault(require("./routes/cart/cart.route"));
const auth_route_1 = __importDefault(require("./routes/auth/auth.route"));
const address_route_1 = __importDefault(require("./routes/address/address.route"));
const geonames_route_1 = __importDefault(require("./routes/geonames/geonames.route"));
const billing_route_1 = __importDefault(require("./routes/address/billing.route"));
const favorites_route_1 = __importDefault(require("./routes/favorites/favorites.route"));
const review_route_1 = __importDefault(require("./routes/review/review.route"));
const sales_route_1 = __importDefault(require("./routes/sales/sales.route"));
const reservas_route_1 = __importDefault(require("./routes/reservas/reservas.route"));
const checkout_route_1 = __importDefault(require("./routes/checkout/checkout.route"));
const cotizaciones_route_1 = __importDefault(require("./routes/cotizaciones/cotizaciones.route"));
const pos_route_1 = __importDefault(require("./routes/pos/pos.route"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const helmet_1 = __importDefault(require("helmet"));
const quoteStorage_service_1 = require("./services/quoteStorage.service");
const security_middleware_1 = require("./middleware/security.middleware");
const redis_client_1 = require("./infra/redis/redis.client");
const server = (0, express_1.default)();
(0, security_middleware_1.applySecurityBaseline)(server);
server.use(security_middleware_1.blockMaliciousProbePaths);
server.use(security_middleware_1.globalRateLimiter.middleware);
server.use(security_middleware_1.authPathRateLimiter);
server.use(security_middleware_1.checkoutPathRateLimiter);
server.use(express_1.default.static(path_1.default.join(__dirname, "../public")));
server.set("view engine", "ejs");
server.set("views", path_1.default.join(__dirname, "views"));
server.set("trust proxy", 1);
const allowedOrigins = [
    "http://localhost:3000",
    "https://pcinbox-client.netlify.app",
    "https://434170b7afe4.ngrok-free.app",
    "https://pcinbox-client-fgmohbbf2-alejandro-paredes-sotos-projects.vercel.app",
    "https://pcinbox-client.vercel.app",
    "http://localhost:3001",
    "https://www.pcinbox.com.mx",
    "https://pcinbox-admin.vercel.app",
    "http://192.168.0.107:3000",
    "https://colt-fierce-eugena.ngrok-free.dev",
    "https://interpervasive-unbotanical-kinsley.ngrok-free.dev",
    "https://certainly-slackness-treble.ngrok-free.dev",
    "http://2.25.81.247:8080",
    "http://2.25.81.247",
    "https://admin-qa.pcinbox.com.mx",
    "https://client-qa.pcinbox.com.mx",
    "https://admon.pcinbox.com.mx",
    "http://2.25.81.247:3004"
];
server.use((0, helmet_1.default)());
server.disable("x-powered-by");
server.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));
server.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});
server.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; " +
        "script-src 'self'; " +
        "img-src 'self' https://ik.imagekit.io data:; " +
        "style-src 'self' 'unsafe-inline';");
    next();
});
server.use(express_1.default.static(path_1.default.join(__dirname, "public")));
server.use(express_1.default.json({ limit: "50mb" }));
server.use(express_1.default.urlencoded({ extended: true, limit: "50mb" }));
server.use((0, cookie_parser_1.default)());
//Routes
server.use("/api/v1/user", user_route_1.default);
server.use("/api/v1/resetpassword", resetPassword_route_1.default);
server.use("/api/v1/cart", cart_route_1.default);
server.use("/api/v1/auth", auth_route_1.default);
server.use("/api/v1/address", address_route_1.default);
server.use("/api/v1/geonames", geonames_route_1.default);
server.use("/api/v1/billing", billing_route_1.default);
server.use("/api/v1/favorites", favorites_route_1.default);
server.use("/api/v1/review", review_route_1.default);
server.use("/api/v1/sales", sales_route_1.default);
server.use("/api/v1/reservas", reservas_route_1.default);
server.use("/api/v1/checkout", checkout_route_1.default);
server.use("/api/v1/cotizaciones", cotizaciones_route_1.default);
server.use("/api/v1/pos", pos_route_1.default);
server.get("/", (req, res) => {
    res.send("Servidor funcionando correctamente");
});
server.get("/api/v1/health/redis", async (_req, res) => {
    const ok = await (0, redis_client_1.redisPing)();
    res.status(ok ? 200 : 503).json({ ok, redis: ok ? "up" : "down" });
});
const startServer = async () => {
    await (0, quoteStorage_service_1.ensureQuoteStorage)();
    const redisOk = await (0, redis_client_1.redisPing)();
    console.log(`[pcinbox-server] Redis: ${redisOk ? "conectado" : "no disponible (fallback memoria)"}`);
    server.listen(Number(process.env.PORT) || 8000, () => {
        console.log(`Server running in the por ${process.env.SERVER_PORT || 8000}`);
        console.log(`Access front end ${allowedOrigins}`);
        console.log(`Cotizaciones storage: ${(0, quoteStorage_service_1.getQuoteStorageRoot)()}`);
    });
};
process.on("SIGTERM", () => {
    void (0, redis_client_1.closeRedisClient)();
});
process.on("SIGINT", () => {
    void (0, redis_client_1.closeRedisClient)();
});
void startServer().catch((error) => {
    console.error("No fue posible iniciar el servidor", error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map