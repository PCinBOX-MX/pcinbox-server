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
export {};
//# sourceMappingURL=resend.service.d.ts.map