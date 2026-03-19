export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { notionKey, databaseId, title, client, date, content } = req.body;

  const paragraphs = content.split('\n').map(line => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: line } }]
    }
  }));

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
        Name: { title: [{ text: { content: title } }] },
        クライアント名: { rich_text: [{ text: { content: client } }] },
        MTG日: { date: { start: date } },
      },
      children: paragraphs,
    })
  });

  const data = await response.json();
  if (!response.ok) return res.status(response.status).json(data);
  res.status(200).json(data);
}
