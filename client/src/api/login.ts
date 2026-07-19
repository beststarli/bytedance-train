import { api } from './api'

export const sendLoginCode = async (phone: string) => {
    return api('/api/auth/send-code', {
            method: 'POST',
            body: JSON.stringify({ phone }),
    })
}

export const userLoginByCode = async (phone: string, code: string) => {
    return api<{ accessToken: string; user: any }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ phone, code }),
    })
}

export const changePassword = async (oldPassword: string | undefined, newPassword: string) => {
    try {
        return await api('/api/auth/password', {
            method: 'PUT',
            body: JSON.stringify({
                old_password: oldPassword || undefined,
                new_password: newPassword,
            }),
        })
    } catch (err: any) {
        throw new Error(err.message || '密码修改失败')
    }
}

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
