import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import ticketRoutes from './routes/ticketRoutes.js';
import userRoutes from './routes/userRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import { initSocket } from './socket/socketServer.js';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize WebSocket
initSocket(server);

// Middleware
app.use(express.json());
app.use(cors());

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Ticket routes
app.use('/api/tickets', ticketRoutes);

// User routes
app.use('/api/users', userRoutes);

// Comment routes
app.use('/api/comments', commentRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.send('Ticketing System API');
});

// Database connection
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected...');
        server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => {
        console.error('Connection error:', err.message);
        process.exit(1);
    });
