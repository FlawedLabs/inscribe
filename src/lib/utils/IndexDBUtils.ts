import type { RecentFile } from '../../types/recentFile';

const STORE_NAME = 'recentFiles';
const MAX_RECENT_FILES = 5;

const newestFirst = (files: RecentFile[]): RecentFile[] =>
	files.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) || b.id - a.id);

export const openRecentDatabase = (): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		const request = indexedDB.open('inscribe', 1);
		let blocked = false;
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME))
				db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
		};
		request.onblocked = () => {
			blocked = true;
			reject(new Error('The recent files database is blocked by another tab.'));
		};
		request.onsuccess = () => {
			const database = request.result;
			if (blocked) {
				database.close();
				return;
			}
			database.onversionchange = () => database.close();
			resolve(database);
		};
		request.onerror = () => reject(request.error);
	});

export const listRecentFiles = (db: IDBDatabase): Promise<RecentFile[]> =>
	new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME);
		const request = transaction.objectStore(STORE_NAME).getAll();
		transaction.oncomplete = () => resolve(newestFirst(request.result as RecentFile[]));
		transaction.onabort = () =>
			reject(
				transaction.error ?? new DOMException('Reading recent files was aborted.', 'AbortError')
			);
	});

export const saveRecentFile = (db: IDBDatabase, file: File): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		// Reading and pruning in the same transaction serializes saves across tabs.
		const transaction = db.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.getAll();
		request.onsuccess = () => {
			const recent = newestFirst(request.result as RecentFile[]);
			const retained: RecentFile[] = [];
			for (const item of recent) {
				const duplicate =
					item.name === file.name &&
					item.blob.size === file.size &&
					(item.lastModified ?? (item.blob as File).lastModified) === file.lastModified;
				if (duplicate) store.delete(item.id);
				else retained.push(item);
			}
			store.add({
				blob: file,
				name: file.name,
				lastModified: file.lastModified,
				createdAt: new Date()
			});
			for (const item of retained.slice(MAX_RECENT_FILES - 1)) store.delete(item.id);
		};
		transaction.oncomplete = () => resolve();
		transaction.onabort = () =>
			reject(
				transaction.error ?? new DOMException('Saving recent files was aborted.', 'AbortError')
			);
	});
