import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import ticketRoutes from './routes/ticketRoutes.js';
import userRoutes from './routes/userRoutes.js';
import commentRoutes from './routes/commentRoutes.js';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

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
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => {
        console.error('Connection error:', err.message);
        process.exit(1);
    });
