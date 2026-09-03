import type { PageServerLoad } from './$types';

function sanitizeNextPath(nextPath: string | null) {
	if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
		return '/';
	}

	return nextPath;
}

export const load: PageServerLoad = ({ url }) => ({
	reason: url.searchParams.get('reason') ?? '',
	next: sanitizeNextPath(url.searchParams.get('next'))
});
