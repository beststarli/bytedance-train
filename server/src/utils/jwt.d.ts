export interface JwtPayload {
    userId: string;
    phone: string;
}
export interface RefreshJwtPayload extends JwtPayload {
    jti: string;
    type: 'refresh';
}
export declare function signAccessToken(payload: JwtPayload): string;
export declare function signRefreshToken(payload: JwtPayload): {
    token: string;
    jti: `${string}-${string}-${string}-${string}-${string}`;
};
export declare function verifyAccessToken(token: string): JwtPayload & {
    type?: string;
};
export declare function verifyRefreshToken(token: string): RefreshJwtPayload;
export declare const verifyToken: typeof verifyAccessToken;
export declare function getRefreshTokenExpiresAt(token: string): Date;
//# sourceMappingURL=jwt.d.ts.map