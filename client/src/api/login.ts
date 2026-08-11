import { api } from './api'

export function updateProfile<T>(payload: { nickname: string; email: string }) {
    return api<{ user: T }>('/api/auth/profile', { method: 'PUT', body: JSON.stringify(payload) })
        .then((data) => data.user)
}

export function updatePassword(newPassword: string, confirmPassword: string) {
    return api('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ new_password: newPassword, confirm_password: confirmPassword }),
    })
}

export function updateAvatar<T>(image: string) {
    return api<{ user: T }>('/api/auth/avatar', { method: 'POST', body: JSON.stringify({ image }) })
        .then((data) => data.user)
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
