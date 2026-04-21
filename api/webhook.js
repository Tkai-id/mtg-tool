export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    var body = req.body;

    // Verify webhook secret if set
    var webhookSecret = process.env.TLDV_WEBHOOK_SECRET;
    if (webhookSecret) {
      var headerSecret = req.headers["x-webhook-secret"] || req.headers["authorization"];
      if (headerSecret !== webhookSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    // Accept both MeetingReady and TranscriptReady
    var event = body.event;
    if (event !== "TranscriptReady" && event !== "MeetingReady") {
      return res.status(200).json({ message: "Event ignored: " + event });
    }

    // Get meeting ID
    var meetingId = body.data?.meetingId || body.data?.id;
    if (!meetingId) {
      return res.status(400).json({ error: "No meeting ID found" });
    }

    var tldvKey = process.env.TLDV_API_KEY;
    var openaiKey = process.env.OPENAI_API_KEY;
    var notionKey = process.env.NOTION_API_KEY;
    var notionDbId = process.env.NOTION_DB_ID;

    if (!tldvKey || !openaiKey || !notionKey || !notionDbId) {
      return res.status(500).json({ error: "Missing environment variables" });
    }

    // ---- Step 1: Fetch meeting details from tldv ----
    var meetingRes = await fetch(
      "https://pasta.tldv.io/v1alpha1/meetings/" + meetingId,
      { headers: { "x-api-key": tldvKey } }
    );
    if (!meetingRes.ok) {
      return res.status(502).json({ error: "Failed to fetch meeting: " + meetingRes.status });
    }
    var meeting = await meetingRes.json();
    var meetingName = meeting.name || "";
    var meetingDate = meeting.happenedAt || new Date().toISOString();

    // ---- Step 2: Parse client name from title ----
    // Format: "定例会：prisma様" or "定例会:prisma様"
    var clientName = "";
    if (meetingName.includes("\uff1a")) {
      clientName = meetingName.split("\uff1a")[1] || "";
    } else if (meetingName.includes(":")) {
      clientName = meetingName.split(":")[1] || "";
    }
    clientName = clientName.replace(/様$/, "").trim();

    // Match against client list from GAS
    var gasUrl = process.env.GAS_CLIENT_URL;
    var gasSecret = process.env.GAS_SECRET;
    var matchedClient = clientName;

    if (gasUrl && gasSecret) {
      try {
        var clientRes = await fetch(gasUrl + "?key=" + gasSecret, { redirect: "follow" });
        var clientData = await clientRes.json();
        var clients = clientData.clients || [];

        // Fuzzy match: find client that contains the parsed name
        var lowerName = clientName.toLowerCase();
        var found = clients.find(function (c) {
          return c.toLowerCase().includes(lowerName) || lowerName.includes(c.toLowerCase());
        });
        if (found) {
          matchedClient = found;
        }
      } catch (e) {
        console.error("Client list fetch error:", e);
      }
    }

    if (!matchedClient) {
      matchedClient = meetingName; // fallback to full title
    }

    // ---- Step 3: Fetch transcript from tldv ----
    var transcriptRes = await fetch(
      "https://pasta.tldv.io/v1alpha1/meetings/" + meetingId + "/transcript",
      { headers: { "x-api-key": tldvKey } }
    );
    if (!transcriptRes.ok) {
      return res.status(502).json({ error: "Failed to fetch transcript: " + transcriptRes.status });
    }
    var transcriptData = await transcriptRes.json();
    var segments = transcriptData.data || [];

    // Build readable transcript
    var transcript = segments
      .map(function (s) { return (s.speaker || "Unknown") + ": " + s.text; })
      .join("\n");

    if (!transcript || transcript.trim() === "") {
      return res.status(200).json({ message: "Empty transcript, skipped" });
    }

    // ---- Step 4: GPT summary ----
    var gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + openaiKey,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "あなたは議事録作成アシスタントです。MTGの文字起こしを受け取り、以下のフォーマットで要約してください。\n\n" +
              "## 要約\n（3〜5行で全体の要約）\n\n" +
              "## 決定事項\n（箇条書き）\n\n" +
              "## TODO / ネクストアクション\n（担当者がわかれば明記）\n\n" +
              "## 主な議題と内容\n（議題ごとに簡潔にまとめる）",
          },
          {
            role: "user",
            content: "以下の文字起こしを要約してください。\n\nクライアント名: " + matchedClient + "\n\n" + transcript,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    var gptData = await gptRes.json();
    var summary = gptData.choices?.[0]?.message?.content || "要約に失敗しました";

    // ---- Step 5: Save to Notion ----
    var dateOnly = meetingDate.split("T")[0];
    var pageTitle = matchedClient + "  定例MTG " + dateOnly;

    // Build Notion blocks: summary + toggle with original transcript
    var blocks = [
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "要約" } }],
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: summary.substring(0, 2000) } }],
        },
      },
    ];

    // Add remaining summary if over 2000 chars
    if (summary.length > 2000) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: summary.substring(2000, 4000) } }],
        },
      });
    }

    // Add toggle with original transcript
    var transcriptChunks = [];
    for (var i = 0; i < transcript.length; i += 2000) {
      transcriptChunks.push(transcript.substring(i, i + 2000));
    }

    blocks.push({
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [{ type: "text", text: { content: "元の文字起こし" } }],
        children: transcriptChunks.map(function (chunk) {
          return {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: chunk } }],
            },
          };
        }),
      },
    });

    var notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + notionKey,
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: notionDbId },
        properties: {
          "名前": {
            title: [{ text: { content: pageTitle } }],
          },
          "クライアント名": {
            rich_text: [{ text: { content: matchedClient } }],
          },
          "MTG日": {
            date: { start: dateOnly },
          },
        },
        children: blocks,
      }),
    });

    if (!notionRes.ok) {
      var notionErr = await notionRes.json();
      console.error("Notion error:", JSON.stringify(notionErr));
      return res.status(502).json({ error: "Notion save failed", detail: notionErr });
    }

    var notionPage = await notionRes.json();

    return res.status(200).json({
      success: true,
      client: matchedClient,
      meetingName: meetingName,
      notionUrl: notionPage.url,
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
