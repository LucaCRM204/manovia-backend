/* ============================================================
   Rutas públicas: lo que lee el sitio. Sin login.
   ============================================================ */
const express = require("express");
const pool = require("../db");
const router = express.Router();

/* Devuelve el catálogo entero en el formato que ya espera la web,
   así el index.html casi no cambia. */
router.get("/catalogo", async (_req, res) => {
  try {
    const [secciones] = await pool.query(
      "SELECT slug, nombre FROM secciones WHERE activa = 1 ORDER BY orden, nombre"
    );
    const [filas] = await pool.query(`
      SELECT p.id, p.slug, p.nombre, p.seccion, p.precio, p.detalle,
             p.descripcion, p.etiqueta, p.colores, p.talles,
             GROUP_CONCAT(f.archivo ORDER BY f.orden, f.id SEPARATOR '|') AS fotos
        FROM productos p
        LEFT JOIN fotos f ON f.producto_id = p.id
       WHERE p.activo = 1
       GROUP BY p.id
       ORDER BY p.orden, p.id
    `);

    const productos = filas.map(f => ({
      id: f.slug,
      nombre: f.nombre,
      seccion: f.seccion,
      precio: f.precio,
      detalle: f.detalle || "",
      desc: f.descripcion || "",
      etiqueta: f.etiqueta || undefined,
      colores: typeof f.colores === "string" ? JSON.parse(f.colores) : (f.colores || []),
      talles:  typeof f.talles  === "string" ? JSON.parse(f.talles)  : (f.talles  || []),
      fotos: f.fotos ? f.fotos.split("|") : []
    }));

    // 5 minutos de caché: si cargan un producto tarda un toque en verse,
    // pero el sitio aguanta una campaña sin castigar la base.
    res.set("Cache-Control", "public, max-age=300");
    res.json({ secciones, productos });
  } catch (e) {
    console.error("catalogo:", e.message);
    res.status(500).json({ error: "No se pudo leer el catálogo" });
  }
});

module.exports = router;
