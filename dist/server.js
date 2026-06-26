"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
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
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const helmet_1 = __importDefault(require("helmet"));
const security_middleware_1 = require("./middleware/security.middleware");
//const envFile = `.env.${process.env.NODE_ENV || "local"}`;
dotenv_1.default.config({ path: ".env.prod" });
const server = (0, express_1.default)();
(0, security_middleware_1.applySecurityBaseline)(server);
server.use(security_middleware_1.blockMaliciousProbePaths);
server.use(security_middleware_1.globalRateLimiter.middleware);
server.use(security_middleware_1.authPathRateLimiter);
server.use(security_middleware_1.checkoutPathRateLimiter);
server.use(express_1.default.static(path_1.default.join(__dirname, "../public")));
server.set("view engine", "ejs");
server.set("views", path_1.default.join(__dirname, "views"));
server.set("trust proxy", process.env.TRUST_PROXY === "false" ? false : 1);
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
    "https://bd26-177-245-224-110.ngrok-free.app",
    "https://certainly-slackness-treble.ngrok-free.dev",
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
server.use(express_1.default.json({ limit: "10mb" }));
server.use(express_1.default.urlencoded({ extended: false }));
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
server.get("/", (req, res) => {
    res.send("Servidor funcionando correctamente");
});
server.listen(Number(process.env.PORT) || 8000, () => {
    console.log(`Server running in the por ${process.env.SERVER_PORT || 8000}`);
    console.log(`Access front end ${allowedOrigins}`);
});
//# sourceMappingURL=server.js.map