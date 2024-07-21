export const saveBlob = (db: IDBDatabase, storeName: string, blob: Blob | File, name: string) => {
	handleRecentFiles(db);
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

const handleRecentFiles = (db: IDBDatabase) => {
	const request = db.transaction('recentFiles').objectStore('recentFiles').getAll();

	request.onsuccess = () => {
		const files = request.result;
		if (files.length === 5) {
			deleteOldestFile(db, files[0].id);
		}
	};

	request.onerror = (err) => {
		console.error(`Error to get files information: ${err}`);
	};
};

const deleteOldestFile = (db: IDBDatabase, key: IDBValidKey) => {
	let transaction = db.transaction(['recentFiles'], 'readwrite');
	let request = transaction.objectStore('recentFiles').delete(key);

	request.onsuccess = () => {
		console.log(`Oldest file deleted: ${request.result}`);
	};

	request.onerror = (err) => {
		console.error(`Error to oldest file: ${err}`);
	};
};
