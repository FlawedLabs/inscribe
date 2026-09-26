import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export type ImportedPDFMetadata = {
	name: string;
	size: string;
	pages: number;
	version: string;
	title: string;
	author: string;
	subject: string;
	keywords: string;
	creator: string;
	producer: string;
	created: string;
	modified: string;
};

const MISSING_VALUE = 'Non renseigné';

const optional = <T>(read: () => T): T | undefined => {
	try {
		return read();
	} catch {
		// Invalid optional metadata must not prevent a PDF from being edited.
		return undefined;
	}
};

const present = (value: string | undefined) => value?.trim() || MISSING_VALUE;
const formatDate = (value: Date | undefined): string => {
	if (!value || Number.isNaN(value.getTime())) return 'Non renseignée';
	return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(value);
};
const formatSize = (bytes: number): string => {
	const unit = bytes >= 1024 * 1024 ? 'Mo' : bytes >= 1024 ? 'Ko' : 'octets';
	const divisor = unit === 'Mo' ? 1024 * 1024 : unit === 'Ko' ? 1024 : 1;
	return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / divisor)} ${unit}`;
};

/** Snapshot of the imported file; subsequent page edits must not change these values. */
export const readPDFMetadata = (
	file: Pick<File, 'name' | 'size'>,
	document: PDFDocument
): ImportedPDFMetadata => ({
	name: file.name,
	size: formatSize(file.size),
	pages: document.getPageCount(),
	version: 'Non renseignée',
	title: present(optional(() => document.getTitle())),
	author: present(optional(() => document.getAuthor())),
	subject: present(optional(() => document.getSubject())),
	keywords: present(optional(() => document.getKeywords())),
	creator: present(optional(() => document.getCreator())),
	producer: present(optional(() => document.getProducer())),
	created: formatDate(optional(() => document.getCreationDate())),
	modified: formatDate(optional(() => document.getModificationDate()))
});

export const loadPDFMetadata = async (
	original: ImportedPDFMetadata,
	viewer: Pick<PDFDocumentProxy, 'getMetadata'>
): Promise<ImportedPDFMetadata> => {
	try {
		const { info } = await viewer.getMetadata();
		if (!info || typeof info !== 'object') return original;
		const values = info as Record<string, unknown>;
		const fallback = (current: string, key: string): string => {
			const value = values[key];
			return current === MISSING_VALUE && typeof value === 'string' ? present(value) : current;
		};
		return {
			...original,
			version:
				typeof values.PDFFormatVersion === 'string'
					? `PDF ${values.PDFFormatVersion}`
					: original.version,
			title: fallback(original.title, 'Title'),
			author: fallback(original.author, 'Author'),
			subject: fallback(original.subject, 'Subject'),
			keywords: fallback(original.keywords, 'Keywords'),
			creator: fallback(original.creator, 'Creator'),
			producer: fallback(original.producer, 'Producer')
		};
	} catch {
		return original;
	}
};
