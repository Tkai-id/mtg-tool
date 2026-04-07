
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { transcript } = req.body;
  const openaiKey = process.env.OPENAI_API_KEY;

  const PROMPT = `あなたは優秀な営業企画・カスタマーサクセス担当者です。
以下の会話ログを読み取り、デルモの顧客情報として整理された議事録を作成してください。

■前提
・田中・大槻は社内メンバー
・それ以外はクライアント
・本要約では「示唆・提案」は一切不要（事実ベースのみ）

■最重要ルール
・①「商材状況のヒアリング」を最も重要な項目として詳しく整理する
・同じ内容を複数項目に記載しない（重複は禁止）
・該当する内容がない場合は「言及なし」と記載する
・デルモに対するネガティブ発言は必ず⑥に整理する
・事実のみを簡潔にまとめる（推測は禁止）

■出力フォーマット
① 商材状況のヒアリング（最重要）
以下の観点で整理する

現在実施している広告案件・商材
・現在配信している商材
・最近増えた案件
・直近スタートした案件

好調な案件
・CVが良い
・配信拡大している
・クライアントが注力している商材

シュリンクしている案件
・配信停止
・予算縮小
・成果悪化

これから拡大予定の案件
・新規テスト予定
・今後力を入れる商材

クリエイティブ傾向
・勝ちパターン
・訴求傾向
・使われている素材傾向
※素材の話はここにまとめる（ニーズと重複させない）

② サービス利用状況（デルモ）
・デルモの利用頻度
・誰が主に使っているか
・素材の使い方（広告 / 記事 / SNSなど）
・社内での共有方法
・利用体制
※素材のニーズは③に記載するためここには書かない

③ ニーズ・要望
以下を整理

欲しい素材
・モデル
・シチュエーション
・商材ジャンル
・ビフォーアフターなど

欲しい機能
・検索
・共有
・管理
・その他機能
※素材の「利用傾向」は①に記載する
※ここは要望のみ

④ デルモ利用に関するその他情報
以下を整理
・ポイント利用状況
・オーダー撮影への関心
・撮影地域の話
・契約状況
・その他デルモに関する情報

⑤ 広告ノウハウ・運用情報
会話の中で出た以下の情報
・広告運用方法
・クリエイティブ制作フロー
・AI活用
・分析方法
・ツール利用

⑥ デルモに対するネガティブ発言
以下を整理
・素材不足
・素材が使いづらい
・機能が使いづらい
・料金に対する不満
・競合サービスの方が良いという発言
・その他不満
※デルモに対するネガティブな発言は必ずここにまとめる
※他の項目には書かない

■出力ルール
・情報は箇条書きで整理
・重複記載は禁止
・推測は禁止
・事実のみ記載

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
