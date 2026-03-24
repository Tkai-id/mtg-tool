export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { year, month } = req.body;
  const notionKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DB_ID;

  // 対象月の開始・終了日
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // Notionからその月の議事録を取得
  const queryRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'MTG日', date: { on_or_after: startDate } },
          { property: 'MTG日', date: { on_or_before: endDate } },
        ]
      },
      sorts: [{ property: 'MTG日', direction: 'ascending' }],
    })
  });

  const queryData = await queryRes.json();
  if (!queryRes.ok) return res.status(queryRes.status).json(queryData);

  const pages = queryData.results;
  if (pages.length === 0) {
    return res.status(200).json({ summary: null, count: 0 });
  }

  // 各ページの本文を取得
  const contents = await Promise.all(pages.map(async page => {
    const client = page.properties['クライアント名']?.rich_text?.[0]?.text?.content || '不明';
    const date = page.properties['MTG日']?.date?.start || '';

    const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
      }
    });
    const blocksData = await blocksRes.json();
    const text = blocksData.results
      .map(b => b.paragraph?.rich_text?.map(t => t.text?.content).join('') || '')
      .filter(t => t.length > 0)
      .join('\n');

    return `【${client}（${date}）】\n${text}`;
  }));

  const allContent = contents.join('\n\n---\n\n');

  // GPTで月次サマリーを生成
  const prompt = `以下は${year}年${month}月の定例MTG議事録（全${pages.length}社分）です。
全クライアントの情報を横断的に分析して、以下のフォーマットで月次サマリーを作成してください。

# ■出力フォーマット
■ ${year}年${month}月 月次サマリー（全${pages.length}社）

① 素材・コンテンツニーズのまとめ
- （複数社に共通するニーズ、具体的な素材種別を記載）

② 課題・困りごとの共通パターン
- （複数社に共通する課題や悩みを記載）

③ 温度感が下がっているクライアント
- （消極的・懸念・不満などの発言があったクライアントを列挙）

④ 今月特に重要な動きがあったクライアント
- （意思決定・大きな変化・重要な検討が進んでいるクライアントを列挙）

# ■補足ルール
・具体的なクライアント名を出す
・抽象的にまとめすぎず、具体性を残す
・重要度の低い情報は省略

では以下の議事録を分析してください。

${allContent}`;

  const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
      temperature: 0.3,
    })
  });

  const gptData = await gptRes.json();
  if (!gptRes.ok) return res.status(gptRes.status).json(gptData);

  const summary = gptData.choices[0].message.content;

  // Notionにサマリーページを保存
  const pageTitle = `${year}年${month}月 月次サマリー`;
  const paragraphs = summary.split('\n').map(line => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: line } }] }
  }));

  const notionRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        '名前': { title: [{ text: { content: pageTitle } }] },
        'クライアント名': { rich_text: [{ text: { content: '月次サマリー' } }] },
        'MTG日': { date: { start: startDate } },
      },
      children: paragraphs,
    })
  });

  const notionData = await notionRes.json();
  if (!notionRes.ok) return res.status(notionRes.status).json(notionData);

  res.status(200).json({ summary, count: pages.length, notionUrl: notionData.url });
}
