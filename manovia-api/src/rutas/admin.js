/* ============================================================
   Rutas del panel. Todas exigen login.
   ============================================================ */
const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs/promises");
const rateLimit = require("express-rate-limit");

const pool = require("../db");
const { firmar, exigirLogin } = require("../auth");

const router = express.Router();
const CARPETA_FOTOS = process.env.CARPETA_FOTOS || "/data/fotos";

/* ---------- login ---------- */
// Sin esto, cualquiera prueba claves por fuerza bruta toda la noche.
const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Esperá 15 minutos." }
});

router.post("/login", limitarLogin, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Faltan datos" });
  try {
    const [filas] = await pool.query(
      "SELECT id, email, nombre, password_hash FROM usuarios WHERE email = ? LIMIT 1",
      [String(email).trim().toLowerCase()]
    );
    const u = filas[0];
    // Mismo mensaje en los dos casos: no le decimos al atacante si el mail existe.
    if (!u || !(await bcrypt.compare(password, u.password_hash)))
      return res.status(401).json({ error: "Email o contraseña incorrectos" });

    res.json({ token: firmar(u), nombre: u.nombre || u.email });
  } catch (e) {
    console.error("login:", e.message);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

router.use(exigirLogin);          // todo lo de abajo ya exige token
router.get("/yo", (req, res) => res.json({ email: req.usuario.email }));

/* ---------- secciones ---------- */
router.get("/secciones", async (_req, res) => {
  const [filas] = await pool.query("SELECT * FROM secciones ORDER BY orden, nombre");
  res.json(filas);
});

router.post("/secciones", async (req, res) => {
  const { slug, nombre, orden } = req.body || {};
  if (!slug || !nombre) return res.status(400).json({ error: "Falta slug o nombre" });
  try {
    await pool.query(
      "INSERT INTO secciones (slug, nombre, orden) VALUES (?,?,?)",
      [String(slug).toLowerCase().trim(), nombre.trim(), Number(orden) || 0]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Esa sección ya existe" });
    res.status(500).json({ error: "No se pudo crear la sección" });
  }
});

/* ---------- productos ---------- */
router.get("/productos", async (_req, res) => {
  const [filas] = await pool.query("SELECT * FROM productos ORDER BY orden, id");
  const [todasLasFotos] = await pool.query(
    "SELECT id, producto_id, archivo FROM fotos ORDER BY orden, id"
  );
  // El panel necesita el id de cada foto para poder borrarla, no solo el archivo.
  const porProducto = new Map();
  for (const f of todasLasFotos){
    if (!porProducto.has(f.producto_id)) porProducto.set(f.producto_id, []);
    porProducto.get(f.producto_id).push({ id: f.id, archivo: f.archivo });
  }
  res.json(filas.map(p => {
    const suyas = porProducto.get(p.id) || [];
    return {
      ...p,
      colores: typeof p.colores === "string" ? JSON.parse(p.colores) : (p.colores || []),
      talles:  typeof p.talles  === "string" ? JSON.parse(p.talles)  : (p.talles  || []),
      fotos: suyas.map(f => f.archivo),
      fotosDetalle: suyas
    };
  }));
});

function limpiar(c){
  return {
    nombre: String(c.nombre || "").trim(),
    seccion: String(c.seccion || "").trim(),
    precio: Math.max(0, Math.round(Number(c.precio) || 0)),
    detalle: String(c.detalle || "").trim().slice(0, 200),
    descripcion: String(c.descripcion || "").trim(),
    etiqueta: c.etiqueta ? String(c.etiqueta).trim().slice(0, 40) : null,
    colores: Array.isArray(c.colores) ? c.colores : [],
    talles: Array.isArray(c.talles) ? c.talles.map(Number).filter(Boolean) : [],
    activo: c.activo === false ? 0 : 1,
    orden: Number(c.orden) || 0
  };
}

const armarSlug = (nombre, seccion) =>
  (seccion + "-" + nombre).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

router.post("/productos", async (req, res) => {
  const d = limpiar(req.body || {});
  if (!d.nombre || !d.seccion) return res.status(400).json({ error: "Falta nombre o sección" });
  try {
    let slug = armarSlug(d.nombre, d.seccion);
    const [[existe]] = await pool.query("SELECT 1 AS x FROM productos WHERE slug = ?", [slug]);
    if (existe) slug += "-" + Date.now().toString(36).slice(-4);

    const [r] = await pool.query(
      `INSERT INTO productos (slug,nombre,seccion,precio,detalle,descripcion,etiqueta,colores,talles,activo,orden)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [slug, d.nombre, d.seccion, d.precio, d.detalle, d.descripcion, d.etiqueta,
       JSON.stringify(d.colores), JSON.stringify(d.talles), d.activo, d.orden]
    );
    res.status(201).json({ id: r.insertId, slug });
  } catch (e) {
    console.error("alta producto:", e.message);
    res.status(500).json({ error: "No se pudo guardar el producto" });
  }
});

router.put("/productos/:id", async (req, res) => {
  const d = limpiar(req.body || {});
  if (!d.nombre || !d.seccion) return res.status(400).json({ error: "Falta nombre o sección" });
  try {
    await pool.query(
      `UPDATE productos SET nombre=?,seccion=?,precio=?,detalle=?,descripcion=?,
              etiqueta=?,colores=?,talles=?,activo=?,orden=? WHERE id=?`,
      [d.nombre, d.seccion, d.precio, d.detalle, d.descripcion, d.etiqueta,
       JSON.stringify(d.colores), JSON.stringify(d.talles), d.activo, d.orden, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("editar producto:", e.message);
    res.status(500).json({ error: "No se pudo actualizar" });
  }
});

router.delete("/productos/:id", async (req, res) => {
  try {
    const [fotos] = await pool.query("SELECT archivo FROM fotos WHERE producto_id = ?", [req.params.id]);
    await pool.query("DELETE FROM productos WHERE id = ?", [req.params.id]);
    // La fila se borra en cascada; los archivos hay que sacarlos a mano.
    for (const f of fotos) await fs.unlink(path.join(CARPETA_FOTOS, f.archivo)).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "No se pudo borrar" });
  }
});

/* ---------- fotos ---------- */
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    // Confiamos en el tipo declarado solo para rechazar rápido;
    // sharp vuelve a validar al procesar y falla si no es imagen real.
    if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Solo se aceptan imágenes JPG, PNG, WEBP o HEIC"));
  }
});

// Envuelvo multer para devolver un error prolijo en vez de volcar el stack
function recibirFotos(req, res, next){
  subida.array("fotos", 8)(req, res, err => {
    if (!err) return next();
    const mensaje = err.code === "LIMIT_FILE_SIZE"
      ? "Cada foto puede pesar hasta 12 MB"
      : (err.message || "No se pudo leer el archivo");
    res.status(400).json({ error: mensaje });
  });
}

router.post("/productos/:id/fotos", recibirFotos, async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: "No llegó ninguna foto" });
  try {
    await fs.mkdir(CARPETA_FOTOS, { recursive: true });
    const [[prod]] = await pool.query("SELECT slug FROM productos WHERE id = ?", [req.params.id]);
    if (!prod) return res.status(404).json({ error: "Producto inexistente" });

    const [[{ ultimo }]] = await pool.query(
      "SELECT COALESCE(MAX(orden), -1) AS ultimo FROM fotos WHERE producto_id = ?", [req.params.id]
    );

    const guardadas = [];
    for (const [i, file] of req.files.entries()){
      const archivo = `${prod.slug}-${Date.now().toString(36)}-${i}.jpg`;
      // Todo sale en 3:4 a 900x1200, igual que las fotos que ya están.
      // Así no importa cómo venga del celular: la grilla queda pareja.
      await sharp(file.buffer)
        .rotate()
        .resize(900, 1200, { fit: "cover", position: "centre" })
        .jpeg({ quality: 86, progressive: true, mozjpeg: true })
        .toFile(path.join(CARPETA_FOTOS, archivo));

      await pool.query(
        "INSERT INTO fotos (producto_id, archivo, orden) VALUES (?,?,?)",
        [req.params.id, archivo, ultimo + 1 + i]
      );
      guardadas.push(archivo);
    }
    res.status(201).json({ fotos: guardadas });
  } catch (e) {
    console.error("subir fotos:", e.message);
    res.status(500).json({ error: "No se pudieron procesar las fotos" });
  }
});

router.delete("/fotos/:id", async (req, res) => {
  try {
    const [[f]] = await pool.query("SELECT archivo FROM fotos WHERE id = ?", [req.params.id]);
    if (!f) return res.status(404).json({ error: "No existe" });
    await pool.query("DELETE FROM fotos WHERE id = ?", [req.params.id]);
    await fs.unlink(path.join(CARPETA_FOTOS, f.archivo)).catch(() => {});
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "No se pudo borrar la foto" });
  }
});

module.exports = router;
