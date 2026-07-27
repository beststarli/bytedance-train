import { api } from './api'

export const userLoginByPassword = async (account: string, password: string) => {
    return api<{ accessToken: string; user: any }>('/api/auth/login-password', {
            method: 'POST',
            body: JSON.stringify({ account, password }),
    })
}

export const userRegister = async (payload: {
    nickname: string
    phone: string
    email: string
    password: string
    confirmPassword: string
}) => {
    return api<{ accessToken: string; user: any }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
            nickname: payload.nickname,
            phone: payload.phone,
            email: payload.email,
            password: payload.password,
            confirm_password: payload.confirmPassword,
        }),
    })
}
