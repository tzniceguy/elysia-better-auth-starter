import { nanoid } from "nanoid";
import { v7 as uuidv7 } from "uuid";

export function generatePublicId() {
	return nanoid(8);
}
export function generateId() {
	return uuidv7();
}
