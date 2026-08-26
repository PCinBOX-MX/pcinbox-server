import { TECHSMART_PROVIDER_ID } from "@pcinbox/core";
export { TECHSMART_PROVIDER_ID };
export declare const TECHSMART_DISABLED_BRANCH_NAMES: readonly [];
export declare function normalizeBranchName(name?: string | null): string;
export declare function isTechSmartBranchDisabled(branchName?: string | null): boolean;
export declare function getTechSmartBranchValidationError(providerId: number | null | undefined, storeId: number | null): Promise<string | null>;
//# sourceMappingURL=techsmart-branches.d.ts.map