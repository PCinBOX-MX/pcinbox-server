export declare const REGISTER_CODE_TTL_MINUTES = 15;
export declare const REGISTER_MAX_RESENDS = 3;
export declare const REGISTER_RESEND_COOLDOWN_SECONDS = 60;
export declare const REGISTER_MAX_VERIFY_ATTEMPTS = 5;
export declare const REGISTER_VERIFY_TEMPLATE_ID = "verification-code";
export type RegisterDraftInput = {
    name: string;
    lastname: string;
    email: string;
    phone: string;
    password: string;
};
export declare function requestRegisterVerificationCode(input: RegisterDraftInput): Promise<{
    ok: false;
    status: number;
    message: string;
    data?: never;
} | {
    ok: false;
    status: number;
    message: string;
    data: {
        resendsRemaining: number;
        maxResends: number;
        retryAfterSeconds?: never;
        email?: never;
        expiresInMinutes?: never;
        cooldownSeconds?: never;
    };
} | {
    ok: false;
    status: number;
    message: string;
    data: {
        retryAfterSeconds: number;
        resendsRemaining?: never;
        maxResends?: never;
        email?: never;
        expiresInMinutes?: never;
        cooldownSeconds?: never;
    };
} | {
    ok: true;
    status: number;
    message: string;
    data: {
        email: string;
        expiresInMinutes: number;
        resendsRemaining: number;
        maxResends: number;
        cooldownSeconds: number;
        retryAfterSeconds?: never;
    };
}>;
export declare function resendRegisterVerificationCode(emailRaw: string): Promise<{
    ok: false;
    status: number;
    message: string;
    data?: never;
} | {
    ok: false;
    status: number;
    message: string;
    data: {
        resendsRemaining: number;
        retryAfterSeconds?: never;
        email?: never;
        expiresInMinutes?: never;
        maxResends?: never;
        cooldownSeconds?: never;
    };
} | {
    ok: false;
    status: number;
    message: string;
    data: {
        retryAfterSeconds: number;
        resendsRemaining?: never;
        email?: never;
        expiresInMinutes?: never;
        maxResends?: never;
        cooldownSeconds?: never;
    };
} | {
    ok: true;
    status: number;
    message: string;
    data: {
        email: string;
        expiresInMinutes: number;
        resendsRemaining: number;
        maxResends: number;
        cooldownSeconds: number;
        retryAfterSeconds?: never;
    };
}>;
export declare function confirmRegisterVerificationCode(params: {
    email: string;
    code: string;
}): Promise<{
    ok: false;
    status: number;
    message: string;
    data?: never;
} | {
    ok: true;
    status: number;
    message: string;
    data: {
        email: string;
        token: string;
        idUser: string;
        name: string;
        lastname: string | null;
        role: import("@prisma/client").$Enums.users_role;
        totalFavorites: number;
    };
}>;
//# sourceMappingURL=registerEmailVerification.service.d.ts.map