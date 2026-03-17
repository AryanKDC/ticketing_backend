import Ticket from '../models/ticket.js';
import Comment from '../models/comments.js';
import { v4 as uuidv4 } from 'uuid';
import { saveFilesToDisk } from '../middleware/upload.js';
import fs from 'fs';
import path from 'path';
import { getIO } from '../socket/socketServer.js';

// @desc    Create new ticket
// @route   POST /api/tickets
export const createTicket = async (req, res) => {
    try {
        req.body.user = req.user.id;
        req.body.lastMessage = new Date();
        req.body.status = "open";
        req.body.ticketId = 'TK-' + uuidv4().split('-')[0].toUpperCase();

        const ticket = await Ticket.create(req.body);

        // Only save files to disk after ticket is successfully created
        if (req.files && req.files.length > 0) {
            const savedPaths = saveFilesToDisk(req.files);
            ticket.attachments = savedPaths;
            await ticket.save();
        }

        await ticket.populate('user', 'name email');
        if (ticket.assignee) {
            await ticket.populate('assignee', 'name email');
        }

        const io = getIO();
        io.emit("newTicket", ticket);
        io.emit("ticketListUpdated");

        res.status(201).json({ success: true, data: ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all tickets
// @route   GET /api/tickets
export const getTickets = async (req, res) => {
    try {
        // Copy req.query
        const reqQuery = { ...req.query };

        // Fields to exclude from filtering
        const removeFields = ['select', 'sort', 'page', 'limit', 'search', 'startDate', 'endDate', 'unassigned', 'myTickets'];
        removeFields.forEach(param => delete reqQuery[param]);

        // Create query string with MongoDB operators
        let queryStr = JSON.stringify(reqQuery);
        queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

        let filterObj = JSON.parse(queryStr);

        // Role based visibility
        if (req.user.type === "user") {
            filterObj.user = req.user.id;
        }

        if (req.user.type === "support") {
            filterObj.$or = [
                { assignee: req.user.id },
                { assignee: null }
            ];
        }

        // Search by subject (case-insensitive)
        if (req.query.search) {
            filterObj.$or = [
                { subject: { $regex: req.query.search, $options: 'i' } },
            ];
        }

        // Date range filter on createdAt
        if (req.query.startDate || req.query.endDate) {
            filterObj.createdAt = {};
            if (req.query.startDate) {
                filterObj.createdAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                filterObj.createdAt.$lte = new Date(req.query.endDate);
            }
        }

        // Unassigned tickets filter
        if (req.query.unassigned === 'true') {
            filterObj.assignee = null;
            delete filterObj.$or;
        }

        // My open tickets filter (assigned to the logged-in user)
        if (req.query.myTickets === 'true') {
            filterObj.assignee = req.user.id;
            filterObj.status = { $in: ['open', 'pending'] };
        }

        // Build query
        let query = Ticket.find(filterObj)
            .populate('user', 'name email')
            .populate('assignee', 'name email');

        // Select Fields
        if (req.query.select) {
            const fields = req.query.select.split(',').join(' ');
            query = query.select(fields);
        }

        // Sort
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            query = query.sort(sortBy);
        } else {
            query = query.sort('-lastMessage');
        }

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 5;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const total = await Ticket.countDocuments(filterObj);

        query = query.skip(startIndex).limit(limit);

        // Execute query
        const tickets = await query;

        // Pagination result
        const pagination = {
            currentPage: page,
            totalPages: Math.ceil(total / limit)
        };

        if (endIndex < total) {
            pagination.next = { page: page + 1, limit };
        }

        if (startIndex > 0) {
            pagination.prev = { page: page - 1, limit };
        }

        res.status(200).json({
            success: true,
            count: tickets.length,
            total,
            pagination,
            data: tickets
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get single ticket (with populated comments)
// @route   GET /api/tickets/:id
export const getTicketById = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id)
            .populate('user', 'name email')
            .populate('assignee', 'name email')
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'name email type'
                },
                options: { sort: { createdAt: 1 } }
            });

        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        if (
            req.user.type === "user" &&
            ticket.user._id.toString() !== req.user.id
        ) {
            return res.status(403).json({
                success: false,
                error: "Not authorized to view this ticket"
            });
        }

        if (
            req.user.type === "support" &&
            ticket.assignee &&
            ticket.assignee._id.toString() !== req.user.id
        ) {
            return res.status(403).json({
                success: false,
                error: "Not authorized to view this ticket"
            });
        }

        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update ticket (status, assignee, etc.)
// @route   PUT /api/tickets/:id
export const updateTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        })
            .populate('user', 'name email')
            .populate('assignee', 'name email');

        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const io = getIO();
        io.to(ticket._id.toString()).emit("ticketUpdated", ticket);
        io.emit("ticketListUpdated");

        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete ticket (and all associated comments)
// @route   DELETE /api/tickets/:id
export const deleteTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        // Helper to delete attachment files from disk
        const deleteFiles = (attachments) => {
            if (attachments && attachments.length > 0) {
                attachments.forEach(filePath => {
                    const fullPath = path.resolve(filePath.replace(/^\//, ''));
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                });
            }
        };

        // Delete ticket attachment files from disk
        deleteFiles(ticket.attachments);

        // Find all comments and delete their attachment files too
        const comments = await Comment.find({ ticket: ticket._id });
        comments.forEach(comment => deleteFiles(comment.attachments));

        // Delete all comments and the ticket from DB
        await Comment.deleteMany({ ticket: ticket._id });
        await Ticket.findByIdAndDelete(req.params.id);

        const io = getIO();
        io.to(req.params.id).emit("ticketDeleted", req.params.id);
        io.emit("ticketListUpdated");

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get comments for a specific ticket
// @route   GET /api/tickets/:ticketId/comments
export const getTicketComments = async (req, res) => {
    try {
        const comments = await Comment.find({ ticket: req.params.ticketId })
            .populate('user', 'name email type')
            .sort({ createdAt: 1 });  // Chronological for chat view

        res.status(200).json({
            success: true,
            count: comments.length,
            data: comments
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Add a comment to a specific ticket
// @route   POST /api/tickets/:ticketId/comments
export const addTicketComment = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.ticketId);
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        // Create the comment first (without attachments)
        const comment = await Comment.create({
            text: req.body.text,
            user: req.user.id,
            ticket: req.params.ticketId,
            attachments: req.body.attachments || []
        });

        // Only save files to disk after comment is successfully created
        if (req.files && req.files.length > 0) {
            const savedPaths = saveFilesToDisk(req.files);
            comment.attachments = [...comment.attachments, ...savedPaths];
            await comment.save();
        }

        // Push comment to ticket's comments array and update lastMessage
        ticket.comments.push(comment._id);
        ticket.lastMessage = new Date();
        await ticket.save();

        // Populate user info before returning
        await comment.populate('user', 'name email type');

        const io = getIO();
        io.to(req.params.ticketId).emit("newComment", comment);

        res.status(201).json({ success: true, data: comment });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Assign a ticket to a user
// @route   PUT /api/tickets/:id/assign
export const assignTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        ticket.assignee = req.body.assignee;
        await ticket.save();
        await ticket.populate('assignee', 'name email');

        const io = getIO();
        io.to(ticket._id.toString()).emit("ticketUpdated", ticket);
        io.emit("ticketListUpdated");

        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
