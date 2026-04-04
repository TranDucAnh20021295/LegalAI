const express = require('express');
const { mountListen } = require('../graceful-listen');
const cors = require('cors');
require('dotenv').config();

const initDatabase = require('./config/initDatabase');
const conversationRoutes = require('./routes/conversations');
const subscriptionRoutes = require('./routes/subscriptions');

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/conversations', conversationRoutes);
app.use('/subscriptions', subscriptionRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'chat-service', message: 'Chat service is running' });
});

const PORT = Number(process.env.PORT) || 5003;

initDatabase()
  .then(() => {
    mountListen(app, PORT, 'chat-service', () => {
      console.log(`Chat: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Chat service start failed:', err.message);
    process.exit(1);
  });
