import { api } from './api'

export function getReviews<T>() {
    return api<{ reviews: T[] }>('/api/content/reviews').then((data) => data.reviews)
}

export function getReviewDetail<T>(reviewId: string) {
    return api<T>(`/api/content/reviews/${reviewId}`)
}

export function generateReviewRewrites(reviewId: string) {
    return api(`/api/content/review-jobs/${reviewId}/rewrite`, { method: 'POST' })
}

export function applyRewriteProposal<T>(proposalId: string) {
    return api<{ version: T }>(`/api/content/rewrite-proposals/${proposalId}/apply`, { method: 'POST' })
        .then((data) => data.version)
}

export function rejectRewriteProposal(proposalId: string) {
    return api(`/api/content/rewrite-proposals/${proposalId}/reject`, { method: 'POST' })
}
