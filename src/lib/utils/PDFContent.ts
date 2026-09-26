import {
	PDFCheckBox,
	PDFDropdown,
	PDFArray,
	PDFContentStream,
	PDFRef,
	PDFRadioGroup,
	PDFTextField,
	PDFDict,
	PDFName,
	PDFNumber,
	PDFString,
	degrees,
	pushGraphicsState,
	popGraphicsState,
	concatTransformationMatrix,
	rgb,
	type PDFDocument,
	type PDFPage,
	type PDFFont
} from 'pdf-lib';
import { cloneDocument } from './PDFLibHelper';
import fontURL from '@fontsource/mulish/files/mulish-latin-400-normal.woff?url';

export type ContentKind = 'text' | 'text-field' | 'checkbox' | 'dropdown' | 'radio';
export type FieldKind = Exclude<ContentKind, 'text'>;
export type ContentPlacement = {
	page: number;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
};
export type ContentSettings = {
	kind: ContentKind;
	text: string;
	fontSize: number;
	color: string;
	name: string;
	value: string;
	checked: boolean;
	required: boolean;
	multiline: boolean;
	options: string[];
};
export type PDFFormField = {
	name: string;
	kind: FieldKind | 'placed-text';
	value: string;
	checked: boolean;
	required: boolean;
	multiline: boolean;
	options: string[];
	page: number;
	widgetIndex: number;
	rect: [number, number, number, number];
	option?: string;
	companion?: { name: string; widgetIndex: number };
};
export class PDFContentError extends Error {}

let fontBytes: Promise<ArrayBuffer> | undefined;
const embedContentFont = async (document: PDFDocument): Promise<PDFFont> => {
	const { default: fontkit } = await import('@pdf-lib/fontkit');
	document.registerFontkit(fontkit);
	fontBytes ??= fetch(fontURL)
		.then(async (response) => {
			if (!response.ok) throw new PDFContentError('La police n’a pas pu être chargée. Réessayez.');
			return response.arrayBuffer();
		})
		.catch((cause) => {
			fontBytes = undefined;
			throw cause;
		});
	const font = await document.embedFont(await fontBytes, { subset: true });
	// Convert the WOFF to an embedded TrueType font and keep its supported characters
	// available when a PDF reader fills an initially empty form field.
	font.encodeText(String.fromCodePoint(...font.getCharacterSet().filter((point) => point >= 32)));
	return font;
};

const validateText = (font: PDFFont, text: string) => {
	const supported = new Set(font.getCharacterSet());
	if (
		Array.from(text).some(
			(letter) => !/[\n\r\t]/.test(letter) && !supported.has(letter.codePointAt(0)!)
		)
	)
		throw new PDFContentError(
			'Certains caractères ne sont pas pris en charge par cette police. Retirez-les pour continuer.'
		);
};

const wrapText = (text: string, font: PDFFont, size: number, width: number) => {
	const lines: string[] = [];
	for (const paragraph of text.replaceAll('\r\n', '\n').replaceAll('\t', '    ').split('\n')) {
		let line = '';
		for (const letter of paragraph) {
			if (font.widthOfTextAtSize(letter, size) > width)
				throw new PDFContentError(
					'La zone est trop étroite. Augmentez sa largeur ou réduisez la taille du texte.'
				);
			if (font.widthOfTextAtSize(line + letter, size) > width) {
				const space = line.lastIndexOf(' ');
				lines.push(space > 0 ? line.slice(0, space) : line);
				line = space > 0 ? line.slice(space + 1) : '';
				if (font.widthOfTextAtSize(line + letter, size) > width) {
					lines.push(line);
					line = '';
				}
			}
			line += letter;
		}
		lines.push(line);
	}
	return lines;
};

const registerFormFont = (document: PDFDocument, font: PDFFont) => {
	const form = document.getForm().acroForm.dict;
	const resources = form.lookupMaybe(PDFName.of('DR'), PDFDict) ?? document.context.obj({});
	const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict) ?? document.context.obj({});
	// Readers need the font in AcroForm resources when users fill a field after export.
	fonts.set(PDFName.of(font.name), font.ref);
	resources.set(PDFName.of('Font'), fonts);
	form.set(PDFName.of('DR'), resources);
};

export const listFormFields = (document: PDFDocument): PDFFormField[] => {
	const result: PDFFormField[] = [];
	const fields = (() => {
		try {
			return document.catalog.getAcroForm() ? document.getForm().getFields() : [];
		} catch {
			return [];
		}
	})();
	const isRadioLabel = (field: (typeof fields)[number]) =>
		field instanceof PDFTextField &&
		field.acroField.dict.get(PDFName.of('InscribeType'))?.toString() === '/RadioLabel';
	for (const field of fields) {
		if (!(
			field instanceof PDFTextField ||
			field instanceof PDFCheckBox ||
			field instanceof PDFDropdown ||
			field instanceof PDFRadioGroup
		))
			continue;
		if (isRadioLabel(field)) continue;
		let widgets;
		try {
			widgets = field.acroField.getWidgets();
		} catch {
			continue;
		}
		for (const [widgetIndex, widget] of widgets.entries()) {
			try {
				const pageIndex = document.getPages().findIndex((page) => {
					if (widget.P()?.toString() === page.ref.toString()) return true;
					const annotations = page.node.Annots();
					if (!annotations) return false;
					for (let index = 0; index < annotations.size(); index++)
						if (document.context.lookup(annotations.get(index)) === widget.dict) return true;
					return false;
				});
				let { x, y, width, height } = widget.getRectangle();
				if (
					pageIndex < 0 ||
					![x, y, width, height].every(Number.isFinite) ||
					width <= 0 ||
					height <= 0
				)
					continue;
				const marker = field.acroField.dict.get(PDFName.of('InscribeType'))?.toString();
				const kind =
					marker === '/PlacedText'
						? 'placed-text'
						: field instanceof PDFTextField
							? 'text-field'
							: field instanceof PDFCheckBox
								? 'checkbox'
								: field instanceof PDFDropdown
									? 'dropdown'
									: 'radio';
				let companion: PDFFormField['companion'];
				if (field instanceof PDFRadioGroup) {
					const label = fields.find((candidate) => {
						if (!isRadioLabel(candidate)) return false;
						const groupName = candidate.acroField.dict.get(PDFName.of('IRG'));
						const optionIndex = candidate.acroField.dict.get(PDFName.of('IRO'));
						return (
							groupName instanceof PDFString &&
							groupName.decodeText() === field.getName() &&
							optionIndex instanceof PDFNumber &&
							optionIndex.asNumber() === widgetIndex
						);
					});
					if (label instanceof PDFTextField) {
						const labelWidget = label.acroField.getWidgets()[0];
						if (labelWidget) {
							const labelRect = labelWidget.getRectangle();
							const right = Math.max(x + width, labelRect.x + labelRect.width);
							const top = Math.max(y + height, labelRect.y + labelRect.height);
							companion = { name: label.getName(), widgetIndex: 0 };
							x = Math.min(x, labelRect.x);
							y = Math.min(y, labelRect.y);
							width = right - x;
							height = top - y;
						}
					}
				}
				const radioOption = field instanceof PDFRadioGroup ? field.getOptions()[widgetIndex] : '';
				result.push({
					name: field.getName(),
					kind,
					value:
						kind === 'placed-text'
							? ((
									field.acroField.dict.get(PDFName.of('InscribeContent')) as PDFString | undefined
								)?.decodeText() ?? '')
							: field instanceof PDFTextField
								? (field.getText() ?? '')
								: field instanceof PDFDropdown
									? (field.getSelected()[0] ?? '')
									: field instanceof PDFRadioGroup
										? (field.getSelected() ?? '')
										: '',
					checked:
						field instanceof PDFCheckBox
							? field.isChecked()
							: field instanceof PDFRadioGroup && field.getSelected() === radioOption,
					required: field.isRequired(),
					multiline: field instanceof PDFTextField && field.isMultiline(),
					options:
						field instanceof PDFDropdown || field instanceof PDFRadioGroup
							? field.getOptions()
							: [],
					page: pageIndex + 1,
					widgetIndex,
					rect: [x, y, x + width, y + height],
					...(field instanceof PDFRadioGroup && radioOption ? { option: radioOption } : {}),
					...(companion ? { companion } : {})
				});
			} catch {
				// Ignore malformed imported widgets without blocking the PDF editor.
				continue;
			}
		}
	}
	return result;
};

const setFieldValue = (
	field: PDFTextField | PDFCheckBox | PDFDropdown | PDFRadioGroup,
	settings: ContentSettings,
	font: PDFFont
) => {
	if (field instanceof PDFTextField) {
		validateText(font, settings.value);
		settings.multiline ? field.enableMultiline() : field.disableMultiline();
		field.setText(settings.value);
	} else if (field instanceof PDFCheckBox) {
		settings.checked ? field.check() : field.uncheck();
	} else if (field instanceof PDFDropdown) {
		const options = [...new Set(settings.options.map((option) => option.trim()).filter(Boolean))];
		if (!options.length) throw new PDFContentError('Ajoutez au moins un choix à la liste.');
		options.forEach((option) => validateText(font, option));
		if (settings.value && !options.includes(settings.value))
			throw new PDFContentError('La valeur doit correspondre à un choix de la liste.');
		field.setOptions(options);
		field.clear();
		if (settings.value) field.select(settings.value);
	} else {
		const options = field.getOptions();
		if (settings.value && !options.includes(settings.value))
			throw new PDFContentError('La valeur doit correspondre Ã  un choix du groupe.');
		if (settings.value) field.select(settings.value);
		else field.clear();
	}
	settings.required ? field.enableRequired() : field.disableRequired();
	if (field instanceof PDFCheckBox) field.updateAppearances();
	else if (field instanceof PDFRadioGroup) field.updateAppearances();
	else field.updateAppearances(font);
};

const drawPlacedText = (
	page: PDFPage,
	field: PDFTextField,
	text: string,
	font: PDFFont,
	fontSize: number,
	color: string
) => {
	const widget = field.acroField.getWidgets()[0];
	if (!widget) throw new PDFContentError('La zone de texte ne peut pas être déplacée.');
	const { x, y, height } = widget.getRectangle();
	const rotation = widget.getAppearanceCharacteristics()?.getRotation() ?? 0;
	const radians = (rotation * Math.PI) / 180;
	const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255);
	const ascent = font.heightAtSize(fontSize, { descender: false });
	const offset = height - ascent;
	const pageState = page as unknown as { contentStream?: unknown; contentStreamRef?: PDFRef };
	pageState.contentStream = undefined;
	page.drawText(text, {
		x: x - Math.sin(radians) * offset,
		y: y + Math.cos(radians) * offset,
		font,
		size: fontSize,
		lineHeight: Math.max(fontSize * 1.3, font.heightAtSize(fontSize)),
		rotate: degrees(rotation),
		color: rgb(channels[0], channels[1], channels[2])
	});
	const streamRef = pageState.contentStreamRef;
	pageState.contentStream = undefined;
	if (!streamRef) throw new PDFContentError('Le texte n’a pas pu être enregistré.');
	field.acroField.dict.set(PDFName.of('InscribeStream'), streamRef);
};

const removePlacedTextStreams = (document: PDFDocument, page: PDFPage, field: PDFTextField) => {
	const contents = page.node.Contents();
	if (!(contents instanceof PDFArray))
		throw new PDFContentError('Le texte ajouté n’est plus disponible dans le PDF.');
	for (const key of ['InscribePrefix', 'InscribeStream', 'InscribeSuffix']) {
		const reference = field.acroField.dict.get(PDFName.of(key));
		if (!(reference instanceof PDFRef)) {
			if (key === 'InscribeStream')
				throw new PDFContentError('Le texte ajouté n’est plus disponible dans le PDF.');
			continue;
		}
		const index = Array.from({ length: contents.size() }, (_, item) => item).find(
			(item) => contents.get(item).toString() === reference.toString()
		);
		if (index !== undefined) contents.remove(index);
		document.context.delete(reference);
		field.acroField.dict.delete(PDFName.of(key));
	}
	field.acroField.dict.delete(PDFName.of('InscribeMoveX'));
	field.acroField.dict.delete(PDFName.of('InscribeMoveY'));
};

const getWidgetPage = (document: PDFDocument, field: PDFTextField) => {
	const widget = field.acroField.getWidgets()[0];
	const pageIndex = document.getPages().findIndex((page) => {
		if (widget?.P()?.toString() === page.ref.toString()) return true;
		const annotations = page.node.Annots();
		if (!widget || !annotations) return false;
		return Array.from({ length: annotations.size() }, (_, index) => annotations.get(index)).some(
			(reference) => document.context.lookup(reference) === widget.dict
		);
	});
	if (!widget || pageIndex < 0)
		throw new PDFContentError('Le bloc de texte n’est plus présent sur cette page.');
	return { widget, page: document.getPage(pageIndex) };
};

const translatePlacedText = (
	document: PDFDocument,
	page: PDFPage,
	field: PDFTextField,
	deltaX: number,
	deltaY: number
) => {
	const streamRef = field.acroField.dict.get(PDFName.of('InscribeStream'));
	const contents = page.node.Contents();
	if (!(streamRef instanceof PDFRef) || !(contents instanceof PDFArray))
		throw new PDFContentError('Le flux du texte n’est plus disponible.');
	for (const key of ['InscribePrefix', 'InscribeSuffix']) {
		const reference = field.acroField.dict.get(PDFName.of(key));
		if (!(reference instanceof PDFRef)) continue;
		const index = Array.from({ length: contents.size() }, (_, item) => item).find(
			(item) => contents.get(item).toString() === reference.toString()
		);
		if (index !== undefined) contents.remove(index);
		document.context.delete(reference);
		field.acroField.dict.delete(PDFName.of(key));
	}
	const streamIndex = Array.from({ length: contents.size() }, (_, item) => item).find(
		(item) => contents.get(item).toString() === streamRef.toString()
	);
	if (streamIndex === undefined)
		throw new PDFContentError('Le flux du texte n’est plus disponible.');
	const previousX = field.acroField.dict.get(PDFName.of('InscribeMoveX'));
	const previousY = field.acroField.dict.get(PDFName.of('InscribeMoveY'));
	const totalX = (previousX instanceof PDFNumber ? previousX.asNumber() : 0) + deltaX;
	const totalY = (previousY instanceof PDFNumber ? previousY.asNumber() : 0) + deltaY;
	const prefix = PDFContentStream.of(document.context.obj({}), [
		pushGraphicsState(),
		concatTransformationMatrix(1, 0, 0, 1, totalX, totalY)
	]);
	const suffix = PDFContentStream.of(document.context.obj({}), [popGraphicsState()]);
	const prefixRef = document.context.register(prefix);
	const suffixRef = document.context.register(suffix);
	contents.insert(streamIndex, prefixRef);
	contents.insert(streamIndex + 2, suffixRef);
	field.acroField.dict.set(PDFName.of('InscribePrefix'), prefixRef);
	field.acroField.dict.set(PDFName.of('InscribeSuffix'), suffixRef);
	field.acroField.dict.set(PDFName.of('InscribeMoveX'), PDFNumber.of(totalX));
	field.acroField.dict.set(PDFName.of('InscribeMoveY'), PDFNumber.of(totalY));
};

export const addPDFContent = async (
	source: PDFDocument,
	placement: ContentPlacement,
	settings: ContentSettings
) => {
	if (
		![placement.x, placement.y, placement.width, placement.height, settings.fontSize].every(
			Number.isFinite
		) ||
		placement.width < 12 ||
		placement.height < 12 ||
		settings.fontSize < 6 ||
		settings.fontSize > 72 ||
		![0, 90, 180, 270].includes(placement.rotation)
	)
		throw new PDFContentError('Vérifiez les dimensions et la taille du texte.');
	const document = await cloneDocument(source);
	const page = document.getPage(placement.page - 1);
	const font = await embedContentFont(document);
	const form = document.getForm();
	registerFormFont(document, font);
	if (settings.kind === 'text') {
		if (!settings.text.trim()) throw new PDFContentError('Saisissez le texte à ajouter.');
		if (!/^#[0-9a-fA-F]{6}$/.test(settings.color))
			throw new PDFContentError('Choisissez une couleur valide.');
		validateText(font, settings.text);
		const lines = wrapText(settings.text, font, settings.fontSize, placement.width);
		const fontHeight = font.heightAtSize(settings.fontSize);
		const lineHeight = Math.max(settings.fontSize * 1.3, fontHeight);
		if (fontHeight + (lines.length - 1) * lineHeight > placement.height)
			throw new PDFContentError(
				'Le texte dépasse la zone. Augmentez sa hauteur ou réduisez la taille du texte.'
			);
		const channels = [1, 3, 5].map(
			(index) => parseInt(settings.color.slice(index, index + 2), 16) / 255
		);
		let index = 1;
		while (form.getFieldMaybe(`__inscribe_text_${index}`)) index++;
		const field = form.createTextField(`__inscribe_text_${index}`);
		field.addToPage(page, {
			x: placement.x,
			y: placement.y,
			width: placement.width,
			height: placement.height,
			rotate: degrees(placement.rotation),
			font,
			textColor: rgb(channels[0], channels[1], channels[2]),
			borderWidth: 0
		});
		field.setFontSize(settings.fontSize);
		field.enableMultiline();
		field.setText('');
		field.acroField.dict.set(PDFName.of('InscribeType'), PDFName.of('PlacedText'));
		field.acroField.dict.set(PDFName.of('InscribeContent'), PDFString.of(lines.join('\n')));
		field.acroField.dict.set(PDFName.of('InscribeFontSize'), PDFNumber.of(settings.fontSize));
		field.acroField.dict.set(PDFName.of('InscribeColor'), PDFString.of(settings.color));
		field.acroField.dict.set(PDFName.of('TU'), PDFString.of('Texte ajouté'));
		field.acroField.getWidgets()[0]?.getAppearanceCharacteristics()?.dict.delete(PDFName.of('BG'));
		field.updateAppearances(font);
		field.enableReadOnly();
		drawPlacedText(page, field, lines.join('\n'), font, settings.fontSize, settings.color);
	} else {
		const name = settings.name.trim();
		if (!name) throw new PDFContentError('Donnez un nom au champ.');
		if (form.getFieldMaybe(name))
			throw new PDFContentError('Ce nom de champ existe déjà. Choisissez un autre nom.');
		if (settings.kind === 'radio') {
			const options = [...new Set(settings.options.map((option) => option.trim()).filter(Boolean))];
			if (options.length < 2) throw new PDFContentError('Ajoutez au moins deux choix au groupe.');
			options.forEach((option) => validateText(font, option));
			const rowHeight = Math.max(20, settings.fontSize * 1.5);
			if (options.length * rowHeight > placement.height)
				throw new PDFContentError('Augmentez la hauteur pour afficher tous les choix.');
			const radioSize = Math.min(16, rowHeight - 2);
			if (placement.width <= radioSize + 6)
				throw new PDFContentError('Augmentez la largeur pour afficher les choix.');
			const radioGroup = form.createRadioGroup(name);
			options.forEach((option, optionIndex) => {
				const rowY = placement.y + placement.height - rowHeight * (optionIndex + 1);
				radioGroup.addOptionToPage(option, page, {
					x: placement.x,
					y: rowY + (rowHeight - radioSize) / 2,
					width: radioSize,
					height: radioSize,
					rotate: degrees(placement.rotation),
					borderWidth: 1,
					borderColor: rgb(0.19, 0.36, 0.3),
					backgroundColor: rgb(1, 1, 1)
				});
				const labelName = `__inscribe_radio_label_${encodeURIComponent(name)}_${optionIndex}`;
				if (form.getFieldMaybe(labelName))
					throw new PDFContentError('Ce nom de champ radio est déjà utilisé.');
				const label = form.createTextField(labelName);
				label.addToPage(page, {
					x: placement.x + radioSize + 6,
					y: rowY,
					width: placement.width - radioSize - 6,
					height: rowHeight,
					rotate: degrees(placement.rotation),
					font,
					textColor: rgb(0.15, 0.16, 0.15),
					borderWidth: 0
				});
				label.setFontSize(Math.min(settings.fontSize, rowHeight - 4));
				label.setText(option);
				label.acroField.dict.set(PDFName.of('InscribeType'), PDFName.of('RadioLabel'));
				label.acroField.dict.set(PDFName.of('IRG'), PDFString.of(name));
				label.acroField.dict.set(PDFName.of('IRO'), PDFNumber.of(optionIndex));
				label.acroField
					.getWidgets()[0]
					?.getAppearanceCharacteristics()
					?.dict.delete(PDFName.of('BG'));
				label.updateAppearances(font);
				label.enableReadOnly();
			});
			setFieldValue(radioGroup, { ...settings, options }, font);
		} else {
			const field =
				settings.kind === 'text-field'
					? form.createTextField(name)
					: settings.kind === 'checkbox'
						? form.createCheckBox(name)
						: form.createDropdown(name);
			field.addToPage(page, {
				x: placement.x,
				y: placement.y,
				width: placement.width,
				height: placement.height,
				rotate: degrees(placement.rotation),
				borderWidth: 1,
				borderColor: rgb(0.19, 0.36, 0.3),
				backgroundColor: rgb(1, 1, 1),
				...(field instanceof PDFCheckBox ? {} : { font, textColor: rgb(0.15, 0.16, 0.15) })
			});
			if (field instanceof PDFTextField || field instanceof PDFDropdown)
				field.setFontSize(Math.min(settings.fontSize, placement.height - 8));
			setFieldValue(field, settings, font);
		}
	}
	return document;
};

export const updateFormField = async (
	source: PDFDocument,
	name: string,
	settings: ContentSettings
) => {
	const document = await cloneDocument(source);
	const field = document.getForm().getField(name);
	if (!(
		field instanceof PDFTextField ||
		field instanceof PDFCheckBox ||
		field instanceof PDFDropdown ||
		field instanceof PDFRadioGroup
	))
		throw new PDFContentError('Ce type de champ ne peut pas être modifié ici.');
	const font = await embedContentFont(document);
	registerFormFont(document, font);
	setFieldValue(field, settings, font);
	return document;
};

export const updatePlacedText = async (source: PDFDocument, name: string, text: string) => {
	if (!text.trim()) throw new PDFContentError('Saisissez le texte à ajouter.');
	const document = await cloneDocument(source);
	const field = document.getForm().getTextField(name);
	if (field.acroField.dict.get(PDFName.of('InscribeType'))?.toString() !== '/PlacedText')
		throw new PDFContentError('Ce bloc de texte ne peut pas être modifié ici.');
	const { widget, page } = getWidgetPage(document, field);
	const font = await embedContentFont(document);
	const rectangle = widget.getRectangle();
	const rawFontSize = field.acroField.dict.get(PDFName.of('InscribeFontSize'));
	const fontSize = rawFontSize instanceof PDFNumber ? rawFontSize.asNumber() : 14;
	const rawColor = field.acroField.dict.get(PDFName.of('InscribeColor'));
	const color = rawColor instanceof PDFString ? rawColor.decodeText() : '#252a27';
	if (!/^#[0-9a-fA-F]{6}$/.test(color))
		throw new PDFContentError('La couleur du texte est invalide.');
	validateText(font, text);
	const lines = wrapText(text, font, fontSize, rectangle.width);
	const fontHeight = font.heightAtSize(fontSize);
	const lineHeight = Math.max(fontSize * 1.3, fontHeight);
	if (fontHeight + (lines.length - 1) * lineHeight > rectangle.height)
		throw new PDFContentError(
			'Le texte dépasse la zone. Réduisez le texte ou utilisez une zone plus grande.'
		);
	removePlacedTextStreams(document, page, field);
	field.acroField.dict.set(PDFName.of('InscribeContent'), PDFString.of(lines.join('\n')));
	drawPlacedText(page, field, lines.join('\n'), font, fontSize, color);
	return document;
};

export const moveFormField = async (
	source: PDFDocument,
	name: string,
	pageNumber: number,
	widgetIndex: number,
	deltaX: number,
	deltaY: number,
	companion?: PDFFormField['companion']
) => {
	if (![deltaX, deltaY].every(Number.isFinite))
		throw new PDFContentError('La position du champ est invalide.');
	const document = await cloneDocument(source);
	const field = document.getForm().getField(name);
	if (!(
		field instanceof PDFTextField ||
		field instanceof PDFCheckBox ||
		field instanceof PDFDropdown ||
		field instanceof PDFRadioGroup
	))
		throw new PDFContentError('Ce type de champ ne peut pas être déplacé ici.');
	const widget = field.acroField.getWidgets()[widgetIndex];
	const page = document.getPage(pageNumber - 1);
	const annotations = page.node.Annots();
	const belongsToPage =
		widget?.P()?.toString() === page.ref.toString() ||
		(!!widget &&
			!!annotations &&
			Array.from({ length: annotations.size() }, (_, index) => annotations.get(index)).some(
				(reference) => document.context.lookup(reference) === widget.dict
			));
	if (!widget || !belongsToPage)
		throw new PDFContentError('Le champ ne se trouve plus sur cette page.');
	const rectangle = widget.getRectangle();
	const companionWidget = companion
		? document.getForm().getTextField(companion.name).acroField.getWidgets()[companion.widgetIndex]
		: undefined;
	const companionRectangle = companionWidget?.getRectangle();
	const cropBox = page.getCropBox();
	const left = Math.min(rectangle.x, companionRectangle?.x ?? rectangle.x);
	const bottom = Math.min(rectangle.y, companionRectangle?.y ?? rectangle.y);
	const right = Math.max(
		rectangle.x + rectangle.width,
		companionRectangle
			? companionRectangle.x + companionRectangle.width
			: rectangle.x + rectangle.width
	);
	const top = Math.max(
		rectangle.y + rectangle.height,
		companionRectangle
			? companionRectangle.y + companionRectangle.height
			: rectangle.y + rectangle.height
	);
	const x = Math.max(
		cropBox.x,
		Math.min(left + deltaX, cropBox.x + cropBox.width - (right - left))
	);
	const y = Math.max(
		cropBox.y,
		Math.min(bottom + deltaY, cropBox.y + cropBox.height - (top - bottom))
	);
	const actualDeltaX = x - left;
	const actualDeltaY = y - bottom;
	widget.setRectangle({
		...rectangle,
		x: rectangle.x + actualDeltaX,
		y: rectangle.y + actualDeltaY
	});
	if (companionWidget && companionRectangle)
		companionWidget.setRectangle({
			...companionRectangle,
			x: companionRectangle.x + x - left,
			y: companionRectangle.y + y - bottom
		});
	if (
		field instanceof PDFTextField &&
		field.acroField.dict.get(PDFName.of('InscribeType'))?.toString() === '/PlacedText'
	)
		translatePlacedText(document, page, field, actualDeltaX, actualDeltaY);
	return document;
};

export const removeFormField = async (source: PDFDocument, name: string) => {
	const document = await cloneDocument(source);
	const form = document.getForm();
	const field = form.getField(name);
	if (
		field instanceof PDFTextField &&
		field.acroField.dict.get(PDFName.of('InscribeType'))?.toString() === '/PlacedText'
	) {
		const { page } = getWidgetPage(document, field);
		removePlacedTextStreams(document, page, field);
	}
	if (field instanceof PDFRadioGroup) {
		for (const candidate of form.getFields()) {
			if (
				candidate instanceof PDFTextField &&
				candidate.acroField.dict.get(PDFName.of('IRG')) instanceof PDFString &&
				(candidate.acroField.dict.get(PDFName.of('IRG')) as PDFString).decodeText() === name
			)
				form.removeField(candidate);
		}
	}
	form.removeField(field);
	return document;
};
