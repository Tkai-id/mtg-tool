import { requirePassword } from "../lib/auth.js";

// パスワード検証専用。合っていれば 200、違えば 401。
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requirePassword(req, res)) return;
  return res.status(200).json({ ok: true });
}
