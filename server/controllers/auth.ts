import { RequestHandler } from "express";
import jwt from "jsonwebtoken";

export const authController: RequestHandler = (req, res, next) => {
  const jwtToken = req.cookies.token;

  if (!jwtToken) return res.sendStatus(401);

  try {
    const user = jwt.verify(jwtToken, process.env.JWT_SECRET as string);
    if (typeof user === "string") throw new Error("Invalid token");
    req.user = user as { uuid: string; discordId: string };
    next();
  } catch {
    res.sendStatus(401);
  }
};
