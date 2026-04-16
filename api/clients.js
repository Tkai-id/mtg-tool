export default async function handler(req, res) {
  try {
    const gasUrl = process.env.GAS_CLIENT_URL;

    if (!gasUrl) {
      return res.status(500).json({ error: "GAS_CLIENT_URL is not set" });
    }

    const response = await fetch(gasUrl, { redirect: "follow" });
    const data = await response.json();

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    return res.status(200).json({ clients: data.clients });
  } catch (err) {
    console.error("Client list fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch client list" });
  }
}
