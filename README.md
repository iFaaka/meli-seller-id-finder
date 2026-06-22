# MercadoLibre Seller ID Finder

Web local para pegar varios links de MercadoLibre y extraer `ownerID` / `seller_id` cuando aparece en la URL, en redirecciones o en la fuente publica de la pagina.

La salida queda en dos columnas listas para copiar a Excel:

- `Nombre del seller`
- `ownerID`

El boton **Copiar para Excel** copia solo los datos, sin encabezado.

## Uso local

Requiere Node.js 18 o superior.

```bash
npm start
```

Abrir:

```text
http://127.0.0.1:4173
```

Para cambiar el puerto:

```bash
PORT=3000 npm start
```

## Como funciona

- Links `/pagina/nombre`: usa `nombre` como nombre del seller y prueba tambien el perfil del vendedor.
- Links `/tienda/nombre`: usa `nombre` como nombre del seller y prueba variantes de tienda/listado.
- Links de producto: si el link trae `seller_id%3A123` o `seller_id=123`, extrae ese ID directamente.
- Si MercadoLibre responde con verificacion de trafico (`/gz/account-verification`) y no incluye `_CustId_` ni `seller_id`, no hay ID publico para extraer desde esa respuesta.

## Scripts

```bash
npm start
npm run check
```

## Estructura

```text
.
├── public/
│   └── index.html
├── server.mjs
├── package.json
└── README.md
```
