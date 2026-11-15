-- Consultas para tener a mano en MySQL Workbench

-- Catálogo completo con cantidad de fotos
SELECT p.id, p.nombre, s.nombre AS seccion, p.precio,
       COUNT(f.id) AS fotos, IF(p.activo,'sí','OCULTO') AS visible
  FROM productos p
  JOIN secciones s ON s.slug = p.seccion
  LEFT JOIN fotos f ON f.producto_id = p.id
 GROUP BY p.id
 ORDER BY s.orden, p.orden;

-- Productos sin foto (los que muestran el marcador en la web)
SELECT p.nombre, p.seccion FROM productos p
 LEFT JOIN fotos f ON f.producto_id = p.id
 WHERE f.id IS NULL;

-- Productos sin precio cargado
SELECT nombre, seccion FROM productos WHERE precio = 0;

-- Subir 15% los precios de una sección
-- UPDATE productos SET precio = ROUND(precio * 1.15 / 100) * 100 WHERE seccion = 'mujer';

-- Cuánto vale el catálogo por sección
SELECT s.nombre, COUNT(*) AS productos,
       CONCAT('$', FORMAT(AVG(p.precio), 0)) AS precio_promedio
  FROM productos p JOIN secciones s ON s.slug = p.seccion
 WHERE p.activo = 1 GROUP BY s.slug ORDER BY s.orden;
