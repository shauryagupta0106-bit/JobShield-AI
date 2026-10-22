import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jobshieldRouter from "./jobshield";

const router: IRouter = Router();

router.use(healthRouter);
router.use(jobshieldRouter);

export default router;
