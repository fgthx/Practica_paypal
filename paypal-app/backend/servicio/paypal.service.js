const mysql = require('mysql2/promise');
const { paypalConfig } = require('../configuracion/paypal.config');

const dbPool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tienda',
    connectTimeout: 5000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function getBasicAuth() {
    return Buffer.from(`${paypalConfig.clientId}:${paypalConfig.clientSecret}`).toString('base64');
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const details = data?.message || data?.error_description || JSON.stringify(data);
        throw new Error(`PayPal API ${response.status}: ${details}`);
    }

    return data;
}

async function ensureProductsTableIfMissing() {
    const [tables] = await dbPool.query("SHOW TABLES LIKE 'productos'");
    if (tables.length > 0) {
        return;
    }

    await dbPool.query(`
        CREATE TABLE productos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(120) NOT NULL,
            descripcion VARCHAR(255) NOT NULL,
            precio DECIMAL(10,2) NOT NULL,
            stock INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbPool.query(
        `INSERT INTO productos (nombre, descripcion, precio, stock) VALUES
            ('Audifonos Nova X', 'Audio inalambrico para escritorio y gaming', 699.00, 15),
            ('Mouse Orion Pro', 'Sensor de alta precision y switches silenciosos', 489.00, 25),
            ('Teclado Flux 75', 'Teclado mecanico compacto con iluminacion blanca', 1299.00, 8)`
    );
}

async function resolveProductColumns() {
    const [columns] = await dbPool.query('SHOW COLUMNS FROM productos');
    const normalized = new Map(columns.map((column) => [String(column.Field).toLowerCase(), String(column.Field)]));

    const pick = (options) => options.map((item) => normalized.get(item)).find(Boolean);

    return {
        id: pick(['id']),
        name: pick(['nombre', 'name', 'producto', 'nombre_producto']),
        description: pick(['descripcion', 'description', 'detalle']),
        price: pick(['precio', 'price', 'costo', 'valor']),
        stock: pick(['stock', 'existencia', 'cantidad'])
    };
}

function toProduct(row) {
    return {
        id: Number(row.id),
        name: row.name,
        description: row.description || 'Producto disponible para checkout sandbox',
        price: Number(row.price),
        stock: Number(row.stock || 1),
        currency: 'MXN'
    };
}

async function listProducts() {
    await ensureProductsTableIfMissing();
    const columns = await resolveProductColumns();
    if (!columns.id || !columns.name || !columns.price) {
        throw new Error('La tabla productos no tiene columnas compatibles para id, nombre y precio');
    }

    const select = [
        `\`${columns.id}\` AS id`,
        `\`${columns.name}\` AS name`,
        columns.description ? `\`${columns.description}\` AS description` : `'' AS description`,
        `\`${columns.price}\` AS price`,
        columns.stock ? `\`${columns.stock}\` AS stock` : '1 AS stock'
    ];

    const whereStock = columns.stock ? `WHERE \`${columns.stock}\` > 0` : '';
    const [rows] = await dbPool.query(`SELECT ${select.join(', ')} FROM productos ${whereStock} ORDER BY \`${columns.id}\` ASC`);
    return rows.map(toProduct);
}

async function getProductById(productId) {
    await ensureProductsTableIfMissing();
    const columns = await resolveProductColumns();
    if (!columns.id || !columns.name || !columns.price) {
        throw new Error('La tabla productos no tiene columnas compatibles para id, nombre y precio');
    }

    const select = [
        `\`${columns.id}\` AS id`,
        `\`${columns.name}\` AS name`,
        columns.description ? `\`${columns.description}\` AS description` : `'' AS description`,
        `\`${columns.price}\` AS price`,
        columns.stock ? `\`${columns.stock}\` AS stock` : '1 AS stock'
    ];

    const [rows] = await dbPool.query(
        `SELECT ${select.join(', ')} FROM productos WHERE \`${columns.id}\` = ? LIMIT 1`,
        [productId]
    );
    if (!rows.length) {
        return null;
    }

    return toProduct(rows[0]);
}

async function getAccessToken() {
    const data = await requestJson(`${paypalConfig.baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${getBasicAuth()}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    if (!data.access_token) {
        throw new Error('No se pudo obtener access token de PayPal');
    }

    return data.access_token;
}

async function createPaypalOrderForProduct(productId) {
    const product = await getProductById(productId);

    if (!product) {
        throw new Error('Producto no encontrado');
    }

    const accessToken = await getAccessToken();
    const data = await requestJson(`${paypalConfig.baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [
                {
                    description: product.description,
                    amount: {
                        currency_code: product.currency,
                        value: product.price.toFixed(2),
                        breakdown: {
                            item_total: {
                                currency_code: product.currency,
                                value: product.price.toFixed(2)
                            }
                        }
                    },
                    items: [
                        {
                            name: product.name,
                            quantity: '1',
                            unit_amount: {
                                currency_code: product.currency,
                                value: product.price.toFixed(2)
                            }
                        }
                    ]
                }
            ]
        })
    });

    return { order: data, product };
}

async function capturePaypalOrder(orderId) {
    const accessToken = await getAccessToken();
    return requestJson(`${paypalConfig.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
}

module.exports = {
    listProducts,
    createPaypalOrderForProduct,
    capturePaypalOrder,
    paypalClientId: paypalConfig.clientId
};