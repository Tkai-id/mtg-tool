
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { transcript } = req.body;
  const openaiKey = process.env.OPENAI_API_KEY;

  const PROMPT = `以下は定例MTGの議事録です。
クライアント視点を中心に、事実ベースで要約してください。

# ■前提
・「示唆・提案・考察」は不要
・あくまで発言内容ベースの要約のみ
・主語は基本クライアント
・情報の重複はまとめる
・重要な意思・スタンス・温度感は必ず残す

# ■登場人物
・田中 / 大槻：社内メンバー
・その他：クライアント
※クライアントの発言・意向を優先して整理すること

# ■出力フォーマット
■ 定例MTG 議事録要約（クライアント中心）

① サービス利用状況・業務状況
- 

② 課題・現状認識
- 

③ ニーズ・要望
- 

④ サービスに対する評価・反応
- 

⑤ 具体的な検討事項・意思
- 

⑥ 運用・体制・環境に関する情報
- 

⑦ その他重要事項
- 

⑧ 次回・アクション（決まっていれば）
- 

# ■補足ルール
・抽象化しすぎず、具体性は残す
・「〜とのこと」「〜と認識」などの断定しすぎない表現でまとめる
・長すぎず、1項目3〜5行以内を目安
・重要度の低い雑談は省略
・クライアントの「温度感（前向き / 検討 / 消極的）」が分かる表現は残す

では、以下の議事録を要約してください。

${transcript}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: PROMPT }],
      max_tokens: 2000,
      temperature: 0.3,
    })
  });

  const data = await response.json();
  if (!response.ok) return res.status(response.status).json(data);
  res.status(200).json({ summary: data.choices[0].message.content });
}
