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

/* CORS. El sitio vive en otro dominio (Vercel) y necesita permiso,
   pero el panel se sirve desde acá mismo: su propio origen siempre vale,
   sin importar qué diga ORIGENES. */
const permitidos = (process.env.ORIGENES || "").split(",").map(s => s.trim()).filter(Boolean);

app.use(cors((req, cb) => {
  const origen = req.headers.origin;
  if (!origen) return cb(null, { origin: true });           // sin Origin: curl, o navegación normal

  let mismoServidor = false;
  try { mismoServidor = new URL(origen).host === req.headers.host; } catch {}

  const permitido = mismoServidor || !permitidos.length || permitidos.includes(origen);
  if (!permitido) console.warn("CORS: origen rechazado ->", origen);

  // Sin cabecera CORS el navegador bloquea, pero el servidor no tira 500.
  cb(null, { origin: permitido, credentials: false });
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
    const [[f]] = await pool.query("SELECT COUNT(DISTINCT archivo) AS n FROM fotos");
    estado.productos = p.n;
    estado.usuarios = u.n;
    estado.fotosEnBase = f.n;

    // ¿están los archivos, y la carpeta es realmente persistente?
    const fsp = require("fs/promises");
    try {
      await fsp.mkdir(CARPETA_FOTOS, { recursive: true });
      const archivos = (await fsp.readdir(CARPETA_FOTOS)).filter(a => !a.startsWith("."));
      estado.carpeta = CARPETA_FOTOS;
      estado.fotosEnDisco = archivos.length;

      // una carpeta fuera del volumen se borra en cada deploy
      const montada = CARPETA_FOTOS.startsWith("/data");
      estado.volumen = montada ? "ok" : "NO ES VOLUMEN";
      if (!montada) estado.pista = "CARPETA_FOTOS debe empezar con /data y el volumen montarse ahí, si no las fotos se borran en cada deploy";
      else if (!archivos.length && f.n) estado.pista = "Faltan los archivos: poné IMPORTAR_FOTOS=https://manovia.vercel.app y redeployá";
    } catch (e) {
      estado.carpeta = "NO SE PUEDE ESCRIBIR";
      estado.motivo = e.message;
      estado.pista = "Creá el volumen en Settings → Volumes con mount path /data";
    }

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
