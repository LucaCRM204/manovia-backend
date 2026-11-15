/* ============================================================
   MANOVIA — servidor
   Sirve el API, las fotos y el panel de administración.
   ============================================================ */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PUERTO = process.env.PORT || 3000;
const CARPETA_FOTOS = process.env.CARPETA_FOTOS || "/data/fotos";

app.set("trust proxy", 1);        // Railway va detrás de proxy: sin esto el rate limit no distingue IPs
app.use(express.json({ limit: "1mb" }));

// El sitio vive en otro dominio (Vercel), así que necesita CORS.
const permitidos = (process.env.ORIGENES || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origen, cb) => {
    if (!origen || !permitidos.length || permitidos.includes(origen)) return cb(null, true);
    cb(new Error("Origen no permitido"));
  }
}));

// Las fotos se sirven desde el volumen persistente
app.use("/fotos", express.static(CARPETA_FOTOS, {
  maxAge: "7d",
  setHeaders: r => r.set("Access-Control-Allow-Origin", "*")
}));

app.use("/api", require("./rutas/publico"));
app.use("/api/admin", require("./rutas/admin"));

// El panel: una sola página estática
app.use("/admin", express.static(path.join(__dirname, "..", "panel")));
app.get("/", (_req, res) => res.redirect("/admin"));

/* Diagnóstico: dice si la base responde y si las tablas están cargadas.
   Sirve para saber qué falta sin tener que leer los logs. */
app.get("/salud", async (_req, res) => {
  const pool = require("./db");
  const estado = { ok: true, hora: new Date().toISOString() };
  try {
    await pool.query("SELECT 1");
    estado.base = "conecta";
  } catch (e) {
    estado.ok = false;
    estado.base = "NO CONECTA";
    estado.motivo = e.code || e.message;
    estado.pista = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT/.test(e.code || "")
      ? "Revisá MYSQL_URL: tiene que ser la referencia ${{MySQL.MYSQL_URL}}"
      : "Revisá usuario y contraseña de la base";
    return res.status(503).json(estado);
  }
  try {
    const [[p]] = await pool.query("SELECT COUNT(*) AS n FROM productos");
    const [[u]] = await pool.query("SELECT COUNT(*) AS n FROM usuarios");
    estado.productos = p.n;
    estado.usuarios = u.n;
    if (!p.n) estado.pista = "No hay productos: poné MIGRAR=1 en las variables y redeployá";
    if (!u.n) estado.pista = "No hay usuarios: poné ADMIN_EMAIL y ADMIN_PASSWORD y redeployá";
  } catch (e) {
    estado.ok = false;
    estado.tablas = "FALTAN";
    estado.motivo = e.code || e.message;
    estado.pista = "Poné MIGRAR=1 en las variables de Railway y redeployá";
    return res.status(503).json(estado);
  }
  res.json(estado);
});

app.use((err, _req, res, _next) => {
  console.error("error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Error del servidor" });
});

const { preparar } = require("./arranque");

app.listen(PUERTO, async () => {
  console.log(`Manovia API escuchando en :${PUERTO}`);
  await preparar();           // migración y usuario, si las variables lo piden
});
