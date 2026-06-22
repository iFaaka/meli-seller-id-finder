const sellerPatterns = [
  { name: "_CustId_", regex: /_CustId_(\d{5,})/i },
  { name: "seller_id:url", regex: /seller[_-]?id(?:%3A|:|%3D|=)(\d{5,})/i },
  { name: "seller_id", regex: /["']seller[_-]?id["']\s*[:=]\s*["']?(\d{5,})["']?/i },
  { name: "sellerId", regex: /["']sellerId["']\s*[:=]\s*["']?(\d{5,})["']?/i },
  { name: "seller.id", regex: /["']seller["']\s*:\s*\{[^{}]{0,600}?["']id["']\s*:\s*["']?(\d{5,})["']?/i },
  { name: "owner_id", regex: /["']owner[_-]?id["']\s*[:=]\s*["']?(\d{5,})["']?/i },
  { name: "ownerId", regex: /["']ownerId["']\s*[:=]\s*["']?(\d{5,})["']?/i },
  { name: "cust_id", regex: /["']cust[_-]?id["']\s*[:=]\s*["']?(\d{5,})["']?/i },
];

function isAllowedMercadoLibreUrl(url) {
  return /(^|\.)mercadolibre\.com(\.[a-z]{2})?$/.test(url.hostname)
    || /(^|\.)mercadolibre\.com\.ar$/.test(url.hostname)
    || /(^|\.)mercadolivre\.com\.br$/.test(url.hostname);
}

function parseInputUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Ingresá una URL válida.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("La URL debe empezar con http:// o https://.");
  }

  if (!isAllowedMercadoLibreUrl(url)) {
    throw new Error("Por seguridad, solo acepto URLs de MercadoLibre/MercadoLivre.");
  }

  return url;
}

function candidateUrls(inputUrl) {
  const urls = [inputUrl.toString()];
  const parts = inputUrl.pathname.split("/").filter(Boolean);
  const pageIndex = parts.findIndex((part) => part.toLowerCase() === "pagina");
  const storeIndex = parts.findIndex((part) => part.toLowerCase() === "tienda");

  if (pageIndex >= 0 && parts[pageIndex + 1]) {
    const nickname = decodeURIComponent(parts[pageIndex + 1]);
    const siteHost = inputUrl.hostname.endsWith(".br")
      ? "perfil.mercadolivre.com.br"
      : "perfil.mercadolibre.com.ar";
    urls.push(`https://${siteHost}/${encodeURIComponent(nickname)}`);
  }

  if (storeIndex >= 0 && parts[storeIndex + 1]) {
    const storeName = decodeURIComponent(parts[storeIndex + 1]);
    urls.push(`https://${inputUrl.hostname}/tienda/${encodeURIComponent(storeName)}`);
    urls.push(`https://${inputUrl.hostname}/pagina/${encodeURIComponent(storeName)}`);
  }

  return [...new Set(urls)];
}

function sellerNameFromUrl(inputUrl) {
  const parts = inputUrl.pathname.split("/").filter(Boolean);
  const pageIndex = parts.findIndex((part) => part.toLowerCase() === "pagina");
  const storeIndex = parts.findIndex((part) => part.toLowerCase() === "tienda");

  if (pageIndex >= 0 && parts[pageIndex + 1]) {
    return decodeURIComponent(parts[pageIndex + 1]);
  }

  if (storeIndex >= 0 && parts[storeIndex + 1]) {
    return decodeURIComponent(parts[storeIndex + 1]);
  }

  if (/^perfil\./i.test(inputUrl.hostname) && parts[0]) {
    return decodeURIComponent(parts[0]);
  }

  return "";
}

function extractSellerId(html) {
  for (const pattern of sellerPatterns) {
    const match = pattern.regex.exec(html);
    if (match) {
      return {
        id: match[1],
        matchedBy: pattern.name,
      };
    }
  }
  return null;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "es-AR,es;q=0.9,en;q=0.7",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  const html = await response.text();
  return {
    finalUrl: response.url,
    html,
    status: response.status,
  };
}

async function findSellerId(rawUrl) {
  const inputUrl = parseInputUrl(rawUrl);
  const sellerName = sellerNameFromUrl(inputUrl);

  for (const url of candidateUrls(inputUrl)) {
    const result = await fetchHtml(url);
    const source = `${url}\n${result.finalUrl}\n${result.html}`;
    const extracted = extractSellerId(source);

    if (extracted) {
      return {
        ...extracted,
        sellerName,
      };
    }
  }

  return { id: null, sellerName };
}

async function findSellerIds(rawUrls) {
  const urls = rawUrls
    .map((url) => String(url || "").trim())
    .filter(Boolean);

  if (urls.length === 0) throw new Error("Pegá al menos un link.");
  if (urls.length > 100) throw new Error("Máximo 100 links por búsqueda.");

  const rows = [];
  for (const url of urls) {
    try {
      const result = await findSellerId(url);
      rows.push({
        sellerName: result.sellerName || "",
        ownerId: result.id || "",
        ok: Boolean(result.id),
        url,
      });
    } catch (error) {
      rows.push({
        sellerName: "",
        ownerId: "",
        ok: false,
        url,
        error: error.message || "No se pudo procesar.",
      });
    }
  }

  return { rows };
}

async function readRequestJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error("El pedido es demasiado grande.");
  }
  return JSON.parse(body || "{}");
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = await readRequestJson(req);
    const urls = Array.isArray(body.urls)
      ? body.urls
      : String(body.url || "").split(/\n+/);
    const result = await findSellerIds(urls);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || "No se pudo procesar el pedido." });
  }
}
