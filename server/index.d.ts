declare namespace Express {
  export interface Request {
    user: {
      uuid: string;
      discordId: string;
    };
  }
}
