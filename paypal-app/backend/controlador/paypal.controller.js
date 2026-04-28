const {
	listProducts,
	createPaypalOrderForProduct,
	capturePaypalOrder,
	paypalClientId
} = require('../servicio/paypal.service');

async function getProducts(_req, res) {
	try {
		const products = await listProducts();
		return res.json(products);
	} catch (error) {
		return res.status(500).json({ message: 'No se pudieron cargar productos', detail: error.message });
	}
}

function getPaypalClientId(_req, res) {
	if (!paypalClientId) {
		return res.status(500).json({ message: 'PAYPAL_CLIENT_ID no configurado' });
	}

	return res.json({ clientId: paypalClientId });
}

async function createOrder(req, res) {
	const productId = Number(req.body?.productId);
	if (!productId) {
		return res.status(400).json({ message: 'productId es requerido' });
	}

	try {
		const result = await createPaypalOrderForProduct(productId);
		return res.status(201).json({
			id: result.order.id,
			status: result.order.status,
			product: result.product,
			links: result.order.links
		});
	} catch (error) {
		const status = /no encontrado/i.test(error.message) ? 404 : 500;
		return res.status(status).json({ message: 'No se pudo crear la orden', detail: error.message });
	}
}

async function captureOrder(req, res) {
	const orderId = req.params.orderId;
	if (!orderId) {
		return res.status(400).json({ message: 'orderId es requerido' });
	}

	try {
		const capture = await capturePaypalOrder(orderId);
		return res.json(capture);
	} catch (error) {
		return res.status(500).json({ message: 'No se pudo capturar la orden', detail: error.message });
	}
}

module.exports = {
	getProducts,
	getPaypalClientId,
	createOrder,
	captureOrder
};
