const { Router } = require('express');
const {
	getProducts,
	getPaypalClientId,
	createOrder,
	captureOrder
} = require('../controlador/paypal.controller');

const router = Router();

router.get('/products', getProducts);
router.get('/paypal/client-id', getPaypalClientId);
router.post('/orders', createOrder);
router.post('/orders/:orderId/capture', captureOrder);

module.exports = router;
