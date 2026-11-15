-- ============================================================
--  MANOVIA — esquema de base de datos (MySQL 8)
--  Se ejecuta solo con `npm run migrar`, pero queda acá para
--  poder abrirlo en MySQL Workbench y ver la estructura.
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre        VARCHAR(120),
  creado_en     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Las secciones son datos, no código: se pueden agregar desde el panel
-- sin tocar el sitio. Cuando sumen carteras, se crea acá y listo.
CREATE TABLE IF NOT EXISTS secciones (
  slug   VARCHAR(40) PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL,
  orden  INT DEFAULT 0,
  activa TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS productos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  slug          VARCHAR(80)  NOT NULL UNIQUE,
  nombre        VARCHAR(120) NOT NULL,
  seccion       VARCHAR(40)  NOT NULL,
  precio        INT          NOT NULL DEFAULT 0,
  detalle       VARCHAR(200),
  descripcion   TEXT,
  etiqueta      VARCHAR(40),
  colores       JSON,          -- [{"n":"Negro","h":"#211d1c"}]
  talles        JSON,          -- [90,95,100] o [] si no lleva
  activo        TINYINT(1) DEFAULT 1,
  orden         INT DEFAULT 0,
  creado_en     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_seccion (seccion),
  INDEX idx_activo  (activo),
  CONSTRAINT fk_prod_seccion FOREIGN KEY (seccion) REFERENCES secciones(slug)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fotos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  archivo     VARCHAR(255) NOT NULL,
  orden       INT DEFAULT 0,
  creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_producto (producto_id, orden),
  CONSTRAINT fk_foto_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
