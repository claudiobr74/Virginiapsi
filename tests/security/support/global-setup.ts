import { resetDatabase } from "./db";

export default async function setup() {
  await resetDatabase();
}
