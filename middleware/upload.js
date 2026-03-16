import multer from "multer";
import fs from "fs";
import path from "path";

fs.mkdirSync('public/uploads', { recursive: true });

// Use memory storage so files are held in buffer until we confirm success
const storage = multer.memoryStorage();

const upload = multer({ storage });

export function saveFilesToDisk(files) {
    if (!files || files.length === 0) return [];

    return files.map(file => {
        const filename = Date.now() + '-' + file.originalname;
        const filePath = path.join('public/uploads', filename);
        fs.writeFileSync(filePath, file.buffer);
        return '/public/uploads/' + filename;
    });
}

export default upload;
