import React from 'react';
import type { SourceVideo } from '../types/videos';
import { buildYoutubeEmbedUrl, formatYoutubeShortUrl } from '../utils/youtube';

interface Props {
	title?: string;
	description?: string;
	videos: SourceVideo[];
}

export const VideoGallery: React.FC<Props> = ({ title = 'Doprovodná videa', description, videos }) => {
	if (!videos.length) {
		return null;
	}

	return (
		<section className="source-video-display">
			<header>
				<h3>{title}</h3>
				{description && <p>{description}</p>}
			</header>
			<div className="video-card-grid video-card-grid--display">
				{videos.map((video) => {
					const embed = buildYoutubeEmbedUrl(video.videoId);
					const link = video.url || formatYoutubeShortUrl(video.videoId);
					return (
						<article key={video.id} className="video-card video-card--display">
							<div className="video-card__preview">
								<iframe
									src={embed}
									title={video.title || 'YouTube video'}
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
									allowFullScreen
								/>
							</div>
							<div className="video-card__body">
								{video.title && <h4>{video.title}</h4>}
								{video.description && <p>{video.description}</p>}
								<a href={link} target="_blank" rel="noreferrer" className="video-card__link">
									Otevřít video
								</a>
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
};
