export default async function handler(req, res) {
  try {
    var gasUrl = process.env.GAS_CLIENT_URL;
    var gasSecret = process.env.GAS_SECRET;

    if (!gasUrl || !gasSecret) {
      return res.status(500).json({ error: "Environment variables not set" });
    }

    var response = await fetch(gasUrl + "?key=" + gasSecret, {
      redirect: "follow"
    });
    var data = await response.json();

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    return res.status(200).json({ clients: data.clients });
  } catch (err) {
    console.error("Client list fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch client list" });
  }
}
