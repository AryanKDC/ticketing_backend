import Comment from "../models/comments.js";
import Ticket from "../models/ticket.js";
import { saveFilesToDisk } from '../middleware/upload.js';
import fs from "fs";
import path from "path";

// @desc    Create new comment
// @route   POST /api/comments
export const createComment = async (req, res) => {
    try {
        // Set user from logged-in user
        req.body.user = req.user.id;

        const comment = await Comment.create(req.body);

        // Only save files to disk after comment is successfully created
        if (req.files && req.files.length > 0) {
            const savedPaths = saveFilesToDisk(req.files);
            comment.attachments = comment.attachments ? [...comment.attachments, ...savedPaths] : savedPaths;
            await comment.save();
        }

        // If ticket is provided, push comment to ticket and update lastMessage
        if (req.body.ticket) {
            await Ticket.findByIdAndUpdate(req.body.ticket, {
                $push: { comments: comment._id },
                lastMessage: new Date()
            });
        }

        // Populate user before returning
        await comment.populate('user', 'name email type');

        res.status(201).json({ success: true, data: comment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get all comments (optionally filter by ticket)
// @route   GET /api/comments
export const getComments = async (req, res) => {
    try {
        // Copy req.query
        const reqQuery = { ...req.query };

        // Fields to exclude
        const removeFields = ['select', 'sort', 'page', 'limit'];
        removeFields.forEach(param => delete reqQuery[param]);

        // Create query string
        let queryStr = JSON.stringify(reqQuery);
        queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

        let query = Comment.find(JSON.parse(queryStr))
            .populate('user', 'name email type');

        // Sort
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            query = query.sort(sortBy);
        } else {
            query = query.sort('createdAt');  // Chronological for chat
        }

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 50;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const total = await Comment.countDocuments(JSON.parse(queryStr));

        query = query.skip(startIndex).limit(limit);

        const comments = await query;

        const pagination = {};
        if (endIndex < total) {
            pagination.next = { page: page + 1, limit };
        }
        if (startIndex > 0) {
            pagination.prev = { page: page - 1, limit };
        }

        res.status(200).json({
            success: true,
            count: comments.length,
            total,
            pagination,
            data: comments
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get single comment
// @route   GET /api/comments/:id
export const getCommentById = async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id)
            .populate('user', 'name email type');

        if (!comment) {
            return res.status(404).json({ success: false, error: 'Comment not found' });
        }
        res.status(200).json({ success: true, data: comment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update comment
// @route   PUT /api/comments/:id
export const updateComment = async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id);

        if (!comment) {
            return res.status(404).json({ success: false, error: 'Comment not found' });
        }

        // Only the comment author or an admin can update
        if (comment.user.toString() !== req.user.id && req.user.type !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized to update this comment' });
        }

        comment.text = req.body.text || comment.text;
        await comment.save();
        await comment.populate('user', 'name email type');

        res.status(200).json({ success: true, data: comment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Delete comment (admin only)
// @route   DELETE /api/comments/:id
export const deleteComment = async (req, res) => {
    try {
        // Double-check admin role in controller
        if (req.user.type !== 'admin') {
            return res.status(403).json({ success: false, error: 'Only admins can delete comments' });
        }

        const comment = await Comment.findById(req.params.id);
        if (!comment) {
            return res.status(404).json({ success: false, error: 'Comment not found' });
        }

        // Delete attachment files from disk
        if (comment.attachments && comment.attachments.length > 0) {
            comment.attachments.forEach(filePath => {
                // filePath is like '/public/uploads/filename.jpg', remove leading '/'
                const fullPath = path.resolve(filePath.replace(/^\//, ''));
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            });
        }

        // Remove comment reference from the ticket's comments array
        await Ticket.findByIdAndUpdate(comment.ticket, {
            $pull: { comments: comment._id }
        });

        // Delete the comment
        await Comment.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};