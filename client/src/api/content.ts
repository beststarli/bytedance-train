export const getCotents = async (sort: string, offset: number) => {
    const url = `/api/content/feed?sort=${sort}&limit=10&offset=${offset}`
    try {
        const res = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
            },
        })
        if (!res.ok) {
            throw new Error(`请求失败: ${res.status}`)
        }
        const data = await res.json()
        return data
    } catch (error) {
        console.error('获取内容失败:', error)
        throw error
    }
}