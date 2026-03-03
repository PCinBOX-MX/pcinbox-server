import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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
import cookieParser from "cookie-parser";
import path from "path";
import helmet from "helmet";

//const envFile = `.env.${process.env.NODE_ENV || "local"}`;
dotenv.config({ path: ".env.prod" });
const server = express();

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
server.use(express.static(path.join(__dirname, "public")));
server.use(express.json({ limit: "10mb" }));
server.use(express.urlencoded({ extended: false }));
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

server.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente");
});

server.listen(Number(process.env.PORT) || 8000, () => {
  console.log(`Server running in the por ${process.env.SERVER_PORT || 8000}`);
  console.log(`Access front end ${allowedOrigins}`);
});
