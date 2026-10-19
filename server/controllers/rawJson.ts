import expressRaw, { RequestHandler } from "express";

export const rawJsonController: RequestHandler = (req, res, next) => {
  expressRaw.raw({ type: "application/json", limit: "1mb" })(req, res, next);
};
