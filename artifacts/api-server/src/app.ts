import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const safeErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const candidateStatus = (error as { status?: unknown } | null)?.status;
  const status =
    typeof candidateStatus === "number" &&
    candidateStatus >= 400 &&
    candidateStatus < 500
      ? candidateStatus
      : 500;
  request.log.error({ status }, "API request middleware failed");
  response.status(status).json({
    error:
      status === 413
        ? "The request body exceeds the supported size limit."
        : status === 400
          ? "The request could not be parsed."
          : "The server could not complete this request.",
  });
};

app.use(safeErrorHandler);

export default app;
