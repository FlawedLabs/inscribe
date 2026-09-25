const STORE_NAME = 'recentFiles';

export const openRecentDatabase = (): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		const request = indexedDB.open('inscribe', 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME))
				db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

export const listRecentFiles = (db: IDBDatabase): Promise<RecentFile[]> =>
	new Promise((resolve, reject) => {
		const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
		request.onsuccess = () =>
			resolve(
				(request.result as RecentFile[]).sort(
					(a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
				)
			);
		request.onerror = () => reject(request.error);
	});

export const saveRecentFile = async (db: IDBDatabase, file: File): Promise<void> => {
	const recent = await listRecentFiles(db);
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		for (const item of recent.filter((entry) => entry.name === file.name)) store.delete(item.id);
		store.add({ blob: file, name: file.name, createdAt: new Date() });
		for (const item of recent.filter((entry) => entry.name !== file.name).slice(4))
			store.delete(item.id);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
};
