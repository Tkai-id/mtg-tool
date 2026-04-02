export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, client, date, content, transcript } = req.body;
  const notionKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DB_ID;

  function toBlocks(text) {
    const lines = text.split('\n');
    const blocks = [];
    for (const line of lines) {
      if (line.length === 0) {
        blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } });
        continue;
      }
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

  // チャンクに分割（100ブロックずつ）
  function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  const summaryBlocks = toBlocks(content);
  const transcriptBlocks = toBlocks(transcript);

  // まずページを作成（要約のみ）
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
      children: summaryBlocks.slice(0, 99),
    })
  });

  const pageData = await response.json();
  if (!response.ok) return res.status(response.status).json(pageData);

  const pageId = pageData.id;

  // 要約の残りを追記
  const remainingSummary = summaryBlocks.slice(99);
  for (const chunk of chunkArray(remainingSummary, 99)) {
    await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({ children: chunk })
    });
  }

  // 文字起こしのトグルヘッダーを追記
  await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      children: [{
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{ type: 'text', text: { content: '▼ 元の文字起こし' } }],
          children: transcriptBlocks.slice(0, 99)
        }
      }]
    })
  });

  // 文字起こしの残りをトグル内に追記
  // トグルブロックのIDを取得
  const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    headers: {
      'Authorization': `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
    }
  });
  const blocksData = await blocksRes.json();
  const toggleBlock = blocksData.results.find(b => b.type === 'toggle');

  if (toggleBlock && transcriptBlocks.length > 99) {
    const remainingTranscript = transcriptBlocks.slice(99);
    for (const chunk of chunkArray(remainingTranscript, 99)) {
      await fetch(`https://api.notion.com/v1/blocks/${toggleBlock.id}/children`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${notionKey}`,
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({ children: chunk })
      });
    }
  }

  res.status(200).json(pageData);
}
