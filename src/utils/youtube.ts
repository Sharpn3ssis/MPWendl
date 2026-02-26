const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export const buildYoutubeEmbedUrl = (videoId: string) =>
	`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;

export const formatYoutubeShortUrl = (videoId: string) => `https://youtu.be/${videoId}`;

export const parseYoutubeId = (input: string | undefined | null): string | null => {
	if (!input) {
		return null;
	}
	const candidate = input.trim();
	if (!candidate) {
		return null;
	}

	if (YOUTUBE_ID_REGEX.test(candidate)) {
		return candidate;
	}

	try {
		const normalized = candidate.startsWith('http') ? candidate : `https://${candidate}`;
		const url = new URL(normalized);
		const host = url.hostname.replace(/^www\./, '').toLowerCase();

		if (host === 'youtu.be') {
			const pathSegment = url.pathname.replace(/^\/+/, '');
			return YOUTUBE_ID_REGEX.test(pathSegment) ? pathSegment.slice(0, 11) : null;
		}

		if (host.includes('youtube.com')) {
			if (url.searchParams.has('v')) {
				const param = url.searchParams.get('v');
				return param && YOUTUBE_ID_REGEX.test(param) ? param : null;
			}

			const segments = url.pathname.split('/').filter(Boolean);
			if (segments.length >= 2 && segments[0] === 'embed') {
				const id = segments[1];
				return YOUTUBE_ID_REGEX.test(id) ? id : null;
			}
			if (segments.length >= 2 && segments[0] === 'shorts') {
				const id = segments[1];
				return YOUTUBE_ID_REGEX.test(id) ? id : null;
			}
		}
	} catch {
		return null;
	}

	return null;
};
