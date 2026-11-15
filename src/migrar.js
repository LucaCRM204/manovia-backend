/* ============================================================
   Crea las tablas y carga el catálogo actual (19 productos).
   Es idempotente: se puede correr dos veces sin duplicar nada.
   Uso:  npm run migrar
   ============================================================ */
require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const pool = require("./db");

const SECCIONES = [
  ["mujer",         "Mujer",         1],
  ["hombre",        "Hombre",        2],
  ["portalipstick", "Portalipstick", 3],
  ["billetera",     "Billeteras",    4],
  ["tabaquera",     "Tabaqueras",    5]
];

(async () => {
  try {
    const esquema = await fs.readFile(path.join(__dirname, "..", "sql", "esquema.sql"), "utf8");
    for (const sentencia of esquema.split(/;\s*\n/)){
      if (sentencia.trim().replace(/--.*$/gm, "").trim()) await pool.query(sentencia);
    }
    console.log("Tablas listas");

    for (const [slug, nombre, orden] of SECCIONES){
      await pool.query(
        "INSERT INTO secciones (slug,nombre,orden) VALUES (?,?,?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), orden=VALUES(orden)",
        [slug, nombre, orden]
      );
    }
    console.log("Secciones:", SECCIONES.length);

    const productos = JSON.parse(
      await fs.readFile(path.join(__dirname, "datos-iniciales.json"), "utf8")
    );

    let nuevos = 0, fotos = 0;
    for (const [i, p] of productos.entries()){
      const [r] = await pool.query(
        `INSERT INTO productos (slug,nombre,seccion,precio,detalle,descripcion,etiqueta,colores,talles,orden)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [p.id, p.nombre, p.seccion, p.precio, p.detalle || "", p.desc || "",
         p.etiqueta || null, JSON.stringify(p.colores || []), JSON.stringify(p.talles || []), i]
      );
      const idProducto = r.insertId;
      if (r.affectedRows === 1) nuevos++;

      for (const [j, archivo] of (p.fotos || []).entries()){
        const [f] = await pool.query(
          `INSERT INTO fotos (producto_id, archivo, orden)
           SELECT ?,?,? FROM DUAL
            WHERE NOT EXISTS (SELECT 1 FROM fotos WHERE producto_id = ? AND archivo = ?)`,
          [idProducto, archivo, j, idProducto, archivo]
        );
        if (f.affectedRows) fotos++;
      }
    }
    console.log(`Productos nuevos: ${nuevos} de ${productos.length} · fotos vinculadas: ${fotos}`);
    console.log("\nFalta crear el usuario del panel:");
    console.log('  node src/crear-usuario.js sofia@manovia.com.ar "la-clave" "Sofía"');
    process.exit(0);
  } catch (e) {
    console.error("Falló la migración:", e.message);
    process.exit(1);
  }
})();
