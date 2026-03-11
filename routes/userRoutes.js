import express from 'express';
import { createUser, getUsers, getUserById, updateUser, deleteUser, loginUser, changeUserRole } from '../controllers/userController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = express.Router();

router.post("/", createUser);          // create/register user
router.post("/login", loginUser);      // login

router.use(protect);                   // all routes below require JWT
router.get("/", authorize("admin"), getUsers);       // GET /api/users -> admin only
router.get("/:id", getUserById);                     // GET /api/users/:id -> any logged-in user (controller checks ownership/admin)
router.put("/:id", updateUser);                      // PUT /api/users/:id -> users update their own info, admin can update role
router.delete("/:id", authorize("admin"), deleteUser); // DELETE /api/users/:id -> admin only
router.put("/:id/role", authorize("admin"), changeUserRole); // PUT /api/users/:id/role -> admin only

export default router;