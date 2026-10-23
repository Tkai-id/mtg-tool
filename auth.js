import { timingSafeEqual } from "node:crypto";

// 共有パスワード認証。環境変数 APP_PASSWORD と x-app-password ヘッダーを比較する。
// APP_PASSWORD 未設定時は安全側（全拒否）に倒す。
export function requirePassword(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: "APP_PASSWORD is not configured" });
    return false;
  }
  const given = String(req.headers["x-app-password"] || "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}
