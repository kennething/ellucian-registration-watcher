import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import ENV from "../../env";

export const authController: RequestHandler = (req, res, next) => {
  const jwtToken = req.cookies.token;

  if (!jwtToken) return res.sendStatus(401);
  if (!ENV.JWT_SECRET) {
    console.error("JWT_SECRET is not set in the environment variables.");
    return res.sendStatus(500);
  }

  try {
    const user = jwt.verify(jwtToken, ENV.JWT_SECRET);
    if (typeof user === "string") throw new Error("Invalid token");
    req.user = user as { uuid: string; discordId: string };
    next();
  } catch {
    res.sendStatus(401);
  }
};
