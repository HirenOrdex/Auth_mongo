import { Router } from "express";
import { register, login } from "../controllers/auth.controller";
import { loginValidations, registerValidations } from "../validations/auth.validation";

const router = Router();

router.post("/register",registerValidations, register);
router.post("/login", loginValidations, login);

export default router;
