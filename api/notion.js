export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, client, date, content, transcript } = req.body;
  const notionKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DB_ID;

  // 2000文字以内に分割する関数
  function toBlocks(text) {
    const lines = text.split('\n');
    const blocks = [];
    for (const line of lines) {
      if (line.length === 0) {
        blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } });
        continue;
      }
      // 2000文字を超える行は分割
      let remaining = line;
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, 1999);
        remaining = remaining.slice(1999);
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: chunk } }]
          }
        });
      }
    }
    return blocks;
  }

  const summaryBlocks = toBlocks(content);
  const transcriptBlocks = toBlocks(transcript);

  // Notionは1リクエストで最大100ブロックまで
  const children = [
    ...summaryBlocks.slice(0, 90),
    {
      object: 'block',
      type: 'toggle',
      toggle: {
        rich_text: [{ type: 'text', text: { content: '▼ 元の文字起こし' } }],
        children: transcriptBlocks.slice(0, 90)
      }
    }
  ];

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        '名前': { title: [{ text: { content: title } }] },
        'クライアント名': { rich_text: [{ text: { content: client } }] },
        'MTG日': { date: { start: date } },
      },
      children,
    })
  });

  const data = await response.json();
  if (!response.ok) return res.status(response.status).json(data);
  res.status(200).json(data);
}
