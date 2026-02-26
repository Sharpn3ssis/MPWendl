import React, { useCallback, useMemo, useState, useRef } from 'react';
import type { SourceVideo } from '../types/videos';
import { buildYoutubeEmbedUrl, formatYoutubeShortUrl, parseYoutubeId } from '../utils/youtube';

const MAX_VIDEOS_DEFAULT = 8;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Allowed file types: images, PDF, audio (NOT video - use YouTube URL)
const ALLOWED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'application/pdf',
	'audio/mpeg',
	'audio/wav',
	'audio/ogg',
	'audio/mp4',
];

const isAllowedFileType = (file: File) => {
	return ALLOWED_MIME_TYPES.includes(file.type) || 
		file.type.startsWith('image/') || 
		file.type.startsWith('audio/');
};

interface Props {
	videos: SourceVideo[];
	onChange: (videos: SourceVideo[]) => void;
	maxVideos?: number;
}

interface UploadedFile {
	id: string;
	file: File;
	preview?: string;
}

const generateClientId = () =>
	typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const formatFileSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const VideoGalleryEditor: React.FC<Props> = ({ videos, onChange, maxVideos = MAX_VIDEOS_DEFAULT }) => {
	const [newVideoUrl, setNewVideoUrl] = useState('');
	const [error, setError] = useState('');
	const [isDragging, setIsDragging] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
	const dropZoneRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const addDisabled = videos.length >= maxVideos;

	const handleAddVideo = useCallback(() => {
		setError('');
		const trimmed = newVideoUrl.trim();
		if (!trimmed) {
			setError('Vložte YouTube odkaz.');
			return;
		}
		const id = parseYoutubeId(trimmed);
		if (!id) {
			setError('Neplatný YouTube odkaz.');
			return;
		}
		if (addDisabled) {
			setError(`Max ${maxVideos} videí.`);
			return;
		}

		onChange([...videos, {
			id: generateClientId(),
			videoId: id,
			title: '',
			description: '',
			url: formatYoutubeShortUrl(id),
		}]);
		setNewVideoUrl('');
	}, [newVideoUrl, videos, maxVideos, addDisabled, onChange]);

	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
			setIsDragging(false);
		}
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const processFiles = useCallback((files: File[]) => {
		setError('');
		const validFiles: UploadedFile[] = [];
		
		for (const file of files) {
			if (!isAllowedFileType(file)) {
				setError('Povoleny pouze obrázky, PDF a audio. Pro video použijte YouTube URL.');
				continue;
			}
			if (file.size > MAX_FILE_SIZE_BYTES) {
				setError(`"${file.name}" je příliš velký (max ${MAX_FILE_SIZE_MB} MB).`);
				continue;
			}
			
			const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
			validFiles.push({ id: generateClientId(), file, preview });
		}
		
		if (validFiles.length > 0) {
			setUploadedFiles(prev => [...prev, ...validFiles]);
		}
	}, []);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		// Check for URL text first (YouTube)
		const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
		if (text) {
			const id = parseYoutubeId(text.trim());
			if (id && !addDisabled) {
				onChange([...videos, {
					id: generateClientId(),
					videoId: id,
					title: '',
					description: '',
					url: formatYoutubeShortUrl(id),
				}]);
				return;
			}
		}

		// Handle files
		const files = Array.from(e.dataTransfer.files);
		if (files.length > 0) {
			processFiles(files);
		}
	}, [videos, addDisabled, onChange, processFiles]);

	const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length > 0) {
			processFiles(files);
		}
		e.target.value = '';
	}, [processFiles]);

	const removeFile = (fileId: string) => {
		setUploadedFiles(prev => {
			const file = prev.find(f => f.id === fileId);
			if (file?.preview) URL.revokeObjectURL(file.preview);
			return prev.filter(f => f.id !== fileId);
		});
	};

	const removeVideo = (videoId: string) => {
		onChange(videos.filter((video) => video.id !== videoId));
	};

	const helperText = useMemo(() => {
		if (addDisabled) return `Maximum ${maxVideos} videí`;
		return `${videos.length}/${maxVideos} videí`;
	}, [addDisabled, videos.length, maxVideos]);

	return (
		<section className="media-simple">
			<div className="media-simple-header">
				<h3>🎬 Média</h3>
				<span className="media-simple-count">{helperText}</span>
			</div>

			{/* Drop Zone */}
			<div
				ref={dropZoneRef}
				className={`media-dropzone ${isDragging ? 'dragging' : ''} ${addDisabled ? 'disabled' : ''}`}
				onDragEnter={handleDragEnter}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				<div className="media-dropzone-content">
					<span className="media-dropzone-icon">{isDragging ? '📥' : '📁'}</span>
					<span className="media-dropzone-text">
						{isDragging ? 'Pusťte soubor' : 'Přetáhněte soubory nebo YouTube odkaz'}
					</span>
					<span className="media-dropzone-hint">Max {MAX_FILE_SIZE_MB} MB • Obrázky, PDF, audio</span>
					<button
						type="button"
						className="media-browse-btn"
						onClick={() => fileInputRef.current?.click()}
					>
						Procházet
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*,application/pdf,audio/*"
						multiple
						style={{ display: 'none' }}
						onChange={handleFileSelect}
					/>
				</div>
			</div>

			{/* YouTube URL Input */}
			<div className="media-url-row">
				<input
					type="text"
					className="media-url-input"
					placeholder="YouTube URL…"
					value={newVideoUrl}
					onChange={(e) => setNewVideoUrl(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && handleAddVideo()}
					disabled={addDisabled}
				/>
				<button
					type="button"
					className="media-url-btn"
					onClick={handleAddVideo}
					disabled={addDisabled || !newVideoUrl.trim()}
				>
					+ Přidat
				</button>
			</div>

			{error && <div className="media-error">⚠️ {error}</div>}

			{/* Uploaded Files */}
			{uploadedFiles.length > 0 && (
				<div className="media-files">
					<h4>📎 Nahrané soubory</h4>
					<div className="media-file-list">
						{uploadedFiles.map((f) => (
							<div key={f.id} className="media-file-item">
								{f.preview && <img src={f.preview} alt="" className="media-file-thumb" />}
						{!f.preview && <span className="media-file-icon">{f.file.type.startsWith('audio/') ? '🎵' : '📄'}</span>}
								<div className="media-file-info">
									<span className="media-file-name">{f.file.name}</span>
									<span className="media-file-size">{formatFileSize(f.file.size)}</span>
								</div>
								<button type="button" className="media-file-remove" onClick={() => removeFile(f.id)}>✕</button>
							</div>
						))}
					</div>
					<p className="media-file-note">⚠️ Nahrávání na server zatím není implementováno.</p>
				</div>
			)}

			{/* YouTube Videos */}
			{videos.length > 0 && (
				<div className="media-videos">
					{videos.map((video) => (
						<div key={video.id} className="media-video-item">
							<div className="media-video-thumb">
								<iframe 
									src={buildYoutubeEmbedUrl(video.videoId)} 
									title={video.title || 'Video'} 
									allowFullScreen 
								/>
							</div>
							<div className="media-video-info">
								<a 
									href={video.url || formatYoutubeShortUrl(video.videoId)} 
									target="_blank" 
									rel="noreferrer"
									className="media-video-link"
								>
									{video.videoId}
								</a>
								<button 
									type="button" 
									className="media-video-remove"
									onClick={() => removeVideo(video.id)}
								>
									🗑️
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
};
