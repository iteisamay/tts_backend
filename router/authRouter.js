import express from 'express';
import { createUser,userLogin } from '../controller/authController.js';
const authRouter = express.Router();


authRouter.post('/create/user', createUser);
authRouter.post('/login', userLogin);

export default authRouter;