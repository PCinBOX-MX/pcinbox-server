import { Response } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
import { sumProviderSubtotal } from "../../services/shipping/shippingCalculation.service";
export declare const saveCheckoutDraft: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getCheckoutDraft: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const clearCheckoutDraft: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const calculateInsurance: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const calculateVolumetric: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const calculateZoneShipping: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const calculateGroupQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getCheckoutSummary: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const buildPaymentPayload: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export { sumProviderSubtotal };
//# sourceMappingURL=checkout.controller.d.ts.map