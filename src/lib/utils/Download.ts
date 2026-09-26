/** Keep the URL alive briefly so the browser can start consuming the download. */
const DOWNLOAD_URL_LIFETIME_MS = 7000;

export const downloadBlob = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	try {
		document.body.append(link);
		link.click();
	} finally {
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
	}
};
