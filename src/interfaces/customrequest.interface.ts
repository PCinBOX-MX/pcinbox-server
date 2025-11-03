import { Request } from "express";

export default interface CustomRequestI extends Request {
  idUser?: any;
}
