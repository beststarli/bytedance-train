import { pool } from '../../utils/db'

export interface RetrievedPolicy {
	code: string
	category: string
	title: string
	content: string
	severity: string
	matchedKeywords: string[]
}

export async function retrieveReviewPolicies(text: string, categories: string[]): Promise<RetrievedPolicy[]> {
	const { rows } = await pool.query(
		`SELECT code, category, title, content, severity, keywords
		 FROM review_policies WHERE is_active = true ORDER BY updated_at DESC`,
	)
	const normalized = text.toLowerCase()
	return rows
		.map((row) => {
			const keywords: string[] = Array.isArray(row.keywords) ? row.keywords.map(String) : []
			const matchedKeywords = keywords.filter((keyword) => normalized.includes(keyword.toLowerCase()))
			return { ...row, matchedKeywords }
		})
		.filter((row) => row.matchedKeywords.length > 0 || categories.includes(row.category) || row.category === 'quality')
		.sort((a, b) => {
			const categoryDifference = Number(categories.includes(b.category)) - Number(categories.includes(a.category))
			return categoryDifference || b.matchedKeywords.length - a.matchedKeywords.length
		})
		.slice(0, 8)
}
