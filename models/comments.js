import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    text: {
        type: String,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ticket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        required: true
    },
    attachments: {
        type: [String],
        default: []
    }
}, {
    timestamps: true
});

export default mongoose.model('Comment', commentSchema);