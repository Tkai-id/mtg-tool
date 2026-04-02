export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, client, date, content, transcript } = req.body;

  const notionKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DB_ID;

  const summaryParagraphs = content.split('\n').map(line => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: line } }]
    }
  }));

  // 文字起こしを折りたたみブロックに
  const transcriptLines = transcript.split('\n').map(line => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: line } }]
    }
  }));

  const children = [
    ...summaryParagraphs,
    {
      object: 'block',
      type: 'toggle',
      toggle: {
        rich_text: [{ type: 'text', text: { content: '▼ 元の文字起こし' } }],
        children: transcriptLines.slice(0, 100)
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
