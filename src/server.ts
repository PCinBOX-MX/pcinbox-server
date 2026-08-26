import "./config/loadEnv";
import express from "express";
import cors from "cors";
import routesUser from "./routes/users/user.route";
import routesResetPass from "./routes/resetPass/resetPassword.route";
import routesCart from "./routes/cart/cart.route";
import routesAuth from "./routes/auth/auth.route";
import routesAddress from "./routes/address/address.route";
import routesGeonames from "./routes/geonames/geonames.route";
import routesBilling from "./routes/address/billing.route";
import routerFavorites from "./routes/favorites/favorites.route";
import routesReview from "./routes/review/review.route";
import routesSales from "./routes/sales/sales.route";
import routesReservas from "./routes/reservas/reservas.route";
import routesCheckout from "./routes/checkout/checkout.route";
import routesCotizaciones from "./routes/cotizaciones/cotizaciones.route";
import cookieParser from "cookie-parser";
import path from "path";
import helmet from "helmet";
import {
  ensureQuoteStorage,
  getQuoteStorageRoot,
} from "./services/quoteStorage.service";
import {
  applySecurityBaseline,
  authPathRateLimiter,
  blockMaliciousProbePaths,
  checkoutPathRateLimiter,
  globalRateLimiter,
} from "./middleware/security.middleware";
import { closeRedisClient, redisPing } from "./infra/redis/redis.client";

const server = express();

applySecurityBaseline(server);

server.use(blockMaliciousProbePaths);
server.use(globalRateLimiter.middleware);
server.use(authPathRateLimiter);
server.use(checkoutPathRateLimiter);

server.use(express.static(path.join(__dirname, "../public")));
server.set("view engine", "ejs");
server.set("views", path.join(__dirname, "views"));
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

server.use(helmet());
server.disable("x-powered-by");

server.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

server.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
server.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self'; " +
    "img-src 'self' https://ik.imagekit.io data:; " +
    "style-src 'self' 'unsafe-inline';",
  );

  next();
});
server.use(express.static(path.join(__dirname, "public")));
server.use(express.json({ limit: "50mb" }));
server.use(express.urlencoded({ extended: true, limit: "50mb" }));
server.use(cookieParser());

//Routes
server.use("/api/v1/user", routesUser);
server.use("/api/v1/resetpassword", routesResetPass);
server.use("/api/v1/cart", routesCart);
server.use("/api/v1/auth", routesAuth);
server.use("/api/v1/address", routesAddress);
server.use("/api/v1/geonames", routesGeonames);
server.use("/api/v1/billing", routesBilling);
server.use("/api/v1/favorites", routerFavorites);
server.use("/api/v1/review", routesReview);
server.use("/api/v1/sales", routesSales);
server.use("/api/v1/reservas", routesReservas);
server.use("/api/v1/checkout", routesCheckout);
server.use("/api/v1/cotizaciones", routesCotizaciones);

server.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente");
});

server.get("/api/v1/health/redis", async (_req, res) => {
  const ok = await redisPing();
  res.status(ok ? 200 : 503).json({ ok, redis: ok ? "up" : "down" });
});

const startServer = async () => {
  await ensureQuoteStorage();
  const redisOk = await redisPing();
  console.log(
    `[pcinbox-server] Redis: ${redisOk ? "conectado" : "no disponible (fallback memoria)"}`,
  );
  server.listen(Number(process.env.PORT) || 8000, () => {
    console.log(`Server running in the por ${process.env.SERVER_PORT || 8000}`);
    console.log(`Access front end ${allowedOrigins}`);
    console.log(`Cotizaciones storage: ${getQuoteStorageRoot()}`);
  });
};

process.on("SIGTERM", () => {
  void closeRedisClient();
});
process.on("SIGINT", () => {
  void closeRedisClient();
});

void startServer().catch((error) => {
  console.error("No fue posible iniciar el servidor", error);
  process.exit(1);
});
