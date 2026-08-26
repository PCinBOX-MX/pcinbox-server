import "../config/loadEnv";
export declare const RESERVATION_STATUS_LABELS: Record<string, string>;
export declare const getReservationStatusLabel: (status: string) => string;
export declare const sendEmailResend: (to: string | string[], subject: string, idTemplate: string, variables: Record<string, string | number>) => Promise<any>;
type ReservationStatusEmailParams = {
    contactName: string;
    reference: string;
    status: string;
    statusText: string;
    statusReason?: string;
    statusMessage: string;
    appointmentDate: string;
    appointmentTime: string;
    deviceType: string;
    service: string;
    detailUrl: string;
};
export declare const getReservationStatusMessage: (status: string) => string;
export declare const sendReservationStatusUpdateEmail: (to: string, params: ReservationStatusEmailParams) => Promise<any>;
export type LicenseKeyEmailParams = {
    customerName: string;
    idOrder: number | string;
    productName: string;
    productDescription?: string | null;
    productUpc?: string | null;
    productSku?: string | null;
    quantity?: number;
    licenseKeys: string[];
    instructions?: string;
    productImageUrl?: string | null;
    platformUrl?: string | null;
};
export declare function resolveProductImageUrl(raw: unknown): string | null;
/** Correo de entrega digital con HTML inline (1..N claves). */
export declare const sendLicenseKeyEmail: (to: string, params: LicenseKeyEmailParams) => Promise<{
    status?: number;
    error?: string;
} | void>;
export {};
//# sourceMappingURL=resend.service.d.ts.map