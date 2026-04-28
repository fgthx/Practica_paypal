const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const paypalRouter = require('./router/paypal.router');

const app = express();
const port = Number(process.env.BACKEND_PORT || 3000);

const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server and same-origin requests with no Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (localOriginPattern.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origen no permitido por CORS: ${origin}`));
  }
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'paypal-backend' });
});

app.use('/api', paypalRouter);

app.listen(port, () => {
  console.log(`Backend listo en http://localhost:${port}`);
});
