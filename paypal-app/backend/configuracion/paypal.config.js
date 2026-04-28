const paypalBaseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

const paypalConfig = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    baseUrl: paypalBaseUrl.includes('api-m')
        ? paypalBaseUrl
        : 'https://api-m.sandbox.paypal.com'
};

module.exports = { paypalConfig };