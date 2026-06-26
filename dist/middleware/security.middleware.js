"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutPathRateLimiter = exports.authPathRateLimiter = exports.strictRateLimiter = exports.authRateLimiter = exports.globalRateLimiter = void 0;
exports.applySecurityBaseline = applySecurityBaseline;
exports.blockMaliciousProbePaths = blockMaliciousProbePaths;
const http_rate_limiter_util_1 = require("../utils/http-rate-limiter.util");
const PROBE_PATTERNS = [
    "/.env",
    "/.git",
    "/wp-admin",
    "/wp-login",
    "/phpmyadmin",
    "/xmlrpc.php",
    "/vendor/phpunit",
    "/actuator",
    "/.aws",
    "/cgi-bin",
    "/shell",
];
exports.globalRateLimiter = new http_rate_limiter_util_1.HttpRateLimiter(Number(process.env.RATE_LIMIT_GLOBAL_MAX || 250), Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || 60_000), "global");
exports.authRateLimiter = new http_rate_limiter_util_1.HttpRateLimiter(Number(process.env.RATE_LIMIT_AUTH_MAX || 20), Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 900_000), "auth");
exports.strictRateLimiter = new http_rate_limiter_util_1.HttpRateLimiter(Number(process.env.RATE_LIMIT_STRICT_MAX || 60), Number(process.env.RATE_LIMIT_STRICT_WINDOW_MS || 60_000), "strict");
function applySecurityBaseline(app) {
    app.set("trust proxy", process.env.TRUST_PROXY === "false" ? false : 1);
    app.disable("x-powered-by");
}
function blockMaliciousProbePaths(req, res, next) {
    const path = req.path.toLowerCase();
    if (path.includes("..")) {
        console.warn(`[security] Path traversal bloqueado: ${req.method} ${req.path} IP=${(0, http_rate_limiter_util_1.resolveClientIp)(req)}`);
        res.status(404).json({ ok: false, message: "Not found" });
        return;
    }
    if (PROBE_PATTERNS.some((pattern) => path.includes(pattern))) {
        console.warn(`[security] Probe bloqueado: ${req.method} ${req.path} IP=${(0, http_rate_limiter_util_1.resolveClientIp)(req)}`);
        res.status(404).json({ ok: false, message: "Not found" });
        return;
    }
    next();
}
exports.authPathRateLimiter = (0, http_rate_limiter_util_1.createPathPrefixRateLimiter)([
    "/api/v1/user/login",
    "/api/v1/user/logingoogle",
    "/api/v1/user/register",
    "/api/v1/resetpassword",
], exports.authRateLimiter);
exports.checkoutPathRateLimiter = (0, http_rate_limiter_util_1.createPathPrefixRateLimiter)(["/api/v1/sales/registersales", "/api/v1/cart"], exports.strictRateLimiter);
//# sourceMappingURL=security.middleware.js.map