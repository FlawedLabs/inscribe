import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Referenced by the component generator's utilities alias in components.json.
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
