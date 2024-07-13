export const saveBlob = (db: IDBDatabase, storeName: string, blob: Blob, name: string) => {
	const transaction = db.transaction([storeName], 'readwrite');
	const store = transaction.objectStore(storeName);

	// Blob to save
	const fileRecord = {
		blob,
		name,
		createdAt: new Date()
	};

	const request = store.add(fileRecord);

	request.onsuccess = () => {
		console.log('File saved successfully');
	};

	request.onerror = (event) => {
		console.error('Error saving file:', (event.target as IDBRequest).error);
	};
};
