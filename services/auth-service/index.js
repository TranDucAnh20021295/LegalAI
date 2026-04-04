const express = require('express');
const { mountListen } = require('../graceful-listen');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
require('dotenv').config();

const initDatabase = require('./config/initDatabase');
const { connectRedis } = require('./config/redis');
const authRoutes = require('./routes/auth');

const app = express();

// Middleware
app.use(cors({
  origin: '*', // In microservice, gateway handles CORS
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'auth-service',
    message: 'Auth service is running' 
  });
});

const PORT = Number(process.env.PORT) || 5001;

initDatabase()
  .then(() => connectRedis())
  .then((redis) => {
    mountListen(app, PORT, 'auth-service', () => {
      console.log(`Auth: http://localhost:${PORT} (Redis: session storage)`);
    });
  })
  .catch((err) => {
    console.error('Auth start failed:', err.message);
    process.exit(1);
  });
