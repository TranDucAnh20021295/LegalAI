const express = require('express');
const cors = require('cors');
require('dotenv').config();

const initDatabase = require('./config/initDatabase');
const conversationRoutes = require('./routes/conversations');

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/conversations', conversationRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'chat-service', message: 'Chat service is running' });
});

const PORT = process.env.PORT || 5003;

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Chat: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Chat service start failed:', err.message);
    process.exit(1);
  });
