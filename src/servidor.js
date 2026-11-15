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

app.get("/salud", (_req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

app.use((err, _req, res, _next) => {
  console.error("error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Error del servidor" });
});

app.listen(PUERTO, () => console.log(`Manovia API escuchando en :${PUERTO}`));
